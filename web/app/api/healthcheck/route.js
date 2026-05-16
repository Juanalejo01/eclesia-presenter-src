// Endpoint de diagnóstico — protegido con secret + minimiza la metadata expuesta.
//
// HISTORIAL: este endpoint se creó para diagnosticar problemas con las env vars
// de Supabase en producción cuando el deploy fallaba con "Invalid URL" sin más
// pistas. AHORA QUE LA APP YA FUNCIONA, lo dejamos pero protegido para evitar
// que un atacante use sus respuestas para hacer fingerprinting de secretos.
//
// Para acceder:  GET /api/healthcheck?key=<HEALTHCHECK_TOKEN>
// El token se configura en una env var del mismo nombre.
// Si no hay token configurado, devolvemos 404 (endpoint efectivamente
// deshabilitado en producción).

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function describeSafe(value) {
  // No devolvemos prefijos/sufijos del valor real. Solo presencia + longitud aproximada
  // y flags de formato problemático que ayudan a diagnosticar sin filtrar el secret.
  if (!value) return { present: false }
  return {
    present: true,
    length_bucket: value.length < 50 ? 'short' : value.length < 100 ? 'medium' : value.length < 200 ? 'long' : 'very_long',
    has_whitespace: /\s/.test(value),
    has_quotes: /["']/.test(value),
    has_newline: /\n|\r/.test(value),
  }
}

function isValidUrl(s) {
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch { return false }
}

// Comparación de tokens en tiempo constante (resistente a timing attacks)
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function GET(request) {
  const expected = process.env.HEALTHCHECK_TOKEN
  if (!expected) {
    // En producción sin token configurado → 404 (endpoint inexistente)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const provided = searchParams.get('key') || ''
  if (!timingSafeEqual(provided, expected)) {
    // Devolver 404 (no 401/403) para no confirmar la existencia del endpoint
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env_vars: {
      NEXT_PUBLIC_SUPABASE_URL: { ...describeSafe(url), is_valid_url: isValidUrl(url) },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: describeSafe(anon),
      SUPABASE_SERVICE_ROLE: describeSafe(service),
      STRIPE_SECRET_KEY: describeSafe(process.env.STRIPE_SECRET_KEY),
      STRIPE_WEBHOOK_SECRET: describeSafe(process.env.STRIPE_WEBHOOK_SECRET),
    },
  })
}
