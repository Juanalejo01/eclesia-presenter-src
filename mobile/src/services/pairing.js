/**
 * pairing.js
 *
 * Wrapper REST de `POST /api/pair` del desktop server (T4). Maneja
 * validaciones de entrada, mapea respuestas HTTP a una taxonomía de
 * errores con sentido para la UI y devuelve los datos justos que
 * necesita `transport.connect()`.
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
 *   - 'pin_incorrecto'      → PIN mal escrito (401 del server o validación local)
 *   - 'demasiados_intentos' → rate limit (429); extra.retryAfterMs disponible
 *   - 'no_alcanzable'       → fetch falló (red, IP mal, server caído)
 *   - 'respuesta_invalida'  → server respondió pero el cuerpo no encaja
 *   - 'unknown'             → cualquier otro fallo no mapeado
 */
export class PairingError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'PairingError'
    this.code = code
    this.extra = extra
  }
}

/**
 * Empareja el móvil con el desktop server.
 *
 * @param {object} opts
 * @param {string} opts.url        URL base del server (`http://<ip>:3434`)
 * @param {string} opts.pin        6 dígitos
 * @param {string} [opts.deviceName] Nombre humano para el panel "Dispositivos"
 * @returns {Promise<{token: string, wsUrl: string, serverVersion: string}>}
 * @throws {PairingError}
 */
export async function pairWithDesktop({ url, pin, deviceName }) {
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

  const deviceId = await getDeviceId()
  const body = JSON.stringify({
    pin: cleanPin,
    deviceId,
    deviceName: deviceName || _detectDeviceName(),
  })

  let res
  try {
    res = await fetch(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  } catch (e) {
    throw new PairingError(
      'no_alcanzable',
      e?.message || 'No se pudo conectar al servidor',
    )
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
