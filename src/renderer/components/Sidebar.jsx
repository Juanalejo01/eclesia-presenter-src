import {
  IconBible, IconMusic, IconList, IconProjector,
  IconImage, IconVideo, IconType, IconBroadcast, IconTools,
} from './Icons.jsx'
import { useT } from '../services/i18n.js'

// Nota: 'schedule' (Lista del día) intencionalmente NO está aquí.
// La Lista ahora vive siempre visible en la columna derecha bajo el monitor
// (ScheduleStrip en SlidePreview.jsx). Mantenerlo también en el sidebar
// era redundante y confundía: dos lugares para lo mismo.
const NAV = [
  { id: 'bible',       i18nKey: 'nav.bible',       Icon: IconBible,     badge: 66, shortcut: '1' },
  { id: 'songs',       i18nKey: 'nav.songs',       Icon: IconMusic,                shortcut: '2' },
  { id: 'image',       i18nKey: 'nav.image',       Icon: IconImage,                shortcut: '4' },
  { id: 'video',       i18nKey: 'nav.video',       Icon: IconVideo,                shortcut: '5' },
  { id: 'text',        i18nKey: 'nav.text',        Icon: IconType,                 shortcut: '6' },
  { id: 'tools',       label: 'Herramientas',      Icon: IconTools,                shortcut: 'T' },
  { id: 'projection',  i18nKey: 'nav.projection',  Icon: IconProjector,            shortcut: '7' },
  { id: 'transmision', i18nKey: 'nav.transmision', Icon: IconBroadcast,            shortcut: '8' },
]

export default function Sidebar({ active, onChange }) {
  const t = useT()
  return (
    <aside className="sidebar">
      {NAV.map(({ id, i18nKey, label: labelFixed, Icon, badge, shortcut }) => {
        const label = labelFixed || t(i18nKey)
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={`${label} · Ctrl+${shortcut}`}
            className={'nav-item' + (active === id ? ' active' : '')}
          >
            <span className="nav-icon-wrap">
              <Icon size={18} />
              {badge && <span className="nav-badge">{badge}</span>}
            </span>
            <span>{label}</span>
          </button>
        )
      })}
    </aside>
  )
}
