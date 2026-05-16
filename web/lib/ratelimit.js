// Rate limiter in-memory simple para endpoints públicos.
//
// NOTA: Vercel Functions son stateless y se reinstancian. Este limiter NO
// comparte estado entre instancias. Es una primera línea de defensa contra
// bursts desde una sola IP, pero un atacante distribuido (DDoS) lo bypassea.
// Para protección seria, migra a @upstash/ratelimit con Redis.
//
// Política por IP:
//   - 30 requests / minuto por endpoint
//   - 5 requests / segundo (burst)

const buckets = new Map()  // ip+endpoint → { count, resetAt }
const BURST_LIMIT = 5     // por segundo
const MINUTE_LIMIT = 30   // por minuto
const CLEANUP_INTERVAL = 60_000

let _lastCleanup = Date.now()

function cleanup() {
  if (Date.now() - _lastCleanup < CLEANUP_INTERVAL) return
  _lastCleanup = Date.now()
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (entry.minuteResetAt < now) buckets.delete(key)
  }
}

/**
 * Comprueba si una IP ha excedido el límite para un endpoint.
 * @returns { ok: boolean, retryAfter?: number }
 */
export function checkRateLimit(ip, endpoint) {
  cleanup()
  const key = `${ip}:${endpoint}`
  const now = Date.now()
  let entry = buckets.get(key)

  if (!entry || entry.minuteResetAt < now) {
    entry = {
      burstCount: 0, burstResetAt: now + 1000,
      minuteCount: 0, minuteResetAt: now + 60_000,
    }
    buckets.set(key, entry)
  }

  // Reset burst window cada segundo
  if (entry.burstResetAt < now) {
    entry.burstCount = 0
    entry.burstResetAt = now + 1000
  }

  entry.burstCount++
  entry.minuteCount++

  if (entry.burstCount > BURST_LIMIT) {
    return { ok: false, retryAfter: Math.ceil((entry.burstResetAt - now) / 1000) }
  }
  if (entry.minuteCount > MINUTE_LIMIT) {
    return { ok: false, retryAfter: Math.ceil((entry.minuteResetAt - now) / 1000) }
  }
  return { ok: true }
}

/**
 * Extrae la IP del cliente respetando los headers de Vercel.
 * Vercel pone la IP real en `x-forwarded-for` (primer valor).
 */
export function getClientIP(request) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
