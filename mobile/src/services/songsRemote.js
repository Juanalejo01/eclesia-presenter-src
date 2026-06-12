/**
 * songsRemote.js
 *
 * Cliente HTTP de los endpoints /api/songs/list y /api/songs/:id del
 * desktop. Mismo patron que bibleRemote.js: Bearer auth via loadCredentials,
 * AbortController para abort, timeout 8s, mapeo de errores estable.
 *
 * Shape de respuesta:
 *   list:  { ok, count, items, hasMore, serverVersion }
 *   get:   { ok, song }
 *   error: { ok:false, error, status?, retryAfterMs? }
 */
import { loadCredentials } from './transportStorage.js'

const DEFAULT_TIMEOUT_MS = 8000

function deriveHttpBase(wsUrl) {
  if (typeof wsUrl !== 'string') return null
  try {
    const u = new URL(wsUrl)
    const proto = u.protocol === 'wss:' ? 'https:' : 'http:'
    return `${proto}//${u.host}`
  } catch {
    return null
  }
}

function sanitizeQuery(q) {
  if (q == null) return ''
  return String(q).slice(0, 200).replace(/\s+/g, ' ').trim()
}

/**
 * Compone dos AbortSignal. Polyfill mínimo (AbortSignal.any falta en WebView viejo).
 *
 * Devuelve { signal, cleanup }: cleanup DEBE llamarse al terminar el fetch
 * (finally) — sin él, el listener 'abort' del signal externo queda colgado
 * reteniendo el closure de cada request completada.
 */
function composeSignals(external, internal) {
  if (!external) return { signal: internal, cleanup: () => {} }
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (external.aborted) ctrl.abort()
  else external.addEventListener('abort', onAbort, { once: true })
  if (internal.aborted) ctrl.abort()
  else internal.addEventListener('abort', onAbort, { once: true })
  return {
    signal: ctrl.signal,
    cleanup: () => {
      external.removeEventListener('abort', onAbort)
      internal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * GET /api/songs/list?q=&limit=&offset=
 * @param {{q?:string, limit?:number, offset?:number, signal?:AbortSignal}} opts
 */
export async function list(opts = {}) {
  const creds = await loadCredentials()
  if (!creds || !creds.url || !creds.token) return { ok: false, error: 'no_credentials' }
  const base = deriveHttpBase(creds.url)
  if (!base) return { ok: false, error: 'invalid_url' }

  const params = new URLSearchParams()
  const q = sanitizeQuery(opts.q)
  if (q) params.set('q', q)
  if (typeof opts.limit === 'number' && Number.isFinite(opts.limit)) params.set('limit', String(opts.limit))
  if (typeof opts.offset === 'number' && Number.isFinite(opts.offset)) params.set('offset', String(opts.offset))

  const localCtrl = new AbortController()
  const timeoutId = setTimeout(() => localCtrl.abort(), DEFAULT_TIMEOUT_MS)
  const { signal, cleanup: cleanupSignals } = composeSignals(opts.signal, localCtrl.signal)

  try {
    const url = `${base}/api/songs/list${params.toString() ? '?' + params.toString() : ''}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${creds.token}` },
      signal,
    })
    let body = null
    try { body = await res.json() } catch { body = null }
    return mapResponse(res, body, {
      ok: true,
      items: Array.isArray(body?.items) ? body.items : [],
      count: typeof body?.count === 'number' ? body.count : 0,
      hasMore: !!body?.hasMore,
      serverVersion: typeof body?.serverVersion === 'number' ? body.serverVersion : null,
    })
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, error: 'aborted' }
    return { ok: false, error: 'offline' }
  } finally {
    clearTimeout(timeoutId)
    cleanupSignals()
  }
}

/**
 * GET /api/songs/:id
 * @param {number} id
 * @param {{signal?:AbortSignal}} opts
 */
export async function get(id, opts = {}) {
  const creds = await loadCredentials()
  if (!creds || !creds.url || !creds.token) return { ok: false, error: 'no_credentials' }
  const base = deriveHttpBase(creds.url)
  if (!base) return { ok: false, error: 'invalid_url' }
  if (!Number.isFinite(Number(id)) || !Number.isInteger(Number(id)) || Number(id) <= 0) {
    return { ok: false, error: 'invalid_id' }
  }

  const localCtrl = new AbortController()
  const timeoutId = setTimeout(() => localCtrl.abort(), DEFAULT_TIMEOUT_MS)
  const { signal, cleanup: cleanupSignals } = composeSignals(opts.signal, localCtrl.signal)

  try {
    const res = await fetch(`${base}/api/songs/${Number(id)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${creds.token}` },
      signal,
    })
    let body = null
    try { body = await res.json() } catch { body = null }
    return mapResponse(res, body, {
      ok: true,
      song: body?.song || null,
    })
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, error: 'aborted' }
    return { ok: false, error: 'offline' }
  } finally {
    clearTimeout(timeoutId)
    cleanupSignals()
  }
}

function mapResponse(res, body, okShape) {
  if (res.status === 401) return { ok: false, error: 'auth_error', status: 401 }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After'))
    return {
      ok: false,
      error: 'rate_limited',
      status: 429,
      retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : (body?.retryAfterMs || 60000),
    }
  }
  if (res.status === 404) return { ok: false, error: body?.error || 'not_found', status: 404 }
  if (res.status === 400) return { ok: false, error: body?.error || 'bad_request', status: 400 }
  if (!res.ok || !body || body.ok !== true) {
    return { ok: false, error: body?.error || 'server_error', status: res.status }
  }
  return okShape
}
