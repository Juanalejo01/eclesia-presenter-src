// POST /api/license/validate
//
// La app llama aquí al arrancar para verificar que la licencia sigue válida.
// Si la suscripción fue cancelada/expirada/revocada, este endpoint devuelve
// ok=false y la app desktop baja a Free.

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { checkRateLimit, getClientIP } from '../../../../lib/ratelimit'

export const dynamic = 'force-dynamic'

const LICENSE_KEY_FORMAT = /^EP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/

export async function POST(request) {
  const ip = getClientIP(request)
  const rl = checkRateLimit(ip, 'validate')
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limit', retry_after: rl.retryAfter },
      { status: 429 }
    )
  }

  try {
    const body = await request.json().catch(() => null)
    const { license_key, device_id, app_version } = body || {}

    if (!license_key || !device_id) {
      return NextResponse.json({ ok: false, reason: 'parametros_faltantes' }, { status: 400 })
    }
    if (typeof license_key !== 'string' || !LICENSE_KEY_FORMAT.test(license_key.toUpperCase())) {
      return NextResponse.json({ ok: false, reason: 'invalida' })
    }
    if (typeof device_id !== 'string' || device_id.length < 16 || device_id.length > 128) {
      return NextResponse.json({ ok: false, reason: 'invalida' })
    }

    const admin = createAdminClient()

    const { data: license } = await admin
      .from('licenses')
      .select('id, plan, status, max_devices, current_period_end')
      .eq('license_key', license_key.toUpperCase())
      .maybeSingle()

    if (!license) return NextResponse.json({ ok: false, reason: 'invalida' })
    if (license.status !== 'active' && license.status !== 'trialing') {
      return NextResponse.json({ ok: false, reason: 'invalida', status: license.status })
    }
    if (license.current_period_end && new Date(license.current_period_end) < new Date()) {
      return NextResponse.json({ ok: false, reason: 'invalida' })
    }

    const { data: activation } = await admin
      .from('activations')
      .select('id')
      .eq('license_id', license.id)
      .eq('device_id', device_id)
      .maybeSingle()

    if (!activation) {
      // SÍ distinguimos este caso porque el cliente legítimo necesita saberlo
      // (puede que desactivó este PC desde la web).
      return NextResponse.json({ ok: false, reason: 'device_no_activado' })
    }

    // Heartbeat
    const safeVersion = typeof app_version === 'string' ? app_version.slice(0, 32) : undefined
    await admin
      .from('activations')
      .update({
        last_seen_at: new Date().toISOString(),
        ...(safeVersion ? { app_version: safeVersion } : {}),
      })
      .eq('id', activation.id)

    return NextResponse.json({
      ok: true,
      plan: license.plan,
      max_devices: license.max_devices,
      expires_at: license.current_period_end,
      status: license.status,
    })
  } catch (e) {
    console.error('[api/license/validate] uncaught')
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
