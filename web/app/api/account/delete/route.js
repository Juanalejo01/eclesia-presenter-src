// POST /api/account/delete   -> programa el borrado (soft-delete, purga en 30 dias)
// POST con { cancel: true }   -> cancela el borrado programado
//
// No borramos inmediatamente: marcamos profiles.deletion_scheduled_at = now().
// Un job (purge_deleted_accounts) elimina las cuentas marcadas hace > 30 dias.
// Esto da al usuario margen para arrepentirse.
//
// Auth: sesion de Supabase (cookies). Usamos service_role solo para escribir
// deletion_scheduled_at de forma fiable.

import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'
import { createAdminClient } from '../../../../lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const cancel = body?.cancel === true

    const admin = createAdminClient()

    if (cancel) {
      // Cancelar el borrado programado
      const { error } = await admin
        .from('profiles')
        .update({ deletion_scheduled_at: null, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) {
        return NextResponse.json({ ok: false, error: 'cancel_failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, cancelled: true })
    }

    // Programar borrado: marcar deletion_scheduled_at = now()
    const scheduledAt = new Date().toISOString()
    const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await admin
      .from('profiles')
      .update({ deletion_scheduled_at: scheduledAt, updated_at: scheduledAt })
      .eq('id', user.id)

    if (error) {
      console.error('[account/delete] schedule error')
      return NextResponse.json({ ok: false, error: 'schedule_failed' }, { status: 500 })
    }

    // Cerrar la sesion del usuario (su cuenta esta marcada para borrado)
    await supabase.auth.signOut()

    return NextResponse.json({ ok: true, scheduled: true, purge_at: purgeAt })
  } catch (e) {
    console.error('[account/delete] uncaught')
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
