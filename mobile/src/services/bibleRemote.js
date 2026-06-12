/**
 * bibleRemote.js
 *
 * Cliente HTTP del endpoint /api/bible/search del desktop. Lee las
 * credenciales (url WebSocket → derivamos la HTTP base) desde
 * transportStorage para mandar el Bearer token.
 *
 * Devuelve siempre un objeto con shape predecible:
 *   { ok:true, mode, results, count }   éxito
 *   { ok:false, error, status?, retryAfterMs?, parsed? }   fallo
 *
 * Por qué no usar el WS para el search: queremos backpressure HTTP-style
 * (status codes + Retry-After) que el WS no nos da limpio. Y el flujo
 * cliente→server es request/response, no streaming. HTTP encaja mejor.
 *
 * AbortController: el hook llama search(query, version, signal). Si el
 * usuario tipea rápido, el hook aborta el fetch anterior antes de lanzar
 * el siguiente — evita races donde una respuesta vieja sobrescribe una
 * nueva. AbortError se mapea a { ok:false, error:'aborted' } para que el
 * hook lo ignore.
 *
 * Edge cases:
 *   - 401 → emitimos { error:'auth_error' } y dejamos que el caller
 *     decida (típicamente: transport.disconnect() + nav /pair).
 *   - Network fail → { error:'offline' }.
 *   - Timeout 8s vía AbortController interno si no nos pasan signal.
 */
import { loadCredentials } from './transportStorage.js'

const DEFAULT_TIMEOUT_MS = 8000

/**
 * Convierte ws://host:port/ws/remote → http://host:port. Si la url no
 * empieza por ws://, asumimos http(s) y devolvemos host raw.
 */
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

/**
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.version]   default 'rvr1960'
 * @param {number} [opts.limit]     default 20
 * @param {'auto'|'ref'|'text'} [opts.mode]
 * @param {AbortSignal} [opts.signal]  externo (para abort por nuevo query)
 * @returns {Promise<{ok:boolean, mode?:string, results?:any[], count?:number, error?:string, status?:number, retryAfterMs?:number, parsed?:any}>}
 */
export async function search(query, opts = {}) {
  const creds = await loadCredentials()
  if (!creds || !creds.url || !creds.token) {
    return { ok: false, error: 'no_credentials' }
  }
  const base = deriveHttpBase(creds.url)
  if (!base) return { ok: false, error: 'invalid_url' }

  // Sanitiza el query del lado cliente — el server también lo hace, pero
  // ahorramos el roundtrip si está vacío o demasiado largo.
  const q = String(query || '').slice(0, 200).replace(/\s+/g, ' ').trim()
  if (!q) return { ok: false, error: 'q_required' }

  // Timeout local + composición con signal externo. Si llega abort de
  // ambos, gana el primero — el resultado es igual: AbortError.
  const localCtrl = new AbortController()
  const timeoutId = setTimeout(() => localCtrl.abort(), DEFAULT_TIMEOUT_MS)
  const { signal: compositeSignal, cleanup: cleanupSignals } =
    composeSignals(opts.signal, localCtrl.signal)

  try {
    const res = await fetch(`${base}/api/bible/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.token}`,
      },
      body: JSON.stringify({
        q,
        version: opts.version || 'rvr1960',
        limit: typeof opts.limit === 'number' ? opts.limit : 20,
        mode: opts.mode || 'auto',
      }),
      signal: compositeSignal,
    })

    let body = null
    try { body = await res.json() } catch { body = null }

    if (res.status === 401) {
      return { ok: false, error: 'auth_error', status: 401 }
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      return {
        ok: false,
        error: 'rate_limited',
        status: 429,
        retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : (body?.retryAfterMs || 60000),
      }
    }
    if (!res.ok || !body || body.ok !== true) {
      return {
        ok: false,
        error: body?.error || 'server_error',
        status: res.status,
        parsed: body?.parsed,
      }
    }
    return {
      ok: true,
      mode: body.mode,
      results: Array.isArray(body.results) ? body.results : [],
      count: typeof body.count === 'number' ? body.count : 0,
      version: body.version,
      query: body.query,
    }
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, error: 'aborted' }
    return { ok: false, error: 'offline' }
  } finally {
    clearTimeout(timeoutId)
    cleanupSignals()
  }
}

/**
 * Compone dos AbortSignal en uno. Si cualquiera aborta, el resultante
 * aborta. Polyfill mínimo porque AbortSignal.any no está disponible en
 * Android WebView viejo (API <31).
 *
 * Devuelve { signal, cleanup }: cleanup DEBE llamarse al terminar el fetch
 * (finally) — sin él, el listener 'abort' del signal externo (que puede
 * vivir más que la request, p.ej. el AbortController del hook) queda
 * colgado reteniendo el closure de cada request completada.
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
