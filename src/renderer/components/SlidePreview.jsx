import { useTheme } from '../services/themeStore.js'
import { useSlideStore, setPreviewMode, commitPreview } from '../services/slideStore.js'
import SlideRenderer from './SlideRenderer.jsx'
import { IconArrowRight } from './Icons.jsx'

export default function SlidePreview() {
  const theme = useTheme()
  const { live, preview, previewMode } = useSlideStore()

  return (
    <aside className="monitor">
      <div className="monitor-header">
        <div className="monitor-title">Programa / <b>Preview</b></div>
        <div className="pgm-switch">
          <button className={!previewMode ? 'active' : ''} onClick={() => setPreviewMode(false)}>PGM</button>
          <button className={previewMode ? 'active' : ''} onClick={() => setPreviewMode(true)}>Multi</button>
        </div>
      </div>

      <div className="monitor-body">
        <div className="mon-block">
          <div className="mon-label">
            <span className="mon-label-text" style={{ color: 'var(--live)' }}>En vivo</span>
            <span className="mon-label-text">1920 × 1080</span>
          </div>
          <MonScreen slide={live} theme={theme} isLive label="PGM" />
        </div>

        {previewMode && (
          <>
            <div className="mon-block">
              <div className="mon-label">
                <span className="mon-label-text">Próximo</span>
                <span className="mon-label-text">HD</span>
              </div>
              <MonScreen slide={preview} theme={theme} label="PVW" />
            </div>

            <button className="send-live" onClick={commitPreview} disabled={!preview}>
              <span>Tomar al aire</span>
              <span className="arrow"><IconArrowRight size={14} /></span>
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

function MonScreen({ slide, theme, isLive, label }) {
  const isBlackout = slide?.type === 'blackout'
  return (
    <div className={'mon-screen' + (isLive ? ' live-screen' : '')} style={{ background: 'transparent' }}>
      <SlideRenderer slide={slide} theme={theme} isBlackout={isBlackout} />
      <span className="mon-corner left" style={{ zIndex: 2 }}>
        {isLive
          ? <span className="tally live"><span className="led" /> ON AIR</span>
          : <span className="tally preview"><span className="led" /> Preview</span>}
      </span>
      <span className="mon-corner right" style={{ zIndex: 2 }}>{label}</span>
    </div>
  )
}
