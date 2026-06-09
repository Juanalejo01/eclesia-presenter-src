// src/server/songsCatalog.js
//
// Catalogo de canciones server-side para los endpoints /api/songs/list y
// /api/songs/:id. El catalogo NO se carga desde SQLite directo: el main
// process inyecta los datos via setSnapshot(songs[]) cada vez que cambia
// (creacion, edicion, borrado, import). Asi el modulo es puramente
// in-memory y testeable sin DB.
//
// Por que un modulo aparte (no inline en server.js): coincide con el
// patron de bibleSearch — logica pura testeable + rate-limit per-device.
// Mantiene server.js delgado y permite tests aislados sin pasar por HTTP.
//
// Match logic: replica songMatchesQuery del renderer (normalizacion sin
// tildes) para paridad UX. La query matchea title/author/tags/letra de
// secciones, con campo matchKind para que el cliente pinte un badge "Letra".

// ---------------- Normalizacion ----------------

/**
 * Normaliza para matching tolerante a acentos/mayusculas.
 * Comparte semantica con bibleSearch.bookmap.normalizeText.
 */
function normalizeText(s) {
  if (s == null) return ''
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sanea la query del usuario: trim, collapse whitespace, cap 200 chars.
 * Aplicada server-side ANTES de matchear; el cliente la replica como
 * defense-in-depth.
 */
function sanitizeQuery(s) {
  if (s == null) return ''
  return String(s).slice(0, 200).replace(/\s+/g, ' ').trim()
}

// ---------------- Catalogo in-memory ----------------

// Snapshot completo: Array<song> tal como llega de db.listSongs({}).
// Las secciones se persisten como objeto { type, label, text, ... }.
let _snapshot = []
let _serverVersion = Date.now()

/**
 * Inyecta el catalogo completo. Llamado desde main.js al boot y tras
 * cada mutacion (create/update/delete/import) o al recibir cambios
 * remotos del cloud sync.
 * Incrementa serverVersion para que clientes detecten cache stale.
 *
 * @param {Array<object>} songs
 */
function setSnapshot(songs) {
  _snapshot = Array.isArray(songs) ? songs : []
  _serverVersion = Date.now()
}

function getSnapshot() {
  return _snapshot
}

function getServerVersion() {
  return _serverVersion
}

// ---------------- Match helpers ----------------

/**
 * @param {object} song
 * @param {string} qNorm query ya normalizada
 * @returns {null | {kind:'title'|'author'|'tags'|'lyric', snippet?:string}}
 */
function matchSong(song, qNorm) {
  if (!qNorm) return { kind: 'title' }  // sin query: match siempre

  if (normalizeText(song.title).includes(qNorm)) return { kind: 'title' }
  if (song.author && normalizeText(song.author).includes(qNorm)) return { kind: 'author' }
  if (song.tags && normalizeText(song.tags).includes(qNorm)) return { kind: 'tags' }

  // Letra: busca en sections[].text.
  const sections = Array.isArray(song.sections) ? song.sections : []
  for (const sec of sections) {
    const text = String(sec?.text || '')
    if (!text) continue
    const normText = normalizeText(text)
    if (normText.includes(qNorm)) {
      const snippet = findLyricSnippet(text, qNorm)
      return { kind: 'lyric', snippet }
    }
  }
  return null
}

/**
 * Extrae un snippet centrado alrededor del primer match, ~60 chars,
 * con ellipsis si se truncó.
 * @param {string} fullText
 * @param {string} qNorm
 * @returns {string}
 */
function findLyricSnippet(fullText, qNorm) {
  const normFull = normalizeText(fullText)
  const idx = normFull.indexOf(qNorm)
  if (idx < 0) return fullText.slice(0, 60)
  const start = Math.max(0, idx - 24)
  const end = Math.min(fullText.length, idx + qNorm.length + 36)
  let snippet = fullText.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < fullText.length) snippet = snippet + '…'
  return snippet
}

// ---------------- API publica del catalogo ----------------

/**
 * Lista paginada con filtro opcional.
 * @param {{q?:string, limit?:number, offset?:number}} opts
 * @returns {{items:Array, count:number, hasMore:boolean, serverVersion:number}}
 */
function listSongs(opts = {}) {
  const q = sanitizeQuery(opts.q || '')
  const qNorm = normalizeText(q)
  const limit = clampInt(opts.limit, 1, 200, 50)
  const offset = clampInt(opts.offset, 0, 100000, 0)

  const matched = []
  for (const song of _snapshot) {
    const m = matchSong(song, qNorm)
    if (!m) continue
    matched.push({ song, kind: m.kind, snippet: m.snippet })
  }
  // Orden alfabetico por title (case-insensitive). Stable porque _snapshot
  // ya viene ordenado desde db.listSongs(ORDER BY title COLLATE NOCASE).
  matched.sort((a, b) => normalizeText(a.song.title).localeCompare(normalizeText(b.song.title)))

  const total = matched.length
  const slice = matched.slice(offset, offset + limit)
  const items = slice.map(({ song, kind, snippet }) => toListItem(song, kind, qNorm ? snippet : undefined))
  return {
    items,
    count: total,
    hasMore: offset + items.length < total,
    serverVersion: _serverVersion,
  }
}

/**
 * Devuelve el detalle completo de una cancion con sus secciones.
 * sectionId sintetico: 's_<index>' porque el modelo no asigna id por seccion.
 * @param {number} id
 * @returns {{ok:true, song:object} | {ok:false, error:string}}
 */
function getSong(id) {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'invalid_id' }
  }
  const song = _snapshot.find(s => s && s.id === id)
  if (!song) return { ok: false, error: 'song_not_found' }
  return { ok: true, song: toDetail(song) }
}

// ---------------- Shape mappers ----------------

function toListItem(song, matchKind, snippet) {
  return {
    id: song.id,
    title: String(song.title || ''),
    author: song.author || null,
    tags: song.tags || null,
    sectionsCount: Array.isArray(song.sections) ? song.sections.length : 0,
    isFavorite: !!song.is_favorite,
    updatedAt: typeof song.updated_at === 'number' ? song.updated_at : null,
    matchKind,
    ...(snippet ? { snippet } : {}),
  }
}

function toDetail(song) {
  const sections = Array.isArray(song.sections) ? song.sections : []
  return {
    id: song.id,
    title: String(song.title || ''),
    author: song.author || null,
    tags: song.tags || null,
    isFavorite: !!song.is_favorite,
    sections: sections.map((sec, i) => {
      const text = String(sec?.text || '')
      return {
        sectionId: `s_${i}`,
        sectionIndex: i,
        type: String(sec?.type || ''),
        label: String(sec?.label || `Sección ${i + 1}`),
        text,
        lineCount: text ? text.split(/\r?\n/).length : 0,
      }
    }),
    updatedAt: typeof song.updated_at === 'number' ? song.updated_at : null,
    themeOverride: song.theme_override || null,
  }
}

// ---------------- Utils ----------------

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback
  const i = Math.trunc(n)
  if (i < min) return min
  if (i > max) return max
  return i
}

// ---------------- Rate-limit per-device ----------------
//
// Sliding window 60s, 30 req/min. NO compartimos bucket con bibleSearch
// porque queremos que un usuario con dos features no se autobloquee.

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const _rateMap = new Map()

/**
 * @param {string} deviceId
 * @returns {{allowed:true} | {allowed:false, retryAfterMs:number}}
 */
function checkRateLimit(deviceId) {
  const now = Date.now()
  const id = String(deviceId || 'unknown')
  let arr = _rateMap.get(id)
  if (!arr) { arr = []; _rateMap.set(id, arr) }
  while (arr.length > 0 && arr[0] <= now - RATE_WINDOW_MS) arr.shift()
  if (arr.length >= RATE_MAX) {
    const retryAfterMs = arr[0] + RATE_WINDOW_MS - now
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) }
  }
  arr.push(now)
  return { allowed: true }
}

// ---------------- Test helpers ----------------

function __resetForTests() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetForTests no disponible en producción')
  }
  _snapshot = []
  _serverVersion = Date.now()
  _rateMap.clear()
}

module.exports = {
  // public
  setSnapshot,
  getSnapshot,
  getServerVersion,
  listSongs,
  getSong,
  checkRateLimit,
  // utils
  sanitizeQuery,
  normalizeText,
  matchSong,
  findLyricSnippet,
  // constants
  RATE_WINDOW_MS,
  RATE_MAX,
  // test
  __resetForTests,
}
