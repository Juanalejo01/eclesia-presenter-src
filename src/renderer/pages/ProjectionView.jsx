import { useEffect, useState } from 'react'
import SlideRenderer from '../components/SlideRenderer.jsx'
import { DEFAULT_THEME } from '../services/themeStore.js'

/**
 * Vista renderizada en la ventana de proyección (BrowserWindow nativa).
 * Recibe el slide y el theme via IPC desde el main process. Delega a
 * SlideRenderer para garantizar que el output coincide con la vista previa
 * del panel y el monitor PGM/PVW.
 *
 * Hace PULL del estado al montar (más confiable que esperar `projection:init`,
 * que tiene race condition con el primer render del componente).
 */
export default function ProjectionView() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const mode = params.get('mode') || 'background'

  const [slide, setSlide] = useState(window.__demoSlide || null)
  const [theme, setTheme] = useState(window.__demoTheme || DEFAULT_THEME)

  useEffect(() => {
    const proj = window.electron?.projection
    if (!proj) return

    // PULL: pide el estado actual al montar. Más confiable que projection:init.
    proj.state().then(state => {
      if (state?.slide) setSlide(state.slide)
      if (state?.theme) setTheme(prev => ({ ...prev, ...state.theme }))
    }).catch(() => {})

    // PUSH: y sigue suscrito a updates futuros.
    const offInit = proj.onInit(({ slide, theme }) => {
      if (slide) setSlide(slide)
      if (theme) setTheme(prev => ({ ...prev, ...theme }))
    })
    const offSlide = proj.onSlide((s) => setSlide(s))
    const offTheme = proj.onTheme((t) => setTheme(prev => ({ ...prev, ...t })))

    return () => { offInit?.(); offSlide?.(); offTheme?.() }
  }, [])

  const isOverlay = mode === 'overlay'

  // En modo overlay: NO pinta el fondo del tema. La ventana es transparente
  // y SlideRenderer respeta eso con transparentBg=true.
  const effectiveTheme = isOverlay
    ? { ...theme, bgType: 'transparent' }
    : theme

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', userSelect: 'none' }}>
      <SlideRenderer slide={slide} theme={effectiveTheme} transparentBg={isOverlay} />
    </div>
  )
}
