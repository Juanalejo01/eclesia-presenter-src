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
 *   - Hardening v0.2.0: el confirm de Desemparejar dejo de ser
 *     window.confirm nativo — ahora usa ConfirmModal (variant danger),
 *     el mismo alertdialog del brand que el boton de panico.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MoreSection from '../components/MoreSection.jsx'
import StatusPill from '../components/StatusPill.jsx'
import ModeChip from '../components/ModeChip.jsx'
import AnnouncementForm from '../components/AnnouncementForm.jsx'
import PanicButton from '../components/PanicButton.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import PlanBadge from '../components/PlanBadge.jsx'
import { transport } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { usePgmState } from '../hooks/usePgmState.js'
import { useAccount } from '../hooks/useAccount.js'
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
  // Cuenta Supabase (C1): la fila muestra sesión + plan y navega a /account.
  const { status: accountStatus, email: accountEmail, isPro } = useAccount()
  const isSignedIn = accountStatus === 'signedIn'
  const [unpairConfirmOpen, setUnpairConfirmOpen] = useState(false)

  function handleUnpairConfirm() {
    // El anti doble-tap vive en ConfirmModal (inFlight ref): este handler
    // dispara exactamente una vez por apertura del modal.
    console.warn('[more] desemparejado por el usuario')
    setUnpairConfirmOpen(false)
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

      {/* Conexion — estado actual + version del PC y del mando. El ModeChip
          "En vivo · PC" deja explícito que esta sección (y las de mando:
          Servicio, Biblia, Canciones-PC) dependen del PC en la WiFi. */}
      <MoreSection title={t('more.sectionConnection')}>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
            {t('more.connectionState')}
            <ModeChip mode="live" connected={isConnected} />
          </span>
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

      {/* Cuenta — sesion Supabase (C1) + desemparejar mando (ubicacion canonica). */}
      <MoreSection title={t('more.sectionAccount')}>
        {/* Mis listas (C3a) — planificador cloud. Vive en Cuenta porque
            las listas estan ligadas a la cuenta/plan (gating en /plans). */}
        <button
          type="button"
          onClick={() => nav('/plans')}
          aria-label={t('planner.entryAria')}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg
                     hover:bg-bg-3 transition-colors text-left"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="text-base text-ink-1">{t('planner.moreRow')}</span>
            <ModeChip mode="cloud" />
          </span>
          <span aria-hidden="true" className="text-ink-3">→</span>
        </button>
        <button
          type="button"
          onClick={() => nav('/account')}
          aria-label={t('account.row.aria')}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg
                     hover:bg-bg-3 transition-colors text-left"
        >
          {isSignedIn ? (
            <>
              <span className="text-base text-ink-1 truncate">{accountEmail}</span>
              <PlanBadge isPro={isPro} />
            </>
          ) : (
            <>
              <span className="text-base text-ink-1">{t('account.row.signIn')}</span>
              <span aria-hidden="true" className="text-ink-3">→</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setUnpairConfirmOpen(true)}
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

      {/* Confirm de desemparejar — ConfirmModal del brand (no window.confirm). */}
      <ConfirmModal
        open={unpairConfirmOpen}
        variant="danger"
        title={t('more.unpairConfirmTitle')}
        message={t('more.unpairConfirm')}
        confirmLabel={t('more.unpairConfirmCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleUnpairConfirm}
        onCancel={() => setUnpairConfirmOpen(false)}
      />
    </div>
  )
}
