import { NavLink, useLocation } from 'react-router-dom'
import { useT } from '../hooks/useT.js'
import { tapLight } from '../services/haptics.js'

/**
 * BottomNav — barra de navegación inferior.
 *
 * Rediseño v0.2.1:
 *   - Iconos SVG stroke (los emoji se renderizaban distinto en cada
 *     Android, no admiten color de marca ni animación).
 *   - Píldora deslizante detrás del tab activo (transform animado con
 *     overshoot suave; `motion-reduce` la deja sin transición).
 *   - El icono activo "salta" 2px y toma el cobre del brand.
 *   - Haptic ligero al cambiar de tab (no-op en navegadores sin soporte).
 *
 * T13: las TABS guardan la KEY de i18n, no el string — un const a nivel
 * de modulo congelaria el idioma del import-time. La key se resuelve en
 * render via useT(), asi el label flippea en vivo al cambiar el idioma.
 */
const TABS = [
  { to: '/service', labelKey: 'nav.service', icon: 'service' },
  { to: '/bible',   labelKey: 'nav.bible',   icon: 'bible' },
  { to: '/songs',   labelKey: 'nav.songs',   icon: 'songs' },
  { to: '/more',    labelKey: 'nav.more',    icon: 'more' },
]

/* Iconos 24x24, stroke currentColor — heredan el color del NavLink,
   así la transición de color del tab los anima gratis. */
const ICON_PATHS = {
  service: (
    <>
      <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
      <path d="M10 8.5l4.5 2.5L10 13.5z" fill="currentColor" stroke="none" />
      <path d="M8 21h8" />
    </>
  ),
  bible: (
    <>
      <path d="M5 4.5h10.5a3 3 0 0 1 3 3V19a.5.5 0 0 1-.5.5H7A2.5 2.5 0 0 1 4.5 17V5a.5.5 0 0 1 .5-.5z" />
      <path d="M4.5 16.5A2.5 2.5 0 0 1 7 14h11.5" />
      <path d="M11 7.5v5M8.75 9.75h4.5" />
    </>
  ),
  songs: (
    <>
      <path d="M9 18.5V6.2a.5.5 0 0 1 .38-.49l8-1.9a.5.5 0 0 1 .62.49v11.2" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <circle cx="15.5" cy="15.5" r="2.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
}

function TabIcon({ name, active }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={
        'h-[22px] w-[22px] transition-transform duration-300 motion-reduce:transition-none ' +
        (active ? 'scale-110 -translate-y-0.5' : '')
      }>
      {ICON_PATHS[name]}
    </svg>
  )
}

export default function BottomNav() {
  const { t } = useT()
  const { pathname } = useLocation()
  const activeIndex = TABS.findIndex((tab) => pathname.startsWith(tab.to))

  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed bottom-0 left-0 right-0 z-50
                 bg-bg-2/95 backdrop-blur-md
                 border-t border-line-1"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="relative grid grid-cols-4 h-[62px]">
        {/* Píldora deslizante del tab activo. translateX en función del
            índice; el cubic-bezier con overshoot da el "rebote" sutil. */}
        {activeIndex >= 0 && (
          <div
            aria-hidden="true"
            data-testid="nav-indicator"
            className="absolute inset-y-0 left-0 w-1/4 p-1.5
                       transition-transform duration-300 motion-reduce:transition-none"
            style={{
              transform: `translateX(${activeIndex * 100}%)`,
              transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
            }}>
            <div className="h-full w-full rounded-2xl bg-copper-300/10 ring-1 ring-copper-300/20" />
          </div>
        )}

        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            onClick={() => { tapLight() }}
            className={({ isActive }) =>
              'relative z-10 flex flex-col items-center justify-center gap-0.5 ' +
              'text-[11px] font-medium transition-colors duration-300 motion-reduce:transition-none ' +
              (isActive
                ? 'text-copper-100'
                : 'text-ink-3 hover:text-ink-2 active:text-ink-2')
            }>
            {({ isActive }) => (
              <>
                <TabIcon name={tab.icon} active={isActive} />
                <span className={isActive ? 'font-semibold' : ''}>
                  {t(tab.labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
