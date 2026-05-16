// POST /api/deactivate
//
// Libera el slot de un dispositivo.

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase/admin'
import { checkRateLimit, getClientIP } from '../../../lib/ratelimit'

export const dynamic = 'force-dynamic'

const LICENSE_KEY_FORMAT = /^EP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/

export async function POST(request) {
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'deactivate')
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limit', retry_after: rl.retryAfter }, { status: 429 })
  }

  try {
    const body = await request.json().catch(() => null)
    const { license_key, device_id } = body || {}

    if (!license_key || !device_id) {
      return NextResponse.json({ ok: false, error: 'parametros_faltantes' }, { status: 400 })
    }
    if (typeof license_key !== 'string' || !LICENSE_KEY_FORMAT.test(license_key.toUpperCase())) {
      return NextResponse.json({ ok: false, error: 'invalida' }, { status: 400 })
    }
    if (typeof device_id !== 'string' || device_id.length < 16 || device_id.length > 128) {
      return NextResponse.json({ ok: false, error: 'invalida' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: license } = await admin
      .from('licenses')
      .select('id')
      .eq('license_key', license_key.toUpperCase())
      .maybeSingle()

    if (!license) {
      // Para no enumerar: devolvemos ok igual (el cliente desactiva localmente)
      return NextResponse.json({ ok: true })
    }

    await admin
      .from('activations')
      .delete()
      .eq('license_id', license.id)
      .eq('device_id', device_id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/deactivate] uncaught')
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
