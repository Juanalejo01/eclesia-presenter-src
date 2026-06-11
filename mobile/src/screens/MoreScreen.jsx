/**
 * MoreScreen (T11, i18n + LanguageSwitcher en T13)
 *
 * Home del mando para tareas no operativas: anuncio rapido, panico
 * (cerrar proyeccion del PC), estado de conexion, ajustes (idioma) y
 * cuenta (desemparejar). Agrupada en 5 cards (MoreSection) dentro de la
 * safe-area, con el BottomNav respetando padding bottom.
 *
 * Decisiones:
 *   - Header sigue el patron de ServiceScreen/BibleScreen/SongsScreen.
 *   - Las acciones destructivas (Desemparejar, Cerrar proyeccion) viven
 *     SOLO aqui — antes habia un "Desemparejar" duplicado al fondo de
 *     ServiceScreen, eliminado en T11 para evitar divergencia.
 *   - T13: el placeholder 'Proximamente' de Ajustes se reemplazo por el
 *     LanguageSwitcher real (ES/EN/PT).
 *   - El confirm de Desemparejar sigue siendo window.confirm (texto via
 *     t() resuelto en el handler). Migrarlo a un ConfirmModal del brand
 *     (generalizacion de PanicModal) es follow-up documentado de T13 —
 *     fuera de scope aqui.
 */
import { useNavigate } from 'react-router-dom'
import MoreSection from '../components/MoreSection.jsx'
import StatusPill from '../components/StatusPill.jsx'
import AnnouncementForm from '../components/AnnouncementForm.jsx'
import PanicButton from '../components/PanicButton.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { transport } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { usePgmState } from '../hooks/usePgmState.js'
import { useT } from '../hooks/useT.js'

// Inyectada por Vite via define en vite.config.js. En el entorno de tests
// (Jest sin Vite) no esta definida — fallback al package.json mobile.
// eslint-disable-next-line no-undef
const MOBILE_VERSION = typeof __MOBILE_VERSION__ !== 'undefined' ? __MOBILE_VERSION__ : '0.1.0'

export default function MoreScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  // serverVersion del usePgmState (lo envia el desktop en pgm-update-theme
  // del handshake). Si todavia no llego, mostramos "desconocido".
  const { serverVersion } = usePgmState()

  function handleUnpair() {
    // window.confirm nativo: bloquea el thread (anti doble-tap) y anuncia
    // el modal al lector de pantalla. El texto se resuelve AQUI via t()
    // (no en un const de modulo) para que respete el idioma activo.
    const ok = window.confirm(t('more.unpairConfirm'))
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
        <h1 className="font-display text-3xl text-ink-1">{t('more.title')}</h1>
        <p className="text-sm text-ink-3 mt-0.5">{t('more.subtitle')}</p>
      </header>

      {/* Anuncio rapido — envia texto al PC y lo proyecta como slide. */}
      <MoreSection title={t('more.sectionAnnounce')}>
        <AnnouncementForm />
      </MoreSection>

      {/* Zona peligrosa — boton de panico (cerrar proyeccion del PC). */}
      <MoreSection title={t('more.sectionDanger')} tone="danger">
        <PanicButton />
      </MoreSection>

      {/* Conexion — estado actual + version del PC y del mando. */}
      <MoreSection title={t('more.sectionConnection')}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-2">{t('more.connectionState')}</span>
          <StatusPill />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-3">{t('more.pcLabel')}</p>
            <p className="text-sm text-ink-1 font-mono">
              {serverVersion ? `v${serverVersion}` : t('more.versionUnknown')}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-3">{t('more.remoteLabel')}</p>
            <p className="text-sm text-ink-1 font-mono">v{MOBILE_VERSION}</p>
          </div>
        </div>
        {!isConnected && !isConnecting && (
          <p className="text-xs text-ink-3">
            {t('more.versionHint')}
          </p>
        )}
      </MoreSection>

      {/* Ajustes — selector de idioma ES/EN/PT (T13). */}
      <MoreSection title={t('more.sectionSettings')}>
        <LanguageSwitcher />
      </MoreSection>

      {/* Cuenta — desemparejar mando (ubicacion canonica). */}
      <MoreSection title={t('more.sectionAccount')}>
        <button
          type="button"
          onClick={handleUnpair}
          className="w-full text-left p-3 rounded-lg text-base text-live
                     hover:bg-live/10 transition-colors
                     underline underline-offset-2 decoration-live/40"
          aria-label={t('more.unpairAria')}
        >
          {t('more.unpair')}
        </button>
        <p className="text-xs text-ink-3 px-3">
          {t('more.unpairCaption')}
        </p>
      </MoreSection>
    </div>
  )
}
