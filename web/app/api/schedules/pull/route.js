// POST /api/schedules/pull — El desktop importa las listas del día
// planificadas en el móvil (C3a). Cierra el círculo planifico-en-el-sofá →
// cargo-en-la-iglesia.
//
// El desktop NO tiene sesión Supabase: autentica con license_key + device_id
// (mismo patrón que /api/songs/sync). El service_role salta RLS, así que
// leemos directamente con el user_id resuelto desde la licencia.
//
// Body:
//   {
//     license_key: "EP-XXXX-...",
//     device_id:   "<hash estable del PC>",
//     schedule_id?: uuid    // opcional
//   }
//
// SIN schedule_id → listado (sin el jsonb items, solo metadata):
//   {
//     ok: true,
//     schedules: [
//       { id, title, service_date, is_template, items_count, updated_at }
//     ]
//   }
//
// CON schedule_id → la lista completa con sus items:
//   {
//     ok: true,
//     schedule: { id, title, service_date, is_template, items, items_count, updated_at }
//   }
//
// Solo listas NO borradas (deleted_at IS NULL). Orden por updated_at desc,
// límite 50. Pro-only (igual que el sync de canciones).

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { checkRateLimit, getClientIP } from '../../../../lib/ratelimit'

export const dynamic = 'force-dynamic'

const LICENSE_KEY_FORMAT = /^EP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request) {
  // Rate limit
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'schedules-pull')
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limit', retry_after: rl.retryAfter }, { status: 429 })
  }

  try {
    const body = await request.json().catch(() => null)
    const { license_key, device_id, schedule_id } = body || {}

    // Validar inputs (códigos estables, sin internals)
    if (typeof license_key !== 'string' || !LICENSE_KEY_FORMAT.test(license_key.toUpperCase())) {
      return NextResponse.json({ ok: false, error: 'license_invalida' }, { status: 400 })
    }
    if (typeof device_id !== 'string' || device_id.length < 16 || device_id.length > 128) {
      return NextResponse.json({ ok: false, error: 'device_id_invalido' }, { status: 400 })
    }
    if (schedule_id !== undefined && (typeof schedule_id !== 'string' || !UUID_FORMAT.test(schedule_id))) {
      return NextResponse.json({ ok: false, error: 'schedule_id_invalido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Validar licencia y obtener user_id (idéntico a songs/sync + validate)
    const { data: license } = await admin
      .from('licenses')
      .select('id, user_id, status, current_period_end, plan')
      .eq('license_key', license_key.toUpperCase())
      .maybeSingle()

    if (!license) {
      return NextResponse.json({ ok: false, error: 'licencia_invalida' }, { status: 403 })
    }
    if (license.status !== 'active' && license.status !== 'trialing') {
      return NextResponse.json({ ok: false, error: 'licencia_invalida' }, { status: 403 })
    }
    if (license.current_period_end && new Date(license.current_period_end) < new Date()) {
      return NextResponse.json({ ok: false, error: 'licencia_expirada' }, { status: 403 })
    }
    // Pro-only — el plan free no importa listas de la nube
    if (license.plan === 'free') {
      return NextResponse.json({ ok: false, error: 'requires_pro' }, { status: 403 })
    }

    // Activación del dispositivo: el PC debe estar activado en esta licencia.
    const { data: activation } = await admin
      .from('activations')
      .select('id')
      .eq('license_id', license.id)
      .eq('device_id', device_id)
      .maybeSingle()

    if (!activation) {
      return NextResponse.json({ ok: false, error: 'device_no_activado' }, { status: 403 })
    }

    const userId = license.user_id

    // === DETALLE: una lista concreta con sus items ===
    if (schedule_id) {
      const { data: row, error } = await admin
        .from('cloud_schedules')
        .select('id, title, service_date, is_template, items, items_count, updated_at')
        .eq('user_id', userId)
        .eq('id', schedule_id)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
      }
      if (!row) {
        return NextResponse.json({ ok: false, error: 'no_encontrada' }, { status: 404 })
      }
      return NextResponse.json({
        ok: true,
        schedule: {
          id: row.id,
          title: row.title,
          service_date: row.service_date,
          is_template: !!row.is_template,
          items: Array.isArray(row.items) ? row.items : [],
          items_count: row.items_count,
          updated_at: row.updated_at,
        },
      })
    }

    // === LISTADO: metadata sin el jsonb items ===
    const { data: rows, error } = await admin
      .from('cloud_schedules')
      .select('id, title, service_date, is_template, items_count, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
    }

    const schedules = (rows || []).map(r => ({
      id: r.id,
      title: r.title,
      service_date: r.service_date,
      is_template: !!r.is_template,
      items_count: r.items_count,
      updated_at: r.updated_at,
    }))

    return NextResponse.json({ ok: true, schedules })
  } catch (e) {
    console.error('[schedules/pull] uncaught')
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
