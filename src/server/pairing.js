// Módulo de pairing y autorización de dispositivos.
//
// Extraído de server.js para:
//   - centralizar la seguridad (PIN + tokens + rate-limit) en un solo lugar
//   - permitir tests aislados sin levantar HTTP
//   - mantener el módulo puro JS (sin express ni http) para reutilizar
//     desde el WS raw (wsRemote.js) y el Socket.IO legacy del /remote.
//
// Modelo de tokens:
//   - 24 bytes hex (48 chars) generados con crypto.randomBytes
//   - TTL 24h tras emisión
//   - Map en vez de Set para asociar metadatos: deviceId, deviceName,
//     issuedAt y lastUsedAt (touchToken)
//   - revokeToken borra inmediatamente; la siguiente validateToken devuelve invalid
//
// Modelo de rate-limit:
//   - por IP, ventana de 60s
//   - tras 5 intentos fallidos, lockout de 15 min
//   - limpieza periódica de registros viejos cada hora

const crypto = require('crypto')

// ---------------- Constantes ----------------

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000   // 24h
const PIN_ATTEMPTS_WINDOW_MS = 60_000       // 60s
const PIN_LOCKOUT_MS = 15 * 60_000          // 15 min
const PIN_MAX_ATTEMPTS = 5
// Anti-DoS: cap del Map de intentos por IP. Si lo superamos, evict LRU
// (Map preserva orden de inserción → keys().next() devuelve el más viejo).
const PIN_ATTEMPTS_MAX_ENTRIES = 10_000
// Threshold para limpieza periódica de entries SIN lockout activo (10 min).
// Records con lockout activo se respetan hasta que el lockout expire.
const PIN_ATTEMPTS_CLEANUP_MS = 10 * 60_000

// ---------------- Estado interno ----------------

// PIN de pairing: 6 dígitos generados al require. En producción, el operador
// del PC lo ve en el panel Transmisión y lo dicta al usuario del móvil.
let PAIRING_PIN = String(crypto.randomInt(100000, 1000000))

// token → { deviceId, deviceName, issuedAt, lastUsedAt }
const authorizedTokens = new Map()

// ip → { count, firstAttempt, lockedUntil }
const pinAttempts = new Map()

// ---------------- Rate limit ----------------

function checkPinRateLimit(ip) {
  const now = Date.now()
  const record = pinAttempts.get(ip)
  if (!record) {
    pinAttempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: 0 })
    evictOldestIfOverCap()
    return { allowed: true }
  }
  if (record.lockedUntil > now) {
    return { allowed: false, retryAfterMs: record.lockedUntil - now }
  }
  // Si la ventana expiró, reset
  if (now - record.firstAttempt > PIN_ATTEMPTS_WINDOW_MS) {
    record.count = 1
    record.firstAttempt = now
    record.lockedUntil = 0
    return { allowed: true }
  }
  record.count++
  if (record.count > PIN_MAX_ATTEMPTS) {
    record.lockedUntil = now + PIN_LOCKOUT_MS
    return { allowed: false, retryAfterMs: PIN_LOCKOUT_MS }
  }
  return { allowed: true }
}

// Anti-DoS: si el Map crece más allá del cap, evict el más viejo.
// Map mantiene orden de inserción → keys().next().value es el primer
// entry insertado (= el más viejo). Esto evita que un atacante distribuído
// llene memoria creando millones de entries por IP.
function evictOldestIfOverCap() {
  if (pinAttempts.size > PIN_ATTEMPTS_MAX_ENTRIES) {
    const oldestKey = pinAttempts.keys().next().value
    if (oldestKey !== undefined) pinAttempts.delete(oldestKey)
  }
}

/**
 * Verifica el PIN en tiempo constante (timing-safe). Centraliza la
 * comparación segura aquí para no exponer PAIRING_PIN al endpoint y evitar
 * oracle timing attacks (un `!==` ingenuo permitiría inferir el PIN
 * byte-a-byte midiendo latencias).
 *
 * crypto.timingSafeEqual EXIGE que ambos buffers tengan la misma longitud,
 * de lo contrario lanza. Para no filtrar la longitud real del PIN ni
 * permitir variaciones de timing por la rama de "longitud distinta":
 *   1. PAIRING_PIN es siempre 6 dígitos (generado con randomInt(100000,1000000))
 *   2. Pad-end con NUL hasta 6 bytes para emparejar longitudes
 *   3. Slice(0, 6) para descartar overflow (input >6 bytes)
 *   4. Comparamos también la longitud original al final (sin afectar el
 *      timing de la comparación de bytes) para rechazar inputs que sólo
 *      coinciden por padding/truncado.
 *
 * @param {string} submitted PIN recibido del cliente
 * @returns {boolean}
 */
function verifyPin(submitted) {
  const s = String(submitted == null ? '' : submitted).trim()
  // Padding/truncado a EXACTAMENTE 6 bytes para que timingSafeEqual no lance.
  const a = Buffer.from(s.padEnd(6, '\0'), 'utf8').slice(0, 6)
  const b = Buffer.from(PAIRING_PIN, 'utf8').slice(0, 6)
  // Ambos buffers ahora miden 6 bytes garantizado → safe comparar.
  const bytesEqual = crypto.timingSafeEqual(a, b)
  // Comparamos longitudes después: si el PIN enviado no medía exactamente 6
  // bytes, rechazamos (incluso si los primeros 6 bytes coincidían tras
  // padding/truncado). Esta rama corre IGUAL para todos los inputs porque
  // bytesEqual ya se evaluó arriba — el atacante no obtiene oracle.
  return bytesEqual && s.length === b.length
}

// ---------------- Tokens ----------------

/**
 * Emite un token nuevo asociado a un dispositivo.
 * @param {{ deviceId?: string, deviceName?: string }} info
 * @returns {string} token (48 hex chars)
 */
function issueToken(info = {}) {
  const deviceId = String(info.deviceId || '').slice(0, 64) || 'unknown'
  const deviceName = String(info.deviceName || '').slice(0, 64) || 'Cliente sin nombre'
  const token = crypto.randomBytes(24).toString('hex')
  const now = Date.now()
  authorizedTokens.set(token, {
    deviceId,
    deviceName,
    issuedAt: now,
    lastUsedAt: now,
  })
  return token
}

/**
 * Valida un token; si está expirado lo borra y devuelve invalid.
 * @param {string} token
 * @returns {{ valid: true, deviceId: string, deviceName: string } | { valid: false }}
 */
function validateToken(token) {
  if (typeof token !== 'string' || !token) return { valid: false }
  const rec = authorizedTokens.get(token)
  if (!rec) return { valid: false }
  if (Date.now() - rec.issuedAt > TOKEN_TTL_MS) {
    authorizedTokens.delete(token)
    return { valid: false }
  }
  return { valid: true, deviceId: rec.deviceId, deviceName: rec.deviceName }
}

/** Actualiza lastUsedAt del token (silencioso si no existe). */
function touchToken(token) {
  const rec = authorizedTokens.get(token)
  if (rec) rec.lastUsedAt = Date.now()
}

/**
 * Revoca un token. Devuelve true si existía, false si no.
 * @param {string} token
 */
function revokeToken(token) {
  return authorizedTokens.delete(token)
}

/**
 * Lista los dispositivos pareados (para UI de gestión).
 * @returns {Array<{ token, deviceId, deviceName, issuedAt, lastUsedAt }>}
 */
function listDevices() {
  const out = []
  for (const [token, rec] of authorizedTokens) {
    out.push({
      token,
      deviceId: rec.deviceId,
      deviceName: rec.deviceName,
      issuedAt: rec.issuedAt,
      lastUsedAt: rec.lastUsedAt,
    })
  }
  return out
}

// ---------------- Limpieza periódica ----------------

// Cada hora, borra tokens expirados + IPs viejas sin lockout activo.
// unref() para no impedir que el proceso termine.
// PIN_ATTEMPTS_CLEANUP_MS (10 min) es agresivo a propósito: records sin
// lockout activo no aportan nada después de ese tiempo (la ventana de
// rate-limit es de 60s). Records lockeados se mantienen hasta que el
// lockout expire para no resetear el castigo.
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [token, rec] of authorizedTokens) {
    if (now - rec.issuedAt > TOKEN_TTL_MS) authorizedTokens.delete(token)
  }
  for (const [ip, rec] of pinAttempts) {
    if (rec.lockedUntil < now && now - rec.firstAttempt > PIN_ATTEMPTS_CLEANUP_MS) {
      pinAttempts.delete(ip)
    }
  }
}, 60 * 60_000)
if (cleanupInterval.unref) cleanupInterval.unref()

// ---------------- Test helpers (no production) ----------------

// Permite setear un PIN determinista desde tests. NO disponible en producción.
function __setPinForTests(pin) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__setPinForTests no disponible en producción')
  }
  PAIRING_PIN = String(pin)
}

// Resetea estado interno (útil entre suites). NO disponible en producción.
function __resetForTests() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetForTests no disponible en producción')
  }
  authorizedTokens.clear()
  pinAttempts.clear()
}

// ---------------- API pública ----------------

module.exports = {
  get PAIRING_PIN() { return PAIRING_PIN },  // getter para reflejar __setPinForTests
  verifyPin,
  checkPinRateLimit,
  issueToken,
  validateToken,
  touchToken,
  revokeToken,
  listDevices,
  // constantes (para tests / UI)
  TOKEN_TTL_MS,
  PIN_MAX_ATTEMPTS,
  PIN_LOCKOUT_MS,
  PIN_ATTEMPTS_WINDOW_MS,
  PIN_ATTEMPTS_MAX_ENTRIES,
  // test-only
  __setPinForTests,
  __resetForTests,
}
