// POST /api/activate
//
// La app desktop llama aquí cuando el usuario pega su license_key en Ajustes.
//
// Body JSON:
//   {
//     license_key: "EP-XXXX-XXXX-XXXX-XXXX",
//     device_id:   "<hash estable del PC>",
//     device_name: "PC Iglesia",
//     os:          "Windows 11",
//     app_version: "0.2.0"
//   }
//
// SEGURIDAD:
//   - Rate limit: 30 req/min, 5 req/s por IP+endpoint
//   - Mensajes de error genéricos para evitar enumeration de license_keys
//   - Validación estricta del formato de license_key
//   - Solo el caso 'limite_devices' devuelve detalle (porque el usuario
//     legítimo necesita saber cuántos PCs tiene activados)

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase/admin'
import { checkRateLimit, getClientIP } from '../../../lib/ratelimit'

export const dynamic = 'force-dynamic'

const LICENSE_KEY_FORMAT = /^EP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/

// Mensaje neutro para todos los errores de auth (no enumeration)
const INVALID_LICENSE_ERROR = {
  ok: false,
  error: 'licencia_invalida',
  message: 'No pudimos activar esta licencia. Verifica que la clave sea correcta y que tu suscripción esté activa en eclesia-presenter.vercel.app/cuenta.',
}

export async function POST(request) {
  // 1. Rate limit
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'activate')
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'rate_limit', retry_after: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  try {
    const body = await request.json().catch(() => null)
    const { license_key, device_id, device_name, os, app_version } = body || {}

    // 2. Validación estricta de inputs
    if (!license_key || !device_id) {
      return NextResponse.json({ ok: false, error: 'parametros_faltantes' }, { status: 400 })
    }
    if (typeof license_key !== 'string' || !LICENSE_KEY_FORMAT.test(license_key.toUpperCase())) {
      return NextResponse.json(INVALID_LICENSE_ERROR, { status: 400 })
    }
    if (typeof device_id !== 'string' || device_id.length < 16 || device_id.length > 128) {
      return NextResponse.json({ ok: false, error: 'device_id_invalido' }, { status: 400 })
    }

    // Sanitizar metadata opcional (no más de N caracteres para evitar abuso)
    const safeMeta = {
      device_name: typeof device_name === 'string' ? device_name.slice(0, 100) : null,
      os: typeof os === 'string' ? os.slice(0, 64) : null,
      app_version: typeof app_version === 'string' ? app_version.slice(0, 32) : null,
    }

    const admin = createAdminClient()

    // 3. Buscar licencia
    const { data: license, error: licErr } = await admin
      .from('licenses')
      .select('*')
      .eq('license_key', license_key.toUpperCase())
      .maybeSingle()

    if (licErr) {
      console.error('[api/activate] supabase error')  // no exponer mensaje del error
      return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
    }
    if (!license) {
      return NextResponse.json(INVALID_LICENSE_ERROR, { status: 403 })
    }
    if (license.status !== 'active' && license.status !== 'trialing') {
      return NextResponse.json(INVALID_LICENSE_ERROR, { status: 403 })
    }
    if (license.current_period_end && new Date(license.current_period_end) < new Date()) {
      return NextResponse.json(INVALID_LICENSE_ERROR, { status: 403 })
    }

    // 4. Verificar si este device ya está activado
    const { data: existing } = await admin
      .from('activations')
      .select('id')
      .eq('license_id', license.id)
      .eq('device_id', device_id)
      .maybeSingle()

    if (existing) {
      await admin.from('activations').update({
        ...safeMeta,
        last_seen_at: new Date().toISOString(),
      }).eq('id', existing.id)

      return NextResponse.json({
        ok: true,
        plan: license.plan,
        max_devices: license.max_devices,
        expires_at: license.current_period_end,
        status: license.status,
        reactivated: true,
      })
    }

    // 5. Verificar límite de dispositivos
    const { count } = await admin
      .from('activations')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', license.id)

    if ((count || 0) >= license.max_devices) {
      // ESTE caso SÍ devuelve detalle (el usuario legítimo necesita saberlo)
      return NextResponse.json({
        ok: false,
        error: 'limite_devices',
        current_devices: count,
        max_devices: license.max_devices,
      }, { status: 403 })
    }

    // 6. Crear activación
    const { error: insErr } = await admin.from('activations').insert({
      license_id: license.id,
      device_id,
      ...safeMeta,
    })

    if (insErr) {
      console.error('[api/activate] insert error')
      return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      plan: license.plan,
      max_devices: license.max_devices,
      expires_at: license.current_period_end,
      status: license.status,
    })
  } catch (e) {
    console.error('[api/activate] uncaught')
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
