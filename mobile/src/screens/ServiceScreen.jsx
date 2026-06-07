/**
 * ServiceScreen
 *
 * Pantalla principal del remoto durante el servicio. El usuario pasa
 * aquí el 95% del tiempo, así que la prioridad es: feedback inmediato
 * del estado de conexión, dos botones grandes Prev/Next siempre
 * accesibles con el pulgar, y tres secundarios Blank/Black/Clear
 * justo debajo.
 *
 * Cableado al transport:
 *   - `pgm-update` → estado local `slide`, renderiza PgmPreview.
 *   - `pgm-update-theme` → guarda `serverVersion` para mostrarlo en el
 *     subtítulo del header. Lo emite el server en el handshake y cuando
 *     cambia el tema.
 *   - `auth-error` → setea flag → effect navega a /pair.
 *
 * Estados visuales:
 *   - Sin conexión: banner gris debajo del preview + botones gris.
 *   - Reconectando: misma forma con texto "Reconectando..."
 *   - Conectado: botones activos, header muestra versión del server.
 *
 * Por qué deshabilitamos botones cuando no hay conexión en vez de
 * dejar que la cola del transport los acepte: UX explícito. Al usuario
 * no le sirve apretar Next y que "parezca" funcionar pero nada cambie
 * en el monitor. Mejor que vea que no puede operar y reaccione (mire
 * la WiFi, abra Ajustes → Transmisión, etc.).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton.jsx'
import CommandButton from '../components/CommandButton.jsx'
import StatusPill from '../components/StatusPill.jsx'
import PgmPreview from '../components/PgmPreview.jsx'
import { transport, ClientCommand, ServerEvent } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { tapLight, tapMedium } from '../services/haptics.js'

export default function ServiceScreen() {
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  const [slide, setSlide] = useState(null)
  const [serverVersion, setServerVersion] = useState(null)
  const [authError, setAuthError] = useState(false)

  // Suscripciones a eventos del server. Cada subscribe devuelve su
  // unsubscribe — los limpiamos en cleanup para no acumular handlers
  // si la screen se monta y desmonta varias veces (p.ej. navegando
  // por la BottomNav).
  useEffect(() => {
    const offs = [
      transport.subscribe(ServerEvent.PGM_UPDATE, (payload) => {
        console.log('[service] pgm-update', payload)
        setSlide(payload || null)
      }),
      // El server emite `pgm-update-theme` en el handshake y al cambiar
      // el tema. Sólo nos interesa la versión por ahora. Lo suscribimos
      // por literal porque T2 no lo expuso en ServerEvent (es un evento
      // de tema-de-presentación, no de slide en vivo).
      transport.subscribe('pgm-update-theme', (payload) => {
        if (payload && typeof payload.version === 'string') {
          setServerVersion(payload.version)
        }
      }),
      transport.subscribe(ServerEvent.AUTH_ERROR, () => {
        console.warn('[service] auth-error recibido, navegando a /pair')
        setAuthError(true)
      }),
    ]
    return () => {
      for (const off of offs) {
        try { off() } catch { /* ignore */ }
      }
    }
  }, [])

  // Auth-error: limpia el transport y desplaza a /pair. Lo hacemos en
  // un effect aparte para que el `transport.disconnect()` ocurra fuera
  // del callback del subscribe (el disconnect invalida generations y
  // emitEvent recorre el Set actual; mejor no mutarlo dentro).
  useEffect(() => {
    if (!authError) return
    console.log('[service] disconnect + nav /pair por auth-error')
    transport.disconnect()
    nav('/pair', { replace: true })
  }, [authError, nav])

  // Disabled global de los comandos cuando no estamos OPEN. El transport
  // los encolaría igual, pero preferimos comunicar al operador que no
  // hay conexión a fingir que el comando salió.
  const cmdDisabled = !isConnected

  function send(type) {
    if (cmdDisabled) return
    transport.send({ type })
  }

  function handleNav(type) {
    tapLight()
    send(type)
  }

  function handleSecondary(type) {
    tapMedium()
    send(type)
  }

  function handleUnpair() {
    const ok = window.confirm(
      '¿Desemparejar este mando? Tendrás que volver a escanear el PIN del PC.',
    )
    if (!ok) return
    console.log('[service] desemparejado por el usuario')
    transport.disconnect()
    nav('/pair', { replace: true })
  }

  const headerSubtitle = isConnected
    ? `Mando conectado${serverVersion ? ` · EclesiaPresenter v${serverVersion}` : ''}`
    : isConnecting
      ? 'Reconectando con el PC...'
      : 'Sin conexión con el PC'

  return (
    <div
      className="px-4 pb-4 flex flex-col gap-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      {/* Header: título + StatusPill */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">Servicio</h1>
          <p className="text-xs text-ink-3 mt-0.5">{headerSubtitle}</p>
        </div>
        <StatusPill />
      </header>

      {/* PGM preview */}
      <PgmPreview slide={slide} />

      {/* Banner reconectando / offline */}
      {!isConnected && (
        <div
          className="rounded-lg bg-bg-2 border border-line-1 p-3 text-center text-sm text-ink-3"
          role="alert"
        >
          {isConnecting
            ? 'Reconectando con el PC...'
            : 'Sin conexión con el PC. Comprueba la WiFi.'}
        </div>
      )}

      {/* Botones principales Prev / Next */}
      <div className="grid grid-cols-2 gap-3">
        <BigButton
          onClick={() => handleNav(ClientCommand.PREV)}
          disabled={cmdDisabled}
          variant="primary"
          aria-label="Slide anterior"
        >
          ◀ Prev
        </BigButton>
        <BigButton
          onClick={() => handleNav(ClientCommand.NEXT)}
          disabled={cmdDisabled}
          variant="primary"
          aria-label="Slide siguiente"
        >
          Next ▶
        </BigButton>
      </div>

      {/* Botones secundarios Blank / Black / Clear */}
      <div className="flex gap-2">
        <CommandButton
          label="Blank"
          hint="Slide en blanco"
          variant="blank"
          disabled={cmdDisabled}
          onClick={() => handleSecondary(ClientCommand.BLANK)}
          aria-label="Proyectar slide en blanco"
        />
        <CommandButton
          label="Black"
          hint="Pantalla negra"
          variant="black"
          disabled={cmdDisabled}
          onClick={() => handleSecondary(ClientCommand.BLACK)}
          aria-label="Proyectar pantalla negra"
        />
        <CommandButton
          label="Clear"
          hint="Quitar live"
          variant="clear"
          disabled={cmdDisabled}
          onClick={() => handleSecondary(ClientCommand.CLEAR)}
          aria-label="Quitar proyección en vivo"
        />
      </div>

      {/* Desemparejar — discreto, al fondo. Link gris para no competir con
          los CTAs principales pero accesible cuando el usuario lo busque. */}
      <div className="flex justify-center mt-2">
        <button
          type="button"
          onClick={handleUnpair}
          className="text-xs text-ink-3 hover:text-ink-2 underline underline-offset-2 transition"
        >
          Desemparejar este mando
        </button>
      </div>
    </div>
  )
}
