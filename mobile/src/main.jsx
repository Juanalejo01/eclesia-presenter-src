import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { registerSW } from './pwa/registerSW.js'
import './index.css'

// basename derivado del base del build:
//   - build default (base '/')     → basename '/'    (Capacitor / Vercel)
//   - build embed  (base '/app/')  → basename '/app' (servido por el desktop)
// SIN esto, el router montado en /app/ no matchearía ninguna ruta y la
// pantalla quedaría en blanco. Cambio acoplado al doble build de T12.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Registro del service worker DESPUÉS del render: gated (no Capacitor nativo,
// solo secure context) y con catch silencioso. Ver src/pwa/registerSW.js.
registerSW(import.meta.env.BASE_URL)
