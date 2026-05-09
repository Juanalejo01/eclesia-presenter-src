import { useEffect, useState } from 'react'
import SlideRenderer from '../components/SlideRenderer.jsx'
import LowerThirdRenderer from '../components/LowerThirdRenderer.jsx'
import { DEFAULT_THEME } from '../services/themeStore.js'

/**
 * Vista renderizada en la ventana de proyección (BrowserWindow nativa).
 *
 * Dos modos según `?mode=` en el hash:
 *   - background → pantalla completa con fondo del tema (proyector físico)
 *   - overlay    → lower-third estilo broadcast (banda inferior, capturable por OBS)
 */
export default function ProjectionView() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const mode = params.get('mode') || 'background'
  const isOverlay = mode === 'overlay'

  const [slide, setSlide] = useState(window.__demoSlide || null)
  const [theme, setTheme] = useState(window.__demoTheme || DEFAULT_THEME)

  // CRÍTICO para overlay: el body de eclesia-design.css tiene `background: var(--bg-0)`
  // que es opaco. Lo forzamos a transparent SOLO en modo overlay para que la captura
  // de OBS muestre realmente solo el lower-third con el resto transparente.
  useEffect(() => {
    if (!isOverlay) return
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')

    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      rootBg: root?.style.background,
    }

    html.style.background = 'transparent'
    body.style.background = 'transparent'
    if (root) root.style.background = 'transparent'

    return () => {
      html.style.background = prev.htmlBg
      body.style.background = prev.bodyBg
      if (root) root.style.background = prev.rootBg
    }
  }, [isOverlay])

  useEffect(() => {
    const proj = window.electron?.projection
    if (!proj) return

    proj.state().then(state => {
      if (state?.slide) setSlide(state.slide)
      if (state?.theme) setTheme(prev => ({ ...prev, ...state.theme }))
    }).catch(() => {})

    const offInit = proj.onInit(({ slide, theme }) => {
      if (slide) setSlide(slide)
      if (theme) setTheme(prev => ({ ...prev, ...theme }))
    })
    const offSlide = proj.onSlide((s) => setSlide(s))
    const offTheme = proj.onTheme((t) => setTheme(prev => ({ ...prev, ...t })))

    return () => { offInit?.(); offSlide?.(); offTheme?.() }
  }, [])

  if (isOverlay) {
    return <LowerThirdRenderer slide={slide} theme={theme} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', userSelect: 'none' }}>
      <SlideRenderer slide={slide} theme={theme} />
    </div>
  )
}
