import { NavLink } from 'react-router-dom'
import { useT } from '../hooks/useT.js'

// T13: las TABS guardan la KEY de i18n, no el string — un const a nivel
// de modulo congelaria el idioma del import-time. La key se resuelve en
// render via useT(), asi el label flippea en vivo al cambiar el idioma.
const TABS = [
  { to: '/service', labelKey: 'nav.service', icon: '\u{1F3AC}' },  // 🎬
  { to: '/bible',   labelKey: 'nav.bible',   icon: '\u{1F4D6}' },  // 📖
  { to: '/songs',   labelKey: 'nav.songs',   icon: '\u{1F3B5}' },  // 🎵
  { to: '/more',    labelKey: 'nav.more',    icon: '⋯' }      // ⋯
]

export default function BottomNav() {
  const { t } = useT()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50
                 bg-bg-2/95 backdrop-blur-md
                 border-t border-line-1
                 pb-safe-b"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-4 h-[60px]">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              'flex flex-col items-center justify-center gap-1 ' +
              'text-[11px] font-medium transition-colors ' +
              (isActive
                ? 'text-copper-100'
                : 'text-ink-3 hover:text-ink-2')
            }>
            <span className="text-xl" aria-hidden="true">{tab.icon}</span>
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
