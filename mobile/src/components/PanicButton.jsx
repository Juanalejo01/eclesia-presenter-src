/**
 * PanicButton (T11, modal brand en T13)
 *
 * Boton de emergencia: cierra TODAS las ventanas de proyeccion del PC y
 * limpia el live. Destructivo y final — el operador del PC debe re-abrir
 * las ventanas manualmente desde Settings > Proyeccion.
 *
 * UX:
 *   - Variante danger (rojo), min-height grande para que se distinga del
 *     resto y sea facil de pulsar con seguridad en una urgencia.
 *   - Confirm OBLIGATORIO via PanicModal (T13): alertdialog centrado del
 *     brand con focus trap real. El anti doble-tap que antes daba el
 *     window.confirm sincrono ahora vive en el modal (inFlight ref +
 *     disabled inmediato). Texto explicito sobre el scope ("NO cierra la
 *     app del PC").
 *   - Deshabilitado si !isConnected — un panico sin red no produce efecto
 *     util y mejor signalar que ya esta caido que dar feedback ambiguo.
 *   - Al cerrar el modal (confirm o cancel) el foco vuelve al trigger
 *     (BigButton via forwardRef) para no dejar al lector de pantalla
 *     huerfano.
 *
 * NO hay rollback: closeAll() destruye las BrowserWindows. La asimetria
 * (facil cerrar, manual abrir) es DELIBERADA — el panico debe ser real,
 * no un toggle reversible.
 */
import { useRef, useState } from 'react'
import BigButton from './BigButton.jsx'
import PanicModal from './PanicModal.jsx'
import { transport, ClientCommand } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { tapMedium } from '../services/haptics.js'
import { useT } from '../hooks/useT.js'

export default function PanicButton() {
  const { t } = useT()
  const { isConnected } = useConnection()
  // 'idle' → boton listo. 'closed' → feedback temporal "Cerrado" tras envio
  // OK. Volvemos a idle tras 3s para que el operador pueda repetir si hace
  // falta (ej. reaparecio una ventana por algun edge case raro).
  const [phase, setPhase] = useState('idle')
  const [modalOpen, setModalOpen] = useState(false)
  const triggerRef = useRef(null)

  function handleClick() {
    if (!isConnected) return
    tapMedium()
    setModalOpen(true)
  }

  function handleConfirm() {
    // El guard anti doble-tap vive en PanicModal (inFlight ref): este
    // handler dispara exactamente una vez por apertura del modal.
    transport.send({ type: ClientCommand.PROJECTION_CLOSE })
    setModalOpen(false)
    setPhase('closed')
    setTimeout(() => setPhase('idle'), 3000)
    // Restaurar foco al trigger (puede estar disabled durante 'closed';
    // focus() sobre disabled es no-op inofensivo).
    triggerRef.current?.focus()
  }

  function handleCancel() {
    setModalOpen(false)
    triggerRef.current?.focus()
  }

  const disabled = !isConnected || phase === 'closed'

  return (
    <div className="space-y-2">
      <BigButton
        ref={triggerRef}
        onClick={handleClick}
        disabled={disabled}
        variant="danger"
        aria-label={t('panic.triggerAria')}
      >
        {phase === 'closed' ? t('panic.closed') : t('panic.trigger')}
      </BigButton>
      {!isConnected && (
        <p className="text-xs text-ink-3 text-center" role="status">
          {t('panic.offline')}
        </p>
      )}
      <PanicModal
        open={modalOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  )
}
