/**
 * pairing.js
 *
 * Wrapper REST de `POST /api/pair` del desktop server (T4). Maneja
 * validaciones de entrada, mapea respuestas HTTP a una taxonomía de
 * errores con sentido para la UI y devuelve los datos justos que
 * necesita `transport.connect()`.
 *
 * T3 hardening: antes de gastar un intento del rate-limiter de /api/pair
 * (5 intentos/60s/IP), llamamos a `checkServer(url)` que hace un GET
 * barato a /api/info. Esto nos da un discriminador determinista entre:
 *   - puerto correcto + EclesiaPresenter vivo → seguimos al POST
 *   - puerto correcto pero otro servidor   → 'puerto_incorrecto'
 *   - servidor caído                       → 'servidor_caido'
 *   - timeout (firewall/red distinta)      → 'no_alcanzable'
 *   - Brave Shields / mixed content        → 'mixed_content_o_shields'
 *
 * Por qué un service aparte (y no dentro de transport.js):
 *   - El pairing es REST one-shot, no WebSocket. No comparte ciclo de
 *     vida ni reconnect.
 *   - Los errores tienen semántica de UI (PIN mal vs red fuera) que no
 *     pinta dentro del transport.
 *   - Aislamiento facilita los tests con fetch mockeado.
 *
 * Ejemplo:
 *   try {
 *     const { token, wsUrl } = await pairWithDesktop({
 *       url: 'http://192.168.1.10:3434',
 *       pin: '123456',
 *     })
 *     await transport.connect(wsUrl, token)
 *   } catch (e) {
 *     if (e.code === 'pin_incorrecto') { ... }
 *   }
 *
 * Edge cases:
 *   - URL sin scheme o sin http(s) → error local antes de fetch.
 *   - PIN no-numérico o de longitud distinta a 6 → error local antes de
 *     fetch (evita el ruido en el rate-limiter del server).
 *   - Server responde con 401 / 429 / non-JSON / sin token → mapeado.
 *   - Trailing slash en la URL → normalizado.
 */
import { getDeviceId } from './deviceId.js'

/**
 * Error tipado del pairing. El caller hace `switch (err.code)` y
 * renderiza el mensaje apropiado.
 *
 * Códigos posibles:
 *   - 'pin_incorrecto'              → PIN mal escrito (401 del server o validación local)
 *   - 'demasiados_intentos'         → rate limit (429); extra.retryAfterMs disponible
 *   - 'no_alcanzable'               → fetch falló por timeout (firewall/red distinta)
 *   - 'servidor_caido'              → fetch ECONNREFUSED (puerto cerrado, app no abierta)
 *   - 'puerto_incorrecto'           → responde algo, pero NO es EclesiaPresenter (HTML, otro JSON)
 *   - 'mixed_content_o_shields'     → bloqueado por Brave Shields / mixed-content / CSP
 *   - 'version_incompatible'        → es EclesiaPresenter pero protocolo desconocido
 *   - 'respuesta_invalida'          → server respondió pero el cuerpo no encaja
 *   - 'unknown'                     → cualquier otro fallo no mapeado
 */
export class PairingError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'PairingError'
    this.code = code
    this.extra = extra
  }
}

// Patrón de mensajes que típicamente lanzan los browsers cuando Brave
// Shields, una CSP o mixed-content bloquean un fetch. Lo guardamos como
// const para reusarlo en checkServer y en el catch del POST si quisiéramos.
const SHIELDS_MSG_RE = /mixed content|blocked by client|insecure|policy|csp|net::err_blocked/i

/**
 * GET /api/info para confirmar que la URL apunta realmente al desktop
 * server de EclesiaPresenter ANTES de gastar un intento del rate-limiter
 * de /api/pair.
 *
 * Devuelve siempre un objeto (nunca throws); el caller decide qué hacer.
 *   - `{ ok: true, app, version, protocol }` → URL correcta
 *   - `{ ok: false, error }` con un PairingError tipado en `error`
 *
 * Timeout corto (5s) para feedback rápido si la URL es errónea.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ok: true, app: string, version: string, protocol: number} | {ok: false, error: PairingError}>}
 */
export async function checkServer(url, { timeoutMs = 5_000 } = {}) {
  const baseUrl = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(baseUrl)) {
    return {
      ok: false,
      error: new PairingError(
        'no_alcanzable',
        'URL inválida: debe empezar por http:// o https://',
      ),
    }
  }

  // Mixed-content trivial: PWA sirviéndose desde https:// no puede llamar a http://.
  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    baseUrl.startsWith('http://')
  ) {
    return {
      ok: false,
      error: new PairingError(
        'mixed_content_o_shields',
        'Bloqueado por mixed content (https → http)',
      ),
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(`${baseUrl}/api/info`, {
      method: 'GET',
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    const msg = String(e?.message || e || '')
    if (e?.name === 'AbortError') {
      console.warn('[pairing] /api/info timeout', timeoutMs, 'ms')
      return {
        ok: false,
        error: new PairingError(
          'no_alcanzable',
          'El PC no responde a tiempo (firewall o WiFi distinta)',
        ),
      }
    }
    if (SHIELDS_MSG_RE.test(msg)) {
      console.warn('[pairing] /api/info bloqueado por shields/CSP:', msg)
      return {
        ok: false,
        error: new PairingError(
          'mixed_content_o_shields',
          'Conexión bloqueada por Brave Shields o CSP',
        ),
      }
    }
    if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|connection refused/i.test(msg)) {
      console.warn('[pairing] /api/info ECONNREFUSED')
      return {
        ok: false,
        error: new PairingError(
          'servidor_caido',
          'Nada escucha en esa dirección. ¿EclesiaPresenter abierto?',
        ),
      }
    }
    // Catch-all para TypeError 'Failed to fetch' (sin más contexto del
    // browser). En la mayoría de WebViews esto significa "no se pudo
    // establecer conexión TCP" → tratarlo como servidor_caido es lo más
    // accionable para el usuario.
    console.warn('[pairing] /api/info fetch falló:', msg)
    return {
      ok: false,
      error: new PairingError('servidor_caido', msg || 'Fallo de conexión'),
    }
  } finally {
    clearTimeout(timeoutId)
  }

  // Status no-2xx: el puerto responde pero algo va mal. Tratamos cualquier
  // status raro como "puerto incorrecto" (la app real siempre responde 200).
  if (!res.ok) {
    console.warn('[pairing] /api/info status', res.status)
    return {
      ok: false,
      error: new PairingError(
        'puerto_incorrecto',
        `Esa dirección responde con HTTP ${res.status}, no es EclesiaPresenter`,
      ),
    }
  }

  // Content-Type debe ser JSON. Si es HTML (Vite, nginx, otra app web) →
  // puerto_incorrecto.
  const ct = String(res.headers?.get?.('content-type') || '').toLowerCase()
  if (ct && !ct.includes('application/json')) {
    console.warn('[pairing] /api/info content-type inesperado:', ct)
    return {
      ok: false,
      error: new PairingError(
        'puerto_incorrecto',
        'La dirección responde con HTML/otro, no con JSON',
      ),
    }
  }

  let json
  try {
    json = await res.json()
  } catch {
    return {
      ok: false,
      error: new PairingError(
        'puerto_incorrecto',
        'La dirección no devuelve JSON válido',
      ),
    }
  }

  if (!json || typeof json !== 'object') {
    return {
      ok: false,
      error: new PairingError('puerto_incorrecto', 'Respuesta no es objeto JSON'),
    }
  }

  if (json.app !== 'EclesiaPresenter') {
    return {
      ok: false,
      error: new PairingError(
        'puerto_incorrecto',
        `Esa dirección es de otra aplicación (${json.app || 'desconocida'})`,
      ),
    }
  }

  // Protocolo: protocol 1 es el actual. Si en el futuro subimos a 2 y un
  // cliente viejo se topa con un server nuevo (o viceversa), reportamos
  // version_incompatible para que el usuario sepa qué actualizar.
  const protocol = Number(json.protocol)
  if (!protocol || protocol !== 1) {
    return {
      ok: false,
      error: new PairingError(
        'version_incompatible',
        `Protocolo ${json.protocol} no soportado por este cliente`,
      ),
    }
  }

  return {
    ok: true,
    app: json.app,
    version: String(json.version || ''),
    protocol,
  }
}

/**
 * Empareja el móvil con el desktop server.
 *
 * @param {object} opts
 * @param {string} opts.url        URL base del server (`http://<ip>:3434`)
 * @param {string} opts.pin        6 dígitos
 * @param {string} [opts.deviceName] Nombre humano para el panel "Dispositivos"
 * @param {boolean} [opts.skipProbe=false]  Para tests; en runtime SIEMPRE probe.
 * @returns {Promise<{token: string, wsUrl: string, serverVersion: string}>}
 * @throws {PairingError}
 */
export async function pairWithDesktop({ url, pin, deviceName, skipProbe = false }) {
  const baseUrl = String(url || '').trim().replace(/\/+$/, '')
  const cleanPin = String(pin || '').trim()

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new PairingError(
      'no_alcanzable',
      'URL inválida: debe empezar por http:// o https://',
    )
  }
  if (!/^\d{6}$/.test(cleanPin)) {
    throw new PairingError('pin_incorrecto', 'PIN debe ser 6 dígitos')
  }

  // Guard contra "usuario copió la URL del navegador del propio mando".
  // Comparamos host:port; si coinciden, estamos apuntando a nosotros mismos
  // (típicamente Vite dev en :5173 servido por LAN). Ningún fetch necesario.
  if (typeof window !== 'undefined' && window.location?.host) {
    try {
      const targetHost = new URL(baseUrl).host
      if (targetHost === window.location.host) {
        throw new PairingError(
          'puerto_incorrecto',
          'Esa es la URL del navegador (el mando), no la del PC. Cambia el puerto a 3434.',
        )
      }
    } catch (e) {
      if (e instanceof PairingError) throw e
      // URL parse error → seguimos; checkServer lo capturará abajo.
    }
  }

  // Probe pre-flight: si la URL no apunta a EclesiaPresenter, abortamos
  // SIN gastar un intento del rate-limiter de /api/pair.
  if (!skipProbe) {
    const probe = await checkServer(baseUrl)
    if (!probe.ok) {
      throw probe.error
    }
  }

  const deviceId = await getDeviceId()
  const body = JSON.stringify({
    pin: cleanPin,
    deviceId,
    deviceName: deviceName || _detectDeviceName(),
  })

  // Timeout duro de 10s para que el usuario vea "no_alcanzable" en vez
  // de quedarse pegado en "Emparejando…" indefinido si el server cuelga.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  let res
  try {
    res = await fetch(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') {
      console.warn('[pairing] timeout 10s sin respuesta del server')
      throw new PairingError(
        'no_alcanzable',
        'El servidor tardó demasiado en responder. ¿IP correcta?',
      )
    }
    console.warn('[pairing] fetch falló:', e?.message || e)
    throw new PairingError(
      'no_alcanzable',
      e?.message || 'No se pudo conectar al servidor',
    )
  } finally {
    clearTimeout(timeoutId)
  }

  let json
  try {
    json = await res.json()
  } catch {
    throw new PairingError(
      'respuesta_invalida',
      `Respuesta no JSON (HTTP ${res.status})`,
    )
  }

  if (res.status === 401) {
    throw new PairingError('pin_incorrecto', json?.error || 'PIN incorrecto')
  }
  if (res.status === 429) {
    throw new PairingError(
      'demasiados_intentos',
      json?.error || 'Demasiados intentos',
      { retryAfterMs: Number(json?.retryAfterMs) || 60_000 },
    )
  }
  if (!res.ok || !json?.ok) {
    throw new PairingError('unknown', json?.error || `HTTP ${res.status}`)
  }
  if (!json.token || !json.serverInfo?.wsUrl) {
    throw new PairingError('respuesta_invalida', 'Respuesta sin token o wsUrl')
  }

  return {
    token: json.token,
    wsUrl: json.serverInfo.wsUrl,
    serverVersion: json.serverInfo.version || 'desconocida',
  }
}

/**
 * Best-effort para que el panel "Dispositivos" del desktop muestre algo
 * útil. Si no podemos extraer un nombre, devolvemos "Mando móvil".
 */
function _detectDeviceName() {
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
    if (/iPhone/.test(ua)) return 'iPhone'
    if (/iPad/.test(ua)) return 'iPad'
    if (/Android/.test(ua)) {
      const m = ua.match(/Android.*; ([^)]+)\)/)
      return m ? m[1].trim() : 'Android'
    }
    return 'Mando móvil'
  } catch {
    return 'Mando móvil'
  }
}
