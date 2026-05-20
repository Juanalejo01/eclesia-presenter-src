import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import LogoutButton from './logout-button'

export const metadata = { title: 'Mi cuenta — EclesiaPresenter' }

export default async function CuentaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Cargar profile + licencias
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const { data: licenses } = await supabase
    .from('licenses')
    .select('*, activations(*)')
    .order('created_at', { ascending: false })

  const activeLicense = licenses?.find(l => l.status === 'active' || l.status === 'trialing')
  const isPro = !!activeLicense && activeLicense.plan !== 'free'

  return (
    <div className="container mx-auto px-6 py-12 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-10 pb-6 border-b border-copper-300/10">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-copper-200 mb-2">
            Mi cuenta
          </div>
          <h1 className="font-display text-4xl text-ink-1">
            Hola{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-ink-3 text-sm mt-1">{user.email}</p>
        </div>
        <LogoutButton />
      </div>

      {/* Plan status */}
      <div className={'rounded-2xl p-6 mb-6 border ' + (isPro
        ? 'border-copper-300/40 bg-gradient-to-br from-copper-300/10 to-bg-2 shadow-copper-glow'
        : 'border-copper-300/15 bg-bg-2'
      )}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-ink-3 mb-1">Plan actual</div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-3xl text-ink-1 capitalize">
                {activeLicense ? activeLicense.plan.replace('_', ' ') : 'Free'}
              </h2>
              {activeLicense && (
                <span className={'text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ' + (
                  activeLicense.status === 'active'   ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                  activeLicense.status === 'trialing' ? 'bg-copper-300/20 text-copper-200 border border-copper-300/30' :
                  activeLicense.status === 'past_due' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                                                       'bg-red-500/20 text-red-300 border border-red-500/30'
                )}>
                  {activeLicense.status}
                </span>
              )}
            </div>
            {activeLicense?.current_period_end && (
              <p className="text-xs text-ink-3 mt-2">
                Renueva el {new Date(activeLicense.current_period_end).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
          {!isPro && (
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-5 h-11 rounded-lg
                         bg-gradient-to-b from-copper-200 to-copper-300
                         text-[#1a0e08] font-semibold hover:from-copper-100 hover:to-copper-200 transition-all"
            >
              Actualizar a Pro
            </Link>
          )}
          {isPro && (
            <Link
              href="/cuenta/facturacion"
              className="inline-flex items-center justify-center px-5 h-11 rounded-lg
                         border border-copper-300/30 bg-bg-3 text-ink-1 font-medium
                         hover:bg-bg-4 transition-all"
            >
              Gestionar facturación
            </Link>
          )}
        </div>
      </div>

      {/* License key */}
      {activeLicense && (
        <div className="rounded-2xl border border-copper-300/15 bg-bg-2 p-6 mb-6">
          <div className="text-xs font-mono uppercase tracking-widest text-ink-3 mb-3">
            Tu clave de licencia
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <code className="font-mono text-xl tracking-wider text-copper-100 bg-bg-1 px-4 py-3 rounded-lg border border-copper-300/20 select-all">
              {activeLicense.license_key}
            </code>
            <p className="text-xs text-ink-3 max-w-sm">
              Pégala en EclesiaPresenter → Ajustes → Licencia para desbloquear las funciones Pro.
            </p>
          </div>
        </div>
      )}

      {/* Devices */}
      {activeLicense && (
        <div className="rounded-2xl border border-copper-300/15 bg-bg-2 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-ink-1">Dispositivos activados</h3>
              <p className="text-xs text-ink-3 mt-0.5">
                {(activeLicense.activations?.length || 0)} / {activeLicense.max_devices} PCs
              </p>
            </div>
          </div>
          {(activeLicense.activations || []).length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-6">
              Aún no has activado ningún PC. Pega tu clave en la app para empezar.
            </p>
          ) : (
            <div className="space-y-2">
              {activeLicense.activations.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-1 border border-copper-300/10">
                  <div>
                    <div className="text-sm text-ink-1 font-medium">{a.device_name || 'PC sin nombre'}</div>
                    <div className="text-xs text-ink-3 font-mono">
                      {a.os} · activo desde {new Date(a.created_at).toLocaleDateString('es-ES')}
                    </div>
                  </div>
                  <button className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-md hover:bg-red-500/10 transition-colors">
                    Desactivar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        <Link href="/download" className="rounded-xl border border-copper-300/15 bg-bg-2 p-5 hover:border-copper-300/30 transition-colors">
          <div className="text-2xl mb-2">📥</div>
          <div className="font-semibold text-ink-1 mb-1">Descargar app</div>
          <div className="text-xs text-ink-3">Última versión para Windows</div>
        </Link>
        <Link href="/docs" className="rounded-xl border border-copper-300/15 bg-bg-2 p-5 hover:border-copper-300/30 transition-colors">
          <div className="text-2xl mb-2">📚</div>
          <div className="font-semibold text-ink-1 mb-1">Documentación</div>
          <div className="text-xs text-ink-3">Guías y tutoriales</div>
        </Link>
        <a href="mailto:juanlpz.dev@gmail.com" className="rounded-xl border border-copper-300/15 bg-bg-2 p-5 hover:border-copper-300/30 transition-colors">
          <div className="text-2xl mb-2">💬</div>
          <div className="font-semibold text-ink-1 mb-1">Soporte</div>
          <div className="text-xs text-ink-3">Escríbenos para cualquier duda</div>
        </a>
      </div>
    </div>
  )
}
