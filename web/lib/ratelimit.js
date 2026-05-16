// Rate limiter distribuido (Upstash Redis) con fallback in-memory.
//
// COMPORTAMIENTO:
//   - Si UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN están definidas
//     en las env vars, usa Redis (compartido entre todas las instancias de
//     Vercel Functions → protección real contra DDoS distribuido).
//   - Si NO están, cae a un Map() en memoria local (la protección sirve
//     solo dentro de la misma instancia serverless).
//
// Política por IP + endpoint:
//   - 30 requests / minuto (sliding window)
//   - 5 requests / segundo (burst)
//
// Para activar Upstash:
//   1. https://vercel.com/dashboard → tu proyecto → Storage → Create Database
//      → Upstash Redis (Free tier: 10k commands/día, suficiente para v1)
//   2. Las env vars se inyectan automáticamente en el proyecto.
//   3. Redeploy.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// --- Upstash (si está disponible) ---
let _ratelimitMinute = null
let _ratelimitBurst = null

function getUpstashClients() {
  if (_ratelimitMinute && _ratelimitBurst) return { minute: _ratelimitMinute, burst: _ratelimitBurst }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    _ratelimitMinute = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'),
      prefix: 'rl:minute',
      analytics: false,  // ahorra commands en el free tier
    })
    _ratelimitBurst = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 s'),
      prefix: 'rl:burst',
      analytics: false,
    })
    return { minute: _ratelimitMinute, burst: _ratelimitBurst }
  } catch (e) {
    console.warn('[ratelimit] Upstash init failed, falling back to in-memory:', e?.message)
    return null
  }
}

// --- Fallback in-memory ---
const buckets = new Map()
let _lastCleanup = Date.now()

function cleanup() {
  if (Date.now() - _lastCleanup < 60_000) return
  _lastCleanup = Date.now()
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (entry.minuteResetAt < now) buckets.delete(key)
  }
}

function checkInMemory(ip, endpoint) {
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
  if (entry.burstResetAt < now) {
    entry.burstCount = 0
    entry.burstResetAt = now + 1000
  }
  entry.burstCount++
  entry.minuteCount++
  if (entry.burstCount > 5)   return { ok: false, retryAfter: Math.ceil((entry.burstResetAt - now) / 1000) }
  if (entry.minuteCount > 30) return { ok: false, retryAfter: Math.ceil((entry.minuteResetAt - now) / 1000) }
  return { ok: true }
}

/**
 * Comprueba si una IP ha excedido el límite para un endpoint.
 * Si hay Upstash configurado, lo usa. Si no, cae a in-memory.
 *
 * @returns { ok: boolean, retryAfter?: number, source: 'redis' | 'memory' }
 */
export async function checkRateLimit(ip, endpoint) {
  const upstash = getUpstashClients()
  if (upstash) {
    try {
      const id = `${endpoint}:${ip}`
      // Sliding window por minuto
      const minute = await upstash.minute.limit(id)
      if (!minute.success) {
        return {
          ok: false,
          retryAfter: Math.ceil((minute.reset - Date.now()) / 1000),
          source: 'redis',
        }
      }
      // Sliding window de burst
      const burst = await upstash.burst.limit(id)
      if (!burst.success) {
        return {
          ok: false,
          retryAfter: Math.ceil((burst.reset - Date.now()) / 1000),
          source: 'redis',
        }
      }
      return { ok: true, source: 'redis' }
    } catch (e) {
      // Si Upstash falla (cuota agotada, red caída), no bloqueamos al usuario:
      // caemos a in-memory como fallback defensivo.
      console.warn('[ratelimit] Upstash request failed:', e?.message)
    }
  }
  return { ...checkInMemory(ip, endpoint), source: 'memory' }
}

/**
 * Extrae la IP del cliente respetando los headers de Vercel.
 */
export function getClientIP(request) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
