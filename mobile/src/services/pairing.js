/**
 * pairing.js
 *
 * Wrapper REST de `POST /api/pair` del desktop server (T4). Maneja
 * validaciones de entrada, mapea respuestas HTTP a una taxonomía de
 * errores con sentido para la UI y devuelve los datos justos que
 * necesita `transport.connect()`.
 *
 * T3 hardening: antes de gastar un intento del rate-limiter de /api/pair
 * (5 intentos/60s/IP), llamamos a `probeServer(url)` que hace un GET
 * barato a /api/info. Esto nos da un discriminador determinista entre
 * los códigos listados abajo (taxonomía completa).
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
 *   - Desktop antiguo SIN /api/info (devuelve 404) → fallback silencioso
 *     que sigue al POST /api/pair (back-compat con versiones <0.2.13).
 */
import { getDeviceId } from './deviceId.js'

/**
 * Error tipado del pairing. El caller hace `switch (err.code)` y
 * renderiza el mensaje apropiado.
 *
 * Códigos posibles (12 totales — taxonomía completa):
 *   - 'pin_incorrecto'              → PIN mal escrito (401 del server o validación local)
 *   - 'demasiados_intentos'         → rate limit (429); extra.retryAfterMs disponible
 *   - 'no_alcanzable'               → probe OK pero POST cae después (raro, glitch)
 *   - 'respuesta_invalida'          → server respondió pero el cuerpo no encaja
 *   - 'unknown'                     → cualquier otro fallo no mapeado
 *   - 'puerto_incorrecto'           → responde con JSON inválido, HTML, o 404 no-legacy
 *   - 'puerto_dev_server'           → same-origin (la URL es el propio mando, no el PC)
 *   - 'no_es_eclesia'               → JSON válido pero `.app !== 'EclesiaPresenter'`
 *   - 'firewall_o_red'              → AbortError del probe (timeout 5s, firewall/WiFi)
 *   - 'servidor_caido'              → ECONNREFUSED (puerto cerrado / app no abierta)
 *   - 'mixed_content_o_shields'     → bloqueado por Brave Shields / mixed-content / CSP
 *   - 'servidor_legacy'             → desktop antiguo sin /api/info (silent fallback)
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
// const para reusarlo en probeServer y en el catch del POST si quisiéramos.
const SHIELDS_MSG_RE = /mixed content|blocked by client|insecure|policy|csp|net::err_blocked/i

/**
 * GET /api/info para confirmar que la URL apunta realmente al desktop
 * server de EclesiaPresenter ANTES de gastar un intento del rate-limiter
 * de /api/pair.
 *
 * Contrato (cambiado en el hardening cierre vs la versión inicial):
 *   - Lanza `PairingError` con código tipado en cualquier fallo.
 *   - Salvo el caso "desktop legacy sin /api/info" (status 404) que
 *     devuelve `{ legacy: true }` para que el caller pueda decidir
 *     si seguir adelante con el POST /api/pair tradicional.
 *   - En éxito devuelve `{ ok: true, app, version, protocol }`.
 *
 * Timeout corto (5s) para feedback rápido si la URL es errónea.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ok: true, app: string, version: string, protocol: number} | {legacy: true}>}
 * @throws {PairingError}
 */
export async function probeServer(url, { timeoutMs = 5_000 } = {}) {
  const baseUrl = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new PairingError(
      'no_alcanzable',
      'URL inválida: debe empezar por http:// o https://',
    )
  }

  // Mixed-content trivial: PWA sirviéndose desde https:// no puede llamar a http://.
  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    baseUrl.startsWith('http://')
  ) {
    throw new PairingError(
      'mixed_content_o_shields',
      'Bloqueado por mixed content (https → http)',
    )
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
    // El finally limpia el timeout — no es necesario clearTimeout aquí.
    const msg = String(e?.message || e || '')
    if (e?.name === 'AbortError') {
      console.warn('[probe] /api/info timeout', timeoutMs, 'ms')
      throw new PairingError(
        'firewall_o_red',
        'El PC no responde a tiempo (firewall o WiFi distinta)',
      )
    }
    if (SHIELDS_MSG_RE.test(msg)) {
      console.warn('[probe] /api/info bloqueado por shields/CSP:', msg)
      throw new PairingError(
        'mixed_content_o_shields',
        'Conexión bloqueada por Brave Shields o CSP',
      )
    }
    if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|connection refused/i.test(msg)) {
      console.warn('[probe] /api/info ECONNREFUSED')
      throw new PairingError(
        'servidor_caido',
        'Nada escucha en esa dirección. ¿EclesiaPresenter abierto?',
      )
    }
    // CORS-vs-server-down ambiguity: el browser lanza `TypeError: Failed to
    // fetch` tanto cuando el TCP no abre como cuando CORS bloquea la
    // respuesta. No podemos distinguirlos desde JS — reutilizamos
    // `no_alcanzable` con un mensaje que cubre ambas posibilidades + la
    // tercera (desktop muy antiguo). Suficientemente accionable para el
    // usuario sin acusar erróneamente de un fallo concreto.
    if (e?.name === 'TypeError' && /failed to fetch/i.test(msg)) {
      console.warn('[probe] /api/info TypeError "Failed to fetch" (CORS o TCP cerrado o legacy)')
      throw new PairingError(
        'no_alcanzable',
        'No se pudo conectar. El PC puede no estar encendido, no estar en la misma WiFi, o ser una versión antigua sin soporte para emparejamiento moderno.',
      )
    }
    // Catch-all: cualquier otro error de red opaco lo mapeamos a
    // servidor_caido (la rama más accionable: "abre la app en el PC").
    console.warn('[probe] /api/info fetch falló:', msg)
    throw new PairingError('servidor_caido', msg || 'Fallo de conexión')
  } finally {
    clearTimeout(timeoutId)
  }

  // Status 404 = desktop ANTIGUO (cualquier versión <0.2.13) que no tiene
  // /api/info pero sí tiene /api/pair. Devolvemos un flag legacy en lugar
  // de lanzar; el caller decidirá si seguir al POST. Cualquier otro 4xx/5xx
  // es puerto_incorrecto (la app real responde 200).
  if (res.status === 404) {
    console.info('[probe] /api/info devolvió 404 — desktop legacy detectado')
    return { legacy: true }
  }
  if (!res.ok) {
    console.warn('[probe] /api/info status', res.status)
    throw new PairingError(
      'puerto_incorrecto',
      `Esa dirección responde con HTTP ${res.status}, no es EclesiaPresenter`,
    )
  }

  // Content-Type debe ser JSON. Si es HTML (Vite, nginx, otra app web) →
  // puerto_incorrecto.
  const ct = String(res.headers?.get?.('content-type') || '').toLowerCase()
  if (ct && !ct.includes('application/json')) {
    console.warn('[probe] /api/info content-type inesperado:', ct)
    throw new PairingError(
      'puerto_incorrecto',
      'La dirección responde con HTML/otro, no con JSON',
    )
  }

  let json
  try {
    json = await res.json()
  } catch {
    throw new PairingError(
      'puerto_incorrecto',
      'La dirección no devuelve JSON válido',
    )
  }

  if (!json || typeof json !== 'object') {
    throw new PairingError('puerto_incorrecto', 'Respuesta no es objeto JSON')
  }

  // JSON válido pero no es nuestra app: código distinto a puerto_incorrecto
  // porque la pista para el usuario es diferente ("no es EclesiaPresenter"
  // vs "puerto erróneo").
  if (json.app !== 'EclesiaPresenter') {
    throw new PairingError(
      'no_es_eclesia',
      `Esa dirección responde, pero no es EclesiaPresenter (app=${json.app || 'desconocida'})`,
    )
  }

  // Protocolo: protocol 1 es el actual. Si en el futuro subimos a 2 y un
  // cliente viejo se topa con un server nuevo (o viceversa), reportamos
  // 'unknown' con un mensaje claro para que el usuario sepa qué actualizar.
  const protocol = Number(json.protocol)
  if (!protocol || protocol !== 1) {
    throw new PairingError(
      'unknown',
      `Protocolo ${json.protocol} no soportado por este cliente. Actualiza la app.`,
    )
  }

  return {
    ok: true,
    app: json.app,
    version: String(json.version || ''),
    protocol,
  }
}

/**
 * Alias retro-compat para `probeServer` con el contrato viejo (devuelve
 * `{ ok, error }` en vez de lanzar). Aún disponible para code legacy
 * que no se haya migrado al throw, pero NO se usa internamente.
 *
 * @deprecated Usa probeServer (throws).
 */
export async function checkServer(url, opts) {
  try {
    const r = await probeServer(url, opts)
    if (r.legacy) {
      // En el contrato viejo no había concepto de legacy; lo expresamos
      // como ok:false con un error sintético para que cualquier caller
      // antiguo no rompa pero tampoco crea que es válido.
      return {
        ok: false,
        legacyServer: true,
        error: new PairingError(
          'servidor_legacy',
          'Versión antigua detectada — intentando pairing directo',
        ),
      }
    }
    return r
  } catch (e) {
    if (e instanceof PairingError) return { ok: false, error: e }
    return {
      ok: false,
      error: new PairingError('unknown', e?.message || 'Error desconocido'),
    }
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
  // Código `puerto_dev_server` (distinto de `puerto_incorrecto` para que la
  // UI pueda mostrar un mensaje específico).
  if (typeof window !== 'undefined' && window.location?.host) {
    try {
      const targetHost = new URL(baseUrl).host
      if (targetHost === window.location.host) {
        throw new PairingError(
          'puerto_dev_server',
          'Esa es la URL del navegador (el mando), no la del PC.',
        )
      }
    } catch (e) {
      if (e instanceof PairingError) throw e
      // URL parse error → seguimos; probeServer lo capturará abajo.
    }
  }

  // Probe pre-flight: si la URL no apunta a EclesiaPresenter, abortamos
  // SIN gastar un intento del rate-limiter de /api/pair. Si el desktop es
  // legacy (404 en /api/info), seguimos al POST sin error.
  if (!skipProbe) {
    const probeResult = await probeServer(baseUrl)
    if (probeResult.legacy) {
      console.warn('[pairing] legacy server detected (no /api/info), falling through to POST /api/pair')
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
