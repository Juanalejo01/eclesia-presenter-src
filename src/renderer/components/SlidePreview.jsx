import { useEffect, useState } from 'react'
import { useTheme } from '../services/themeStore.js'
import { useSlideStore, setPreviewMode, commitPreview, setLive } from '../services/slideStore.js'
import { subscribe as subscribeSchedule, getItems as getScheduleItems, removeItem as removeScheduleItem } from '../services/scheduleService.js'
import SlideRenderer from './SlideRenderer.jsx'
import {
  IconArrowRight, IconX, IconBible, IconMusic, IconList,
  IconImage, IconVideo, IconType, IconChevDown,
} from './Icons.jsx'
import { useT } from '../services/i18n.js'

export default function SlidePreview() {
  const t = useT()
  const theme = useTheme()
  const { live, preview, previewMode } = useSlideStore()
  const clearLive = () => setLive(null)
  // Estado del zoom: null = sin zoom, 'live' = zoom de PGM, 'preview' = zoom de PVW
  const [zoomMode, setZoomMode] = useState(null)

  return (
    <aside className="monitor">
      <div className="monitor-header">
        <div className="monitor-title">{t('monitor.programPreview')}</div>
        <div className="pgm-switch">
          <button className={!previewMode ? 'active' : ''} onClick={() => setPreviewMode(false)}>PGM</button>
          <button className={previewMode ? 'active' : ''} onClick={() => setPreviewMode(true)}>Multi</button>
        </div>
      </div>

      <div className="monitor-body">
        <div className="mon-block">
          <div className="mon-label">
            <span className="mon-label-text" style={{ color: 'var(--live)' }}>{t('monitor.live')}</span>
            <span className="mon-label-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              1920 × 1080
              <button
                onClick={() => setZoomMode('live')}
                title="Ver a pantalla completa"
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '2px 6px', borderRadius: 4,
                  fontSize: 11, opacity: 0.7,
                  border: '1px solid var(--line-2)',
                }}>
                ⛶ Zoom
              </button>
            </span>
          </div>
          <MonScreen slide={live} theme={theme} isLive label="PGM" t={t} />

          {/* Botón limpiar pantalla — atajo F9 */}
          <button
            onClick={clearLive}
            disabled={!live}
            className="btn"
            style={{
              width: '100%', justifyContent: 'space-between',
              marginTop: 8, height: 36,
              opacity: live ? 1 : 0.5,
            }}
            title={t('monitor.clearScreenTitle')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconX size={13} /> {t('monitor.clearScreen')}
            </span>
            <span className="kbd">F9</span>
          </button>
        </div>

        {previewMode && (
          <>
            <div className="mon-block">
              <div className="mon-label">
                <span className="mon-label-text">{t('monitor.next')}</span>
                <span className="mon-label-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  HD
                  <button
                    onClick={() => setZoomMode('preview')}
                    title="Ver el preview a pantalla completa"
                    style={{
                      all: 'unset', cursor: 'pointer',
                      padding: '2px 6px', borderRadius: 4,
                      fontSize: 11, opacity: 0.7,
                      border: '1px solid var(--line-2)',
                    }}>
                    ⛶ Zoom
                  </button>
                </span>
              </div>
              <MonScreen slide={preview} theme={theme} label="PVW" t={t} />
            </div>

            <button className="send-live" onClick={commitPreview} disabled={!preview}>
              <span>{t('monitor.takeOnAir')}</span>
              <span className="arrow"><IconArrowRight size={14} /></span>
            </button>
          </>
        )}

        {/* Lista del día — siempre visible bajo el monitor.
            En modo MULTI se renderiza colapsable para no apretar el espacio
            de las dos pantallas. */}
        <ScheduleStrip
          isMultiview={previewMode}
          onProject={(item) => setLive({ text: item.text, reference: item.reference, type: item.type })}
        />
      </div>

      {/* Modal de zoom: muestra el slide en pantalla completa al hacer click
          en el botón ⛶ Zoom. Se cierra con Esc, click en backdrop o botón ✕. */}
      {zoomMode && (
        <ZoomModal
          slide={zoomMode === 'live' ? live : preview}
          theme={theme}
          isLive={zoomMode === 'live'}
          onClose={() => setZoomMode(null)}
          t={t}
        />
      )}
    </aside>
  )
}

// ============================================================
// ZoomModal — slide a pantalla completa para que el operador vea
// con detalle qué se está proyectando (o qué entrará al aire).
// ============================================================
function ZoomModal({ slide, theme, isLive, onClose, t }) {
  // Esc cierra
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        padding: 24,
      }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 999,
            background: isLive ? 'rgba(232, 65, 65, 0.18)' : 'rgba(168, 95, 51, 0.18)',
            border: '1px solid ' + (isLive ? 'rgba(255,90,90,0.4)' : 'rgba(232,181,145,0.4)'),
            color: isLive ? '#ff6868' : 'var(--copper-100)',
            fontSize: 12, fontFamily: 'var(--font-mono)',
            fontWeight: 600, letterSpacing: '0.1em',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isLive ? '#ff5a5a' : 'var(--copper-200)',
              boxShadow: '0 0 8px currentColor',
            }} />
            {isLive ? (t ? t('monitor.onAir') : 'ON AIR') : 'PREVIEW'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            1920 × 1080 · Esc o click fuera para cerrar
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            all: 'unset', cursor: 'pointer',
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff', fontSize: 14,
          }}>
          ✕ Cerrar
        </button>
      </div>

      {/* Slide a 16:9 ocupando el espacio disponible */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 0,
        }}>
        <div style={{
          position: 'relative',
          width: '100%', maxWidth: 'calc((100vh - 120px) * 16 / 9)',
          aspectRatio: '16 / 9',
          border: '1px solid ' + (isLive ? 'rgba(255,90,90,0.4)' : 'rgba(232,181,145,0.25)'),
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: isLive
            ? '0 0 60px rgba(255,90,90,0.25), 0 12px 60px rgba(0,0,0,0.7)'
            : '0 0 40px rgba(232,181,145,0.15), 0 12px 60px rgba(0,0,0,0.7)',
        }}>
          <SlideRenderer slide={slide} theme={theme} isBlackout={slide?.type === 'blackout'} />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ScheduleStrip — Lista del día compacta bajo el monitor.
// En modo PGM (1 monitor): siempre expandida.
// En modo MULTI (2 monitores): colapsable para no apretar la altura.
// Click en un item: lo proyecta al aire directamente.
// ============================================================
const SCHED_ICONS = {
  bible: IconBible, song: IconMusic, image: IconImage,
  video: IconVideo, text: IconType,
}

function ScheduleStrip({ isMultiview, onProject }) {
  const [items, setItems] = useState(getScheduleItems)
  // Colapsada por defecto en multiview, abierta en PGM-only
  const [expanded, setExpanded] = useState(!isMultiview)

  useEffect(() => subscribeSchedule(setItems), [])
  // Al cambiar de modo monitor, ajustar el default de colapso
  useEffect(() => { setExpanded(!isMultiview) }, [isMultiview])

  if (items.length === 0) {
    return (
      <div style={{
        marginTop: 12, padding: 10,
        border: '1px dashed var(--line-1)',
        borderRadius: 8,
        background: 'var(--bg-1)',
        fontSize: 11, color: 'var(--text-3)',
        fontFamily: 'var(--font-mono)',
        textAlign: 'center',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Lista vacía · añade desde paneles
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--line-1)',
      borderRadius: 8,
      background: 'var(--bg-1)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'var(--bg-2)',
          fontSize: 12,
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--copper-200)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Lista del día
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, padding: '0 6px',
            borderRadius: 999,
            background: 'rgba(168, 95, 51, 0.20)',
            color: 'var(--copper-100)',
            fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>{items.length}</span>
        </span>
        <span style={{
          color: 'var(--text-3)',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 0.18s',
        }}>
          <IconChevDown size={12} />
        </span>
      </button>

      {expanded && (
        <div style={{
          maxHeight: isMultiview ? 180 : 260,
          overflowY: 'auto',
        }}>
          {items.map((item, idx) => {
            const Icon = SCHED_ICONS[item.type] || IconList
            return (
              <div key={item.id || idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr auto',
                  alignItems: 'center', gap: 8,
                  padding: '7px 10px',
                  borderTop: idx > 0 ? '1px solid var(--line-1)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onClick={() => onProject(item)}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: 'var(--copper-200)', display: 'flex' }}>
                  <Icon size={12} />
                </span>
                <span style={{
                  fontSize: 12, color: 'var(--text-1)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.title || item.reference || item.text?.slice(0, 50) || '(sin título)'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeScheduleItem(item.id) }}
                  title="Quitar de la lista"
                  style={{
                    all: 'unset', cursor: 'pointer',
                    color: 'var(--text-3)',
                    padding: '2px 4px',
                    opacity: 0.5,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}>
                  <IconX size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MonScreen({ slide, theme, isLive, label, t }) {
  const isBlackout = slide?.type === 'blackout'
  return (
    <div className={'mon-screen' + (isLive ? ' live-screen' : '')} style={{ background: 'transparent' }}>
      <SlideRenderer slide={slide} theme={theme} isBlackout={isBlackout} />
      <span className="mon-corner left" style={{ zIndex: 2 }}>
        {isLive
          ? <span className="tally live"><span className="led" /> {t ? t('monitor.onAir') : 'ON AIR'}</span>
          : <span className="tally preview"><span className="led" /> {t ? t('monitor.preview') : 'Preview'}</span>}
      </span>
      <span className="mon-corner right" style={{ zIndex: 2 }}>{label}</span>
    </div>
  )
}
