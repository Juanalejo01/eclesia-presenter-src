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
 *   - `usePgmState` (T6) suscribe a `pgm-update` y `pgm-update-theme` y
 *     devuelve `{ slide, theme, serverVersion }`. PgmPreview pinta el
 *     slide con el tema real del PC.
 *   - `auth-error` → disconnect + nav /pair (guarded por mountedRef).
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
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton.jsx'
import CommandButton from '../components/CommandButton.jsx'
import StatusPill from '../components/StatusPill.jsx'
import ModeChip from '../components/ModeChip.jsx'
import LanDualHint from '../components/LanDualHint.jsx'
import PgmPreview from '../components/PgmPreview.jsx'
import ScheduleList from '../components/ScheduleList.jsx'
import { transport, ClientCommand, ServerEvent } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { usePgmState } from '../hooks/usePgmState.js'
import { tapLight, tapMedium } from '../services/haptics.js'
import { useT } from '../hooks/useT.js'

export default function ServiceScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  // T6: slide + theme + serverVersion centralizados en usePgmState.
  // Mantiene esta screen enfocada en UX (botones, layout, navegación);
  // si en T11 hace falta el slide en otra parte se promueve a Context.
  const { slide, theme, serverVersion } = usePgmState()
  // Flag para evitar nav después del unmount: si el server emite
  // AUTH_ERROR justo cuando la screen ya está desmontándose, queremos
  // que el handler sea no-op en vez de tocar el router.
  const mountedRef = useRef(true)

  // Suscripción a AUTH_ERROR — el resto (PGM_UPDATE, pgm-update-theme)
  // las gestiona usePgmState. Aquí solo navegamos a /pair si el server
  // expulsa el token.
  useEffect(() => {
    mountedRef.current = true
    const offAuth = transport.subscribe(ServerEvent.AUTH_ERROR, () => {
      if (!mountedRef.current) return
      console.warn('[service] auth-error → desconectando + nav /pair')
      transport.disconnect()
      nav('/pair', { replace: true })
    })
    return () => {
      mountedRef.current = false
      try { offAuth() } catch { /* ignore */ }
    }
  }, [nav])

  // Disabled global de los comandos cuando no estamos OPEN. El transport
  // los encolaría igual, pero preferimos comunicar al operador que no
  // hay conexión a fingir que el comando salió.
  const cmdDisabled = !isConnected

  function handleNav(type) {
    if (cmdDisabled) return
    tapLight()
    transport.send({ type })
  }

  function handleSecondary(type) {
    if (cmdDisabled) return
    tapMedium()
    transport.send({ type })
  }

  // T11: el boton "Desemparejar" se movio a MoreScreen como ubicacion
  // canonica — evita duplicar acciones destructivas en dos pantallas
  // (riesgo de tap accidental, divergencia futura si se anade telemetria
  // a una pero no a la otra).

  const headerSubtitle = isConnected
    ? (serverVersion
        ? t('service.connectedVersion', { version: serverVersion })
        : t('service.connected'))
    : isConnecting
      ? t('service.reconnecting')
      : t('service.offline')

  return (
    <div
      className="px-4 pb-4 flex flex-col gap-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      {/* Header: título + chip de modo + StatusPill */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-3xl text-ink-1">{t('service.title')}</h1>
            <ModeChip mode="live" connected={isConnected} />
          </div>
          <p className="text-xs text-ink-3 mt-0.5">{headerSubtitle}</p>
        </div>
        <StatusPill />
      </header>

      {/* PGM preview — renderer fiel al PC con theme del server */}
      <PgmPreview slide={slide} theme={theme} />

      {/* Banner reconectando / offline */}
      {!isConnected && (
        <div
          className="rounded-lg bg-bg-2 border border-line-1 p-3 text-center text-sm text-ink-3"
          role="alert"
        >
          {isConnecting
            ? t('service.reconnecting')
            : t('service.offlineWifi')}
        </div>
      )}

      {/* Aviso dual (C4): offline real (no reconectando) → orienta a que el
          usuario puede preparar el culto desde las secciones cloud aunque no
          tenga el PC. Botones que cruzan a /songs?mode=cloud y /plans. */}
      {!isConnected && !isConnecting && (
        <LanDualHint
          variant="full"
          onNavigate={(path) => { tapLight(); nav(path) }}
        />
      )}

      {/* Botones principales Prev / Next */}
      <div className="grid grid-cols-2 gap-3">
        <BigButton
          onClick={() => handleNav(ClientCommand.PREV)}
          disabled={cmdDisabled}
          variant="primary"
          aria-label={t('service.prevAria')}
        >
          {t('service.prev')}
        </BigButton>
        <BigButton
          onClick={() => handleNav(ClientCommand.NEXT)}
          disabled={cmdDisabled}
          variant="primary"
          aria-label={t('service.nextAria')}
        >
          {t('service.next')}
        </BigButton>
      </div>

      {/* Botones secundarios Blank / Black / Clear */}
      <div className="flex gap-2">
        <CommandButton
          label={t('service.blank')}
          hint={t('service.blankHint')}
          variant="blank"
          disabled={cmdDisabled}
          onClick={() => handleSecondary(ClientCommand.BLANK)}
          aria-label={t('service.blankAria')}
        />
        <CommandButton
          label={t('service.black')}
          hint={t('service.blackHint')}
          variant="black"
          disabled={cmdDisabled}
          onClick={() => handleSecondary(ClientCommand.BLACK)}
          aria-label={t('service.blackAria')}
        />
        <CommandButton
          label={t('service.clear')}
          hint={t('service.clearHint')}
          variant="clear"
          disabled={cmdDisabled}
          onClick={() => handleSecondary(ClientCommand.CLEAR)}
          aria-label={t('service.clearAria')}
        />
      </div>

      {/* Cabecera de la sección de lista del día: botón "Planificar" →
          /plans (C3a). Visible SIEMPRE — el gating por cuenta/plan lo
          hace PlannerListScreen. ScheduleList pinta su propio header
          con el contador, así que aquí solo va la acción, alineada a
          la derecha. */}
      <div className="flex justify-end -mb-2">
        <button
          type="button"
          onClick={() => { tapLight(); nav('/plans') }}
          aria-label={t('planner.entryAria')}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg
                     text-xs font-medium text-copper-100 bg-copper-300/10
                     ring-1 ring-copper-300/20 hover:bg-copper-300/20 transition-colors"
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" className="h-4 w-4"
          >
            <rect x="4" y="5" width="16" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M4 11h16M9.5 15.5l1.8 1.8 3.2-3.3" />
          </svg>
          {t('planner.entry')}
        </button>
      </div>

      {/* Lista del día — sortable con drag&drop táctil. Tap proyecta el
          item; el handle (⋮⋮) inicia el drag para reordenar. El componente
          se suscribe a schedule-update internamente vía useSchedule. */}
      <ScheduleList />

      {/* T11: el boton "Desemparejar" se movio a More > Cuenta. */}
    </div>
  )
}
