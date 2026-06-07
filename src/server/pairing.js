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
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [token, rec] of authorizedTokens) {
    if (now - rec.issuedAt > TOKEN_TTL_MS) authorizedTokens.delete(token)
  }
  for (const [ip, rec] of pinAttempts) {
    if (rec.lockedUntil < now && now - rec.firstAttempt > 24 * 60 * 60_000) {
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
  // test-only
  __setPinForTests,
  __resetForTests,
}
