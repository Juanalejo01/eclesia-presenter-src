/**
 * urlHelpers.js
 *
 * Helpers puros (sin side effects) para parsear y normalizar la URL del
 * desktop server. Aislados de pairing.js para poder testearlos en
 * profundidad (muchos edge cases: IPv6, falta de scheme, puerto del dev
 * server, etc.) y reutilizarlos desde el QR mode si en el futuro queremos
 * validar el contenido del QR antes de hacer fetch.
 *
 * Reglas de negocio:
 *   - Puerto canónico del desktop server: 3434.
 *   - Si el usuario escribe un puerto distinto, lo respetamos (no auto-
 *     rewrite), pero detectPortIssue() lo marca como sospechoso.
 *   - El puerto del dev server de Vite (5173) coincide con el origen del
 *     propio mando móvil cuando se sirve la PWA desde Vite en LAN. Por
 *     eso `dev_server` se detecta comparando host:port contra window.
 */

const CANONICAL_PORT = '3434'

/**
 * Normaliza una URL escrita por el usuario al canonical
 * `http://<host>:<port>` (sin trailing slashes).
 *   - Recorta whitespace y trailing slashes.
 *   - Si falta `http://`, lo añade.
 *   - Si falta el puerto, añade `:3434`.
 *   - Respeta el puerto cuando el usuario ya escribió uno (incluido :5173).
 *   - String vacío → ''.
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeBaseUrl(input) {
  let s = String(input || '').trim()
  if (!s) return ''

  // Añade scheme si falta. Detección: empieza con dígito o letra sin "://".
  if (!/^https?:\/\//i.test(s)) {
    s = 'http://' + s
  }

  // Recorta trailing slashes ANTES de parsear (URL las normaliza, pero queremos
  // determinismo total para snapshot-friendly comparaciones).
  s = s.replace(/\/+$/, '')

  let parsed
  try {
    parsed = new URL(s)
  } catch {
    // URL no parseable (ej: 'http://no-es-url' SÍ parsea; pero 'http://:80'
    // no). Devolvemos s tal cual recortado para que el caller decida.
    return s
  }

  // Si no hay puerto explícito, añadirlo. URL.port devuelve '' tanto cuando
  // falta como cuando coincide con el default del scheme (80/443) — en
  // nuestro caso nos importa que el usuario quería 3434.
  const hasPort = /:\d+(\/|$)/.test(s.replace(/^https?:\/\//i, ''))
  if (!hasPort) {
    parsed.port = CANONICAL_PORT
  }

  // Reconstruir sin trailing slash (URL.toString() añade '/' al final si
  // no hay path).
  return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '')
}

/**
 * Detecta si la URL apunta al propio mando móvil (puerto dev) o a un
 * puerto sospechoso.
 *
 * @param {string} url            URL ya normalizada
 * @param {string|null} windowOrigin  `window.location.origin` o null en SSR/tests
 * @returns {{ kind: 'dev_server' | 'self_server' | 'wrong_port' | 'ok', port: string }}
 */
export function detectPortIssue(url, windowOrigin) {
  let target
  try {
    target = new URL(url)
  } catch {
    return { kind: 'ok', port: '' }
  }
  const port = target.port || ''

  // Comparación contra el origen del propio navegador (la PWA del mando).
  // Si coincide host:port → dos casos MUY distintos:
  //   - El origen es el puerto canónico 3434 (T12: la app se sirve desde el
  //     propio desktop en /app) → 'self_server': el same-origin ES el server
  //     correcto. El caller lo trata como ok (sin warning ámbar, sin
  //     suprimir el probe).
  //   - Cualquier otro puerto (típicamente Vite :5173) → 'dev_server': el
  //     usuario tipeó la URL del navegador del mando, no la del PC.
  if (windowOrigin) {
    try {
      const win = new URL(windowOrigin)
      if (win.host && win.host === target.host) {
        if (win.port === CANONICAL_PORT) {
          return { kind: 'self_server', port }
        }
        return { kind: 'dev_server', port }
      }
    } catch { /* ignore */ }
  }

  if (port && port !== CANONICAL_PORT) {
    return { kind: 'wrong_port', port }
  }
  return { kind: 'ok', port: port || CANONICAL_PORT }
}

/**
 * ¿La app se está sirviendo desde el propio desktop server (T12)?
 *
 * True cuando el mando se cargó desde http://<IP>:3434/app/ (build embed
 * servido por Express del desktop). En ese caso el pairing es trivial:
 * serverUrl = window.location.origin y solo hace falta el PIN/QR — el
 * campo URL se oculta y los guards same-origin de pairing.js se relajan.
 *
 * El heurístico del pathname exige protocol http: — el embed del desktop
 * SIEMPRE es http. Sin ese guard, un deploy cloud https://dominio/app
 * daba falso positivo y suprimía el banner de "esto no es tu PC".
 *
 * @param {{ port?: string, pathname?: string, protocol?: string }|null}
 *   [loc] — por defecto window.location; inyectable para tests.
 * @returns {boolean}
 */
export function isServedFromDesktop(
  loc = typeof window !== 'undefined' ? window.location : null,
) {
  if (!loc) return false
  const port = String(loc.port || '')
  const pathname = String(loc.pathname || '')
  const protocol = String(loc.protocol || '')
  return port === CANONICAL_PORT || (protocol === 'http:' && pathname.startsWith('/app'))
}

/**
 * Devuelve la URL canónica sugerida basada en el hostname del navegador,
 * o `null` si no se puede sugerir nada útil (localhost, loopback, vacío).
 *
 * @param {string|null} windowHostname
 * @returns {string|null}
 */
export function suggestCanonicalUrl(windowHostname) {
  const h = String(windowHostname || '').trim()
  if (!h) return null
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return null
  // IPv6 sin brackets → no podemos formar una URL válida.
  if (h.includes(':') && !h.startsWith('[')) return null
  return `http://${h}:${CANONICAL_PORT}`
}
