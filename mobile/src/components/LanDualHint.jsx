/**
 * LanDualHint (C4)
 *
 * Aviso orientativo que aparece en pantallas de MODO MANDO cuando NO hay
 * conexión con el PC. Resuelve el problema de UX central de C4: alguien que
 * abre la app en casa (sin el PC) veía "Sin conexión con el PC" y podía
 * pensar que la app está rota, sin descubrir que SÍ puede preparar el culto
 * desde las secciones cloud.
 *
 * Dos variantes:
 *   - variant="full" (ServiceScreen): explica qué hace falta para el mando
 *     LAN + ofrece dos botones que cruzan a las secciones cloud (Canciones ·
 *     Mi nube y Mis listas), que ya hacen su propio gating de cuenta/plan.
 *   - variant="compact" (Biblia, Canciones-PC): una sola línea + un enlace a
 *     la preparación cloud, sin repetir el bloque largo (esas pantallas ya
 *     tienen su propio banner de "comprueba la WiFi").
 *
 * No se muestra en reconexión (isConnecting): durante el reintento el texto
 * correcto es "Reconectando…", no "usa la nube". Las pantallas sólo montan
 * este componente cuando están realmente offline.
 *
 * Navegación: usa el `onNavigate(path)` inyectado (las pantallas pasan su
 * useNavigate ya con tapLight). Los destinos son rutas con query para que la
 * pantalla destino arranque en el modo correcto:
 *   - /songs?mode=cloud  → SongsScreen abre directamente "Mi nube"
 *   - /plans             → Mis listas
 */
import { useT } from '../hooks/useT.js'

export default function LanDualHint({ variant = 'full', onNavigate }) {
  const { t } = useT()

  function go(path) {
    if (typeof onNavigate === 'function') onNavigate(path)
  }

  if (variant === 'compact') {
    return (
      <div
        className="rounded-lg bg-copper-300/5 border border-copper-300/20 p-3 text-xs text-ink-3 leading-relaxed"
        role="note"
        aria-label={t('dualMode.hintAria')}
      >
        {t('dualMode.compactBody')}{' '}
        <button
          type="button"
          onClick={() => go('/songs?mode=cloud')}
          className="font-medium text-copper-100 underline underline-offset-2 hover:text-copper-200 transition-colors"
        >
          {t('dualMode.compactLink')}
        </button>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl bg-copper-300/5 border border-copper-300/20 p-4 space-y-3"
      role="note"
      aria-label={t('dualMode.hintAria')}
    >
      <p className="text-sm text-ink-2 leading-relaxed">
        <span className="block font-semibold text-copper-100 mb-1">
          {t('dualMode.title')}
        </span>
        {t('dualMode.needPc')}
      </p>
      <p className="text-sm text-ink-2 leading-relaxed">
        {t('dualMode.prepareFromHere')}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => go('/songs?mode=cloud')}
          aria-label={t('dualMode.gotoSongsAria')}
          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg
                     text-sm font-medium text-copper-100 bg-copper-300/10
                     ring-1 ring-copper-300/25 hover:bg-copper-300/20 transition-colors"
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          {t('dualMode.gotoSongs')}
        </button>
        <button
          type="button"
          onClick={() => go('/plans')}
          aria-label={t('dualMode.gotoPlansAria')}
          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg
                     text-sm font-medium text-copper-100 bg-copper-300/10
                     ring-1 ring-copper-300/25 hover:bg-copper-300/20 transition-colors"
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4"
          >
            <rect x="4" y="5" width="16" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M4 11h16M9.5 15.5l1.8 1.8 3.2-3.3" />
          </svg>
          {t('dualMode.gotoPlans')}
        </button>
      </div>
    </div>
  )
}
