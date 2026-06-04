import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import SecurityForms from './security-forms'

export const metadata = { title: 'Privacidad y seguridad — EclesiaPresenter' }

export default async function SeguridadPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('recovery_email, phone, deletion_scheduled_at')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="container mx-auto px-6 py-12 max-w-3xl">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-copper-300/10">
        <Link href="/cuenta" className="text-xs text-copper-200 hover:text-copper-100 mb-3 inline-block">
          ← Volver a mi cuenta
        </Link>
        <h1 className="font-display text-4xl text-ink-1">Privacidad y seguridad</h1>
        <p className="text-ink-3 text-sm mt-1">
          Gestiona tus datos de recuperación, sesión y cuenta.
        </p>
      </div>

      <SecurityForms
        email={user.email}
        initialRecoveryEmail={profile?.recovery_email || ''}
        initialPhone={profile?.phone || ''}
        deletionScheduledAt={profile?.deletion_scheduled_at || null}
      />
    </div>
  )
}
