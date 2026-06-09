/**
 * songsCache.js
 *
 * Cache in-memory singleton para canciones (catalogo + detalles) con
 * persistencia en sessionStorage. TTL 5min, LRU cap 500 songs / 30 listings.
 * Sirve para que tab-switch entre /bible y /songs no recargue todo, y
 * para devolver resultados instantaneamente cuando hay cache hit.
 *
 * sessionStorage en vez de localStorage: los datos son ephemeral por sesion
 * y pueden ser grandes (200 KB con catalogo grande). Vacio al cerrar tab.
 *
 * API:
 *   getListing(key) / setListing(key, value)
 *   getSong(id)     / setSong(song)
 *   invalidate(scope)  scope='all' | 'listing' | number[]
 *   setServerVersion(n) / getServerVersion()
 *   onChange(cb)        callback al invalidar/set para que hooks rerendren
 */

const TTL_MS = 5 * 60 * 1000
const SONGS_CAP = 500
const LISTINGS_CAP = 30
const STORAGE_KEY = 'eclesia.songs.cache.v1'
const PERSIST_DEBOUNCE_MS = 1000

// Map<id, {song, ts}>. Map preserva insertion order para LRU.
const _songs = new Map()
// Map<listingKey, {items, count, hasMore, ts}>.
const _listings = new Map()
let _serverVersion = null
const _subs = new Set()

let _persistTimer = null

// ---------------- Hydrate from sessionStorage ----------------

function _safeSessionStorage() {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage || null
  } catch { return null }
}

function _hydrate() {
  const ss = _safeSessionStorage()
  if (!ss) return
  try {
    const raw = ss.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data?.songs)) {
      for (const [id, value] of data.songs) {
        if (Number.isInteger(id) && value && value.song) {
          _songs.set(id, value)
        }
      }
    }
    if (Array.isArray(data?.listings)) {
      for (const [key, value] of data.listings) {
        if (typeof key === 'string' && value && Array.isArray(value.items)) {
          _listings.set(key, value)
        }
      }
    }
    if (typeof data?.serverVersion === 'number') _serverVersion = data.serverVersion
  } catch {
    // Silencioso: cache corrupto, lo descartamos.
  }
}

function _schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer)
  _persistTimer = setTimeout(_persistNow, PERSIST_DEBOUNCE_MS)
}

function _persistNow() {
  _persistTimer = null
  const ss = _safeSessionStorage()
  if (!ss) return
  try {
    const payload = {
      songs: Array.from(_songs.entries()),
      listings: Array.from(_listings.entries()),
      serverVersion: _serverVersion,
    }
    ss.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // QuotaExceededError u otro — degradamos a no-cache silencioso.
  }
}

// ---------------- LRU ----------------

function _touchSong(id) {
  const v = _songs.get(id)
  if (!v) return
  _songs.delete(id)
  _songs.set(id, v)
}

function _evictSongs() {
  while (_songs.size > SONGS_CAP) {
    const oldest = _songs.keys().next().value
    if (oldest === undefined) break
    _songs.delete(oldest)
  }
}

function _evictListings() {
  while (_listings.size > LISTINGS_CAP) {
    const oldest = _listings.keys().next().value
    if (oldest === undefined) break
    _listings.delete(oldest)
  }
}

// ---------------- Public API ----------------

export function makeListingKey({ q = '', limit = 50, offset = 0 } = {}) {
  return `${q || ''}|${limit}|${offset}`
}

export function getListing(key) {
  const v = _listings.get(key)
  if (!v) return null
  if (Date.now() - v.ts > TTL_MS) {
    _listings.delete(key)
    return null
  }
  // Touch LRU
  _listings.delete(key)
  _listings.set(key, v)
  return { items: v.items, count: v.count, hasMore: v.hasMore, ts: v.ts }
}

export function setListing(key, value) {
  if (!value || !Array.isArray(value.items)) return
  _listings.set(key, {
    items: value.items,
    count: typeof value.count === 'number' ? value.count : value.items.length,
    hasMore: !!value.hasMore,
    ts: Date.now(),
  })
  _evictListings()
  _schedulePersist()
  _notify({ type: 'listing-set', key })
}

export function getSong(id) {
  const v = _songs.get(id)
  if (!v) return null
  if (Date.now() - v.ts > TTL_MS) {
    _songs.delete(id)
    return null
  }
  _touchSong(id)
  return v.song
}

export function setSong(song) {
  if (!song || !Number.isInteger(song.id)) return
  _songs.set(song.id, { song, ts: Date.now() })
  _evictSongs()
  _schedulePersist()
  _notify({ type: 'song-set', id: song.id })
}

/**
 * Invalida cache.
 * @param {'all'|'listing'|Array<number>} scope
 */
export function invalidate(scope) {
  if (scope === 'all') {
    _songs.clear()
    _listings.clear()
  } else if (scope === 'listing') {
    _listings.clear()
  } else if (Array.isArray(scope)) {
    for (const id of scope) {
      if (Number.isInteger(id)) _songs.delete(id)
    }
    // Cualquier listing cacheada podria contener un id editado/borrado
    // en orden distinto → invalidacion conservadora total de listings.
    _listings.clear()
  }
  _schedulePersist()
  _notify({ type: 'invalidate', scope })
}

export function setServerVersion(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const changed = _serverVersion !== v
    _serverVersion = v
    if (changed) _schedulePersist()
  }
}

export function getServerVersion() {
  return _serverVersion
}

export function onChange(cb) {
  if (typeof cb !== 'function') return () => {}
  _subs.add(cb)
  let active = true
  return () => {
    if (!active) return
    active = false
    _subs.delete(cb)
  }
}

function _notify(event) {
  for (const cb of Array.from(_subs)) {
    try { cb(event) } catch { /* swallow */ }
  }
}

// ---------------- Test helpers ----------------

export function __resetForTests() {
  _songs.clear()
  _listings.clear()
  _serverVersion = null
  _subs.clear()
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null }
  const ss = _safeSessionStorage()
  if (ss) { try { ss.removeItem(STORAGE_KEY) } catch {} }
}

export function __sizes() {
  return { songs: _songs.size, listings: _listings.size }
}

// Hidrata al import.
_hydrate()
