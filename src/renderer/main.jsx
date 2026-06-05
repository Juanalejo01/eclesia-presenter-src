import React from 'react'
import ReactDOM from 'react-dom/client'
import Router from './Router.jsx'
import './styles/index.css'
import './styles/eclesia-design.css'
// Importar el service de settings aplica el tema persistido al <html> antes del render
import './services/appSettingsService.js'

// CRÍTICO para la captura OBS del overlay:
// Detectamos modo overlay ANTES de renderizar React y forzamos clase en <html>.
// El CSS aplica `background: transparent !important` a html/body/#root cuando
// la clase está presente, ANTES del primer paint. Sin esto el body se pinta
// con var(--bg-0) opaco y OBS lo captura como fondo negro detrás del lower-third.
const hash = window.location.hash || ''
const isOverlayMode = /#\/projection.*[?&]mode=overlay/.test(hash)
if (isOverlayMode) {
  document.documentElement.classList.add('eclesia-overlay-mode')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
)

// Pre-calentar la Biblia activa en segundo plano, en tiempo de inactividad.
// El primer parseo del JSON (~4 MB) se hace ANTES de que el usuario entre al
// panel Biblia, evitando el congelamiento en frío al navegar. No bloquea el
// arranque: corre en requestIdleCallback (o un setTimeout de respaldo).
if (!isOverlayMode) {
  const warmBible = () => {
    import('./services/bibleService.js')
      .then(m => m.getBooks(m.getActiveVersion().id))
      .catch(() => {})
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warmBible, { timeout: 4000 })
  } else {
    setTimeout(warmBible, 1500)
  }
}
