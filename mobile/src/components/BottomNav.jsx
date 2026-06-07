import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/service', label: 'Servicio',  icon: '\u{1F3AC}' },  // 🎬
  { to: '/bible',   label: 'Biblia',    icon: '\u{1F4D6}' },  // 📖
  { to: '/songs',   label: 'Canciones', icon: '\u{1F3B5}' },  // 🎵
  { to: '/more',    label: 'Más',       icon: '⋯' }      // ⋯
]

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50
                 bg-bg-2/95 backdrop-blur-md
                 border-t border-line-1
                 pb-safe-b"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-4 h-[60px]">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              'flex flex-col items-center justify-center gap-1 ' +
              'text-[11px] font-medium transition-colors ' +
              (isActive
                ? 'text-copper-100'
                : 'text-ink-3 hover:text-ink-2')
            }>
            <span className="text-xl" aria-hidden="true">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
