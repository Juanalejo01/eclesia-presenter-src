// POST /api/account/recovery
// Actualiza los datos de recuperacion/contacto del usuario autenticado:
// recovery_email y phone, en la tabla profiles.
//
// Auth: por sesion de Supabase (cookies). RLS permite al usuario actualizar
// su propio profile, asi que usamos el cliente de servidor con la sesion.

import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'

export const dynamic = 'force-dynamic'

// Validacion minima de email/telefono
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    let { recovery_email, phone } = body || {}

    // Normalizar / validar
    recovery_email = (recovery_email || '').trim() || null
    phone = (phone || '').trim() || null

    if (recovery_email && !EMAIL_RE.test(recovery_email)) {
      return NextResponse.json({ ok: false, error: 'email_invalido' }, { status: 400 })
    }
    if (recovery_email && recovery_email.length > 200) {
      return NextResponse.json({ ok: false, error: 'email_muy_largo' }, { status: 400 })
    }
    if (phone && phone.length > 40) {
      return NextResponse.json({ ok: false, error: 'telefono_invalido' }, { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ recovery_email, phone, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      console.error('[account/recovery] update error')
      return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[account/recovery] uncaught')
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
