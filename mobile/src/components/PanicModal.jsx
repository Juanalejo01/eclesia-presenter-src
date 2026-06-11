/**
 * PanicModal (T13)
 *
 * Modal de confirmacion del boton de panico. Reemplaza al window.confirm
 * nativo (que ignoraba el tema cobre) con un alertdialog del brand.
 *
 * Deliberadamente CENTRADO y no bottom-sheet: un confirm destructivo
 * critico debe leerse como interrupcion, no como picker rutinario. Por la
 * misma razon NO hay gesto swipe-down (trivializaria el confirm).
 *
 * Anti doble-tap: window.confirm bloqueaba el thread sincronamente; aqui
 * lo replicamos con un inFlight ref + estado `confirming` — el boton se
 * deshabilita al primer tap y el ref garantiza que onConfirm dispare
 * exactamente UNA vez aunque un segundo tap aterrice en el mismo tick.
 *
 * a11y:
 *   - role=alertdialog + aria-modal + aria-labelledby/aria-describedby
 *     (los screen readers anuncian titulo+descripcion al abrir).
 *   - Focus inicial en CANCELAR (~50ms, mismo delay que los sheets) —
 *     default seguro para acciones destructivas.
 *   - Focus trap real: Tab/Shift+Tab ciclan entre los 2 botones; nunca
 *     escapan al fondo. Escape → onCancel. El fondo son siblings
 *     conditional-rendered, sin bookkeeping de aria-hidden.
 *   - Tap en el overlay cancela; el card hace stopPropagation.
 *
 * Restaurar el foco al trigger al cerrar es responsabilidad del padre
 * (PanicButton guarda el ref del boton disparador).
 *
 * Props: { open, onConfirm, onCancel } — controlado, presentacional.
 */
import { useEffect, useRef, useState } from 'react'
import { useT } from '../hooks/useT.js'

export default function PanicModal({ open, onConfirm, onCancel }) {
  const { t } = useT()
  const confirmBtnRef = useRef(null)
  const cancelBtnRef = useRef(null)
  const inFlightRef = useRef(false)
  const [confirming, setConfirming] = useState(false)

  // Re-armar el guard en cada apertura (el modal es reutilizable).
  useEffect(() => {
    if (open) {
      inFlightRef.current = false
      setConfirming(false)
    }
  }, [open])

  // Focus inicial en Cancelar tras el paint (patron de los sheets).
  useEffect(() => {
    if (!open) return
    const tmr = setTimeout(() => cancelBtnRef.current?.focus(), 50)
    return () => clearTimeout(tmr)
  }, [open])

  // Escape cancela + focus trap entre los focusables del dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = [confirmBtnRef.current, cancelBtnRef.current].filter(Boolean)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        // Shift+Tab desde el primero (o desde fuera) → wrap al ultimo.
        if (active === first || !focusables.includes(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab desde el ultimo (o desde fuera) → wrap al primero.
        if (active === last || !focusables.includes(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  function handleConfirm() {
    // Guard sincrono: dos taps en el mismo tick → un solo onConfirm.
    if (inFlightRef.current) return
    inFlightRef.current = true
    setConfirming(true)
    onConfirm?.()
  }

  const titleId = 'panic-modal-title'
  const bodyId = 'panic-modal-body'

  return (
    <div
      onClick={() => onCancel?.()}
      className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-5"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm mx-auto rounded-xl bg-bg-2 border-2 border-live p-5 shadow-2xl
                   motion-safe:animate-[fadeIn_120ms_ease-out]"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink-1 mb-3">
          {t('panic.confirmTitle')}
        </h2>
        <div id={bodyId} className="text-sm text-ink-2 leading-relaxed space-y-2 mb-5">
          <p>{t('panic.confirmBody')}</p>
          <p className="font-semibold text-ink-1">{t('panic.confirmScope')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            aria-disabled={confirming || undefined}
            className="w-full min-h-[52px] px-4 rounded-xl bg-live text-white font-semibold text-base
                       hover:bg-red-500 active:bg-red-600 transition active:scale-[0.98]
                       disabled:opacity-50 disabled:active:scale-100"
          >
            {t('panic.confirmCta')}
          </button>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={() => onCancel?.()}
            className="w-full min-h-[44px] px-4 rounded-xl bg-bg-3 text-ink-2 font-medium text-sm
                       hover:bg-bg-1 transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
