import { useEffect, useState } from 'react'
import { LogoMonogram, IconSettings } from './Icons.jsx'
import { useT } from '../services/i18n.js'

export default function Topbar({ onSettingsChange, onOpenSettings }) {
  const t = useT()
  const [time, setTime] = useState(formatNow())
  const [projectorOn, setProjectorOn] = useState(true)
  const [version, setVersion] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setTime(formatNow()), 1000)
    return () => clearInterval(id)
  }, [])

  // Pedir la versión real al main process (devuelve app.getVersion()).
  // Así no queda hardcoded en código.
  useEffect(() => {
    if (window.electron?.app?.info) {
      window.electron.app.info()
        .then(info => setVersion(info?.version || null))
        .catch(() => {})
    }
  }, [])

  // Abrir la ventana de proyección moderna (background = pantalla completa para el proyector físico).
  // Antes esto llamaba a window.electron.openPresenter() que cargaba la app entera de nuevo.
  const openPresenter = async () => {
    const proj = window.electron?.projection
    if (!proj) {
      alert('La proyección requiere la app nativa (npm run dev). En navegador no funciona.')
      return
    }
    try {
      const state = await proj.state()
      if (state.open.includes('background')) await proj.close('background')
      await proj.open({ mode: 'background' })
    } catch (e) {
      console.error('openPresenter failed:', e)
    }
  }

  // -webkit-app-region: drag → toda la header es zona arrastrable de la ventana
  // (como en Discord o VS Code). Los botones/links interactivos llevan
  // no-drag para que sigan clickables.
  const dragStyle = { WebkitAppRegion: 'drag' }
  const noDragStyle = { WebkitAppRegion: 'no-drag' }

  // Padding-right para dejar hueco a los botones de Windows (min/max/cerrar)
  // que ahora se dibujan en overlay sobre la app por titleBarOverlay (~138px en Win11).
  return (
    <>
      <header className="header" style={{ ...dragStyle, paddingRight: 152 }}>
        <div className="brand" style={noDragStyle}>
          <div className="brand-mark"><LogoMonogram size={28} /></div>
          <div className="brand-name">Eclesia<em>Presenter</em></div>
          <span className="brand-version">v {version || '0.2.x'}</span>
        </div>

        <div className="header-status">
          <span className="status-pill" style={noDragStyle}>
            <span className={'dot ' + (projectorOn ? '' : 'off')} />
            {projectorOn ? t('topbar.connected') : t('topbar.disconnected')}
          </span>
          <span className="timecode" style={noDragStyle}>{time}</span>
          <span style={{ flex: 1 }} />
        </div>

        <div className="header-actions" style={noDragStyle}>
          <button className="btn" onClick={() => onOpenSettings?.()} title={t('topbar.settings') + ' (Ctrl+A)'}>
            <IconSettings size={14} /> {t('topbar.settings')}
          </button>
          <button className="btn btn-primary" onClick={openPresenter} title="Abrir proyector (Ctrl+P)">
            {t('topbar.openProjector')}
          </button>
        </div>
      </header>
    </>
  )
}

function formatNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
