/**
 * PanicButton (T11)
 *
 * Boton de emergencia: cierra TODAS las ventanas de proyeccion del PC y
 * limpia el live. Destructivo y final — el operador del PC debe re-abrir
 * las ventanas manualmente desde Settings > Proyeccion.
 *
 * UX:
 *   - Variante danger (rojo), min-height grande para que se distinga del
 *     resto y sea facil de pulsar con seguridad en una urgencia.
 *   - Confirm modal OBLIGATORIO via window.confirm — el confirm bloquea
 *     el thread del WebView synchronously, eliminando race conditions de
 *     doble-tap. Texto explicito sobre el scope ("NO cierra la app del PC").
 *   - Deshabilitado si !isConnected — un panico sin red no produce efecto
 *     util y mejor signalar que ya esta caido que dar feedback ambiguo.
 *
 * NO hay rollback: closeAll() destruye las BrowserWindows. La asimetria
 * (facil cerrar, manual abrir) es DELIBERADA — el panico debe ser real,
 * no un toggle reversible.
 *
 * TODO: migrar window.confirm a AppDialog mobile cuando exista (mismo TODO
 * que ServiceScreen.handleUnpair). Mientras tanto el nativo cumple — bloquea
 * el thread, anuncia el modal al lector de pantalla y obliga decision.
 */
import { useState } from 'react'
import BigButton from './BigButton.jsx'
import { transport, ClientCommand } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { tapMedium } from '../services/haptics.js'

const CONFIRM_TEXT =
  '¿Cerrar todas las ventanas de proyección?\n\n' +
  'El operador del PC tendrá que reabrirlas manualmente desde ' +
  'Ajustes > Proyección.\n\n' +
  'Esto NO cierra la app del PC.'

export default function PanicButton() {
  const { isConnected } = useConnection()
  // 'idle' → boton listo. 'closed' → feedback temporal "Cerrado" tras envio
  // OK. Volvemos a idle tras 3s para que el operador pueda repetir si hace
  // falta (ej. reaparecio una ventana por algun edge case raro).
  const [phase, setPhase] = useState('idle')

  function handleClick() {
    if (!isConnected) return
    tapMedium()
    // window.confirm bloquea el thread sincronamente — sin esto, un doble-tap
    // rapido podria mandar dos PROJECTION_CLOSE. El segundo seria no-op (no
    // hay ventanas que cerrar) pero ensucia el log y consume bateria.
    const ok = window.confirm(CONFIRM_TEXT)
    if (!ok) return
    transport.send({ type: ClientCommand.PROJECTION_CLOSE })
    setPhase('closed')
    setTimeout(() => setPhase('idle'), 3000)
  }

  const disabled = !isConnected || phase === 'closed'

  return (
    <div className="space-y-2">
      <BigButton
        onClick={handleClick}
        disabled={disabled}
        variant="danger"
        aria-label="Cerrar de emergencia todas las ventanas de proyección del PC. Requiere confirmación."
      >
        {phase === 'closed' ? 'Cerrado' : '⛔ Cerrar proyección (emergencia)'}
      </BigButton>
      {!isConnected && (
        <p className="text-xs text-ink-3 text-center" role="status">
          Sin conexion con el PC
        </p>
      )}
    </div>
  )
}
