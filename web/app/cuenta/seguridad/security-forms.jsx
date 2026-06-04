'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'

export default function SecurityForms({ email, initialRecoveryEmail, initialPhone, deletionScheduledAt }) {
  const router = useRouter()

  // --- Datos de recuperacion / contacto ---
  const [recoveryEmail, setRecoveryEmail] = useState(initialRecoveryEmail)
  const [phone, setPhone] = useState(initialPhone)
  const [savingRecovery, setSavingRecovery] = useState(false)
  const [recoveryMsg, setRecoveryMsg] = useState(null)

  const saveRecovery = async (e) => {
    e.preventDefault()
    setSavingRecovery(true); setRecoveryMsg(null)
    try {
      const res = await fetch('/api/account/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recovery_email: recoveryEmail, phone }),
      })
      const data = await res.json()
      setRecoveryMsg(data.ok
        ? { ok: true, text: 'Datos guardados correctamente.' }
        : { ok: false, text: translate(data.error) })
    } catch {
      setRecoveryMsg({ ok: false, text: 'Error de red. Inténtalo de nuevo.' })
    } finally {
      setSavingRecovery(false)
    }
  }

  // --- Cerrar sesion ---
  const [loggingOut, setLoggingOut] = useState(false)
  const logout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  // --- Eliminar cuenta (soft-delete 30 dias) ---
  const [scheduled, setScheduled] = useState(!!deletionScheduledAt)
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const scheduleDelete = async () => {
    if (confirmText !== 'ELIMINAR') return
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (data.ok) {
        // La cuenta queda marcada y la sesion cerrada -> a home con aviso
        router.push('/?cuenta=eliminada')
        router.refresh()
      } else {
        setDeleting(false)
        alert('No se pudo programar el borrado. Inténtalo de nuevo.')
      }
    } catch {
      setDeleting(false)
      alert('Error de red.')
    }
  }

  const cancelDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel: true }),
      })
      const data = await res.json()
      if (data.ok) { setScheduled(false); router.refresh() }
    } finally { setDeleting(false) }
  }

  return (
    <div className="space-y-6">

      {/* Datos de recuperacion y contacto */}
      <section className="rounded-2xl border border-copper-300/15 bg-bg-2 p-6">
        <h2 className="font-display text-2xl text-ink-1 mb-1">Datos de recuperación y contacto</h2>
        <p className="text-sm text-ink-3 mb-5">
          Un correo o teléfono alternativo nos ayuda a verificar tu identidad si
          pierdes acceso a tu cuenta. Solo lo usamos para recuperación y soporte.
        </p>

        <form onSubmit={saveRecovery} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-ink-3 mb-2">
              Correo principal (no editable)
            </label>
            <input
              type="email" value={email} disabled
              className="w-full h-11 px-4 rounded-lg bg-bg-1 border border-copper-300/10
                         text-ink-3 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-ink-3 mb-2">
              Correo de recuperación (alternativo)
            </label>
            <input
              type="email" value={recoveryEmail}
              onChange={e => setRecoveryEmail(e.target.value)}
              placeholder="otro@correo.com"
              className="w-full h-11 px-4 rounded-lg bg-bg-1 border border-copper-300/15
                         text-ink-1 placeholder-ink-4 outline-none
                         focus:border-copper-300/50 focus:ring-2 focus:ring-copper-300/15"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-ink-3 mb-2">
              Teléfono de contacto (opcional)
            </label>
            <input
              type="tel" value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
              className="w-full h-11 px-4 rounded-lg bg-bg-1 border border-copper-300/15
                         text-ink-1 placeholder-ink-4 outline-none
                         focus:border-copper-300/50 focus:ring-2 focus:ring-copper-300/15"
            />
          </div>

          {recoveryMsg && (
            <div className={'text-xs px-3 py-2 rounded-md border ' + (recoveryMsg.ok
              ? 'text-green-300 bg-green-500/10 border-green-500/30'
              : 'text-red-400 bg-red-500/10 border-red-500/30')}>
              {recoveryMsg.text}
            </div>
          )}

          <button
            type="submit" disabled={savingRecovery}
            className="px-5 h-11 rounded-lg bg-gradient-to-b from-copper-200 to-copper-300
                       text-[#1a0e08] font-semibold disabled:opacity-50
                       hover:from-copper-100 hover:to-copper-200 transition-all"
          >
            {savingRecovery ? 'Guardando…' : 'Guardar datos'}
          </button>
        </form>
      </section>

      {/* Sesion */}
      <section className="rounded-2xl border border-copper-300/15 bg-bg-2 p-6">
        <h2 className="font-display text-2xl text-ink-1 mb-1">Sesión</h2>
        <p className="text-sm text-ink-3 mb-4">
          Cierra la sesión en este navegador. Podrás volver a entrar con tu correo.
        </p>
        <button
          onClick={logout} disabled={loggingOut}
          className="px-5 h-11 rounded-lg border border-copper-300/30 bg-bg-3
                     text-ink-1 font-medium hover:bg-bg-4 transition-all disabled:opacity-50"
        >
          {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </section>

      {/* Zona peligrosa: eliminar cuenta */}
      <section className="rounded-2xl border border-red-500/25 bg-red-500/[0.03] p-6">
        <h2 className="font-display text-2xl text-red-300 mb-1">Eliminar cuenta</h2>

        {scheduled ? (
          <>
            <p className="text-sm text-ink-2 mb-4 leading-relaxed">
              Tu cuenta está <b className="text-red-300">marcada para eliminación</b>.
              Se borrará de forma permanente a los <b>30 días</b>. Hasta entonces
              puedes cancelar y recuperar todo iniciando sesión de nuevo.
            </p>
            <button
              onClick={cancelDelete} disabled={deleting}
              className="px-5 h-11 rounded-lg bg-gradient-to-b from-copper-200 to-copper-300
                         text-[#1a0e08] font-semibold disabled:opacity-50
                         hover:from-copper-100 hover:to-copper-200 transition-all"
            >
              {deleting ? 'Cancelando…' : 'Cancelar eliminación'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-2 mb-2 leading-relaxed">
              Al eliminar tu cuenta se programará el borrado permanente de tu
              perfil, licencias y canciones en la nube. Tienes <b>30 días</b> para
              arrepentirte (volviendo a iniciar sesión); pasado ese plazo, todo se
              borra de forma irreversible.
            </p>
            <p className="text-xs text-ink-3 mb-4">
              Escribe <b className="text-red-300 font-mono">ELIMINAR</b> para confirmar.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text" value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="flex-1 h-11 px-4 rounded-lg bg-bg-1 border border-red-500/25
                           text-ink-1 placeholder-ink-4 outline-none
                           focus:border-red-500/50 focus:ring-2 focus:ring-red-500/15 font-mono"
              />
              <button
                onClick={scheduleDelete}
                disabled={deleting || confirmText !== 'ELIMINAR'}
                className="px-5 h-11 rounded-lg bg-red-500/90 text-white font-semibold
                           disabled:opacity-40 disabled:cursor-not-allowed
                           hover:bg-red-500 transition-all whitespace-nowrap"
              >
                {deleting ? 'Procesando…' : 'Eliminar mi cuenta'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function translate(error) {
  const map = {
    email_invalido: 'El correo de recuperación no es válido.',
    email_muy_largo: 'El correo es demasiado largo.',
    telefono_invalido: 'El teléfono no es válido.',
    no_auth: 'Sesión expirada. Vuelve a iniciar sesión.',
    update_failed: 'No se pudo guardar. Inténtalo de nuevo.',
  }
  return map[error] || 'Ocurrió un error. Inténtalo de nuevo.'
}
