/**
 * MoreScreen (T11)
 *
 * Home del mando para tareas no operativas: anuncio rapido, panico
 * (cerrar proyeccion del PC), estado de conexion, ajustes futuros y
 * cuenta (desemparejar). Agrupada en 5 cards (MoreSection) dentro de la
 * safe-area, con el BottomNav respetando padding bottom.
 *
 * Decisiones:
 *   - Header sigue el patron de ServiceScreen/BibleScreen/SongsScreen.
 *   - Las acciones destructivas (Desemparejar, Cerrar proyeccion) viven
 *     SOLO aqui — antes habia un "Desemparejar" duplicado al fondo de
 *     ServiceScreen, eliminado en T11 para evitar divergencia.
 *   - El selector de idioma queda como placeholder con badge "Proximamente"
 *     (T13). Estructura preparada para no rehacer el layout.
 *   - Modal confirm via window.confirm: TODO migrar a AppDialog mobile
 *     cuando exista. Mientras tanto el nativo es suficiente — bloquea el
 *     thread y obliga decision explicita.
 */
import { useNavigate } from 'react-router-dom'
import MoreSection from '../components/MoreSection.jsx'
import StatusPill from '../components/StatusPill.jsx'
import AnnouncementForm from '../components/AnnouncementForm.jsx'
import PanicButton from '../components/PanicButton.jsx'
import { transport } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { usePgmState } from '../hooks/usePgmState.js'

// Inyectada por Vite via define en vite.config.js. En el entorno de tests
// (Jest sin Vite) no esta definida — fallback al package.json mobile.
// eslint-disable-next-line no-undef
const MOBILE_VERSION = typeof __MOBILE_VERSION__ !== 'undefined' ? __MOBILE_VERSION__ : '0.1.0'

export default function MoreScreen() {
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  // serverVersion del usePgmState (lo envia el desktop en pgm-update-theme
  // del handshake). Si todavia no llego, mostramos "desconocido".
  const { serverVersion } = usePgmState()

  function handleUnpair() {
    // TODO: migrar a AppDialog mobile cuando exista — el window.confirm
    // nativo del WebView ignora el tema cobre y se ve fuera del brand,
    // pero bloquea el thread synchronously (anti doble-tap) y anuncia
    // el modal al lector de pantalla, asi que cumple por ahora.
    const ok = window.confirm(
      '¿Desemparejar este mando?\n\n' +
      'Borrara el token y volveras al QR de emparejamiento. ' +
      'Tendras que volver a escanear el PIN del PC.',
    )
    if (!ok) return
    console.warn('[more] desemparejado por el usuario')
    transport.disconnect()
    nav('/pair', { replace: true })
  }

  return (
    <div
      className="px-4 pb-24 space-y-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      {/* Header */}
      <header>
        <h1 className="font-display text-3xl text-ink-1">Mas</h1>
        <p className="text-sm text-ink-3 mt-0.5">Anuncios, ajustes y cuenta</p>
      </header>

      {/* Anuncio rapido — envia texto al PC y lo proyecta como slide. */}
      <MoreSection title="Anuncio rapido">
        <AnnouncementForm />
      </MoreSection>

      {/* Zona peligrosa — boton de panico (cerrar proyeccion del PC). */}
      <MoreSection title="Zona peligrosa" tone="danger">
        <PanicButton />
      </MoreSection>

      {/* Conexion — estado actual + version del PC y del mando. */}
      <MoreSection title="Conexion">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-2">Estado de la conexion</span>
          <StatusPill />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-3">PC</p>
            <p className="text-sm text-ink-1 font-mono">
              {serverVersion ? `v${serverVersion}` : 'desconocido'}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-3">Mando</p>
            <p className="text-sm text-ink-1 font-mono">v{MOBILE_VERSION}</p>
          </div>
        </div>
        {!isConnected && !isConnecting && (
          <p className="text-xs text-ink-3">
            La version del PC aparecera al reconectar.
          </p>
        )}
      </MoreSection>

      {/* Ajustes — placeholder para T13 (idioma). El item no es clickable
          ni tiene Link: es solo un slot reservado para no rehacer el
          layout cuando llegue la feature. */}
      <MoreSection title="Ajustes">
        <div
          className="flex items-center justify-between py-2 opacity-60"
          aria-disabled="true"
        >
          <span className="text-sm text-ink-2">Idioma</span>
          <span className="text-xs font-mono uppercase tracking-wider text-copper-200">
            Proximamente
          </span>
        </div>
        {/* T13 anadira selector ES/EN/PT aqui. */}
      </MoreSection>

      {/* Cuenta — desemparejar mando (ubicacion canonica). */}
      <MoreSection title="Cuenta">
        <button
          type="button"
          onClick={handleUnpair}
          className="w-full text-left p-3 rounded-lg text-base text-live
                     hover:bg-live/10 transition-colors
                     underline underline-offset-2 decoration-live/40"
          aria-label="Desemparejar este mando del PC"
        >
          Desemparejar este mando
        </button>
        <p className="text-xs text-ink-3 px-3">
          Borrara el token y volveras al QR de emparejamiento.
        </p>
      </MoreSection>
    </div>
  )
}
