import { useEffect, useState } from 'react'
import Settings from './Settings.jsx'
import { LogoMonogram, IconSearch, IconSettings } from './Icons.jsx'

export default function Topbar({ onSettingsChange }) {
  const [showSettings, setShowSettings] = useState(false)
  const [time, setTime] = useState(formatNow())
  const [projectorOn, setProjectorOn] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setTime(formatNow()), 1000)
    return () => clearInterval(id)
  }, [])

  const openPresenter = () => window.electron?.openPresenter()

  return (
    <>
      <header className="header">
        <div className="brand">
          <div className="brand-mark"><LogoMonogram size={28} /></div>
          <div className="brand-name">Eclesia<em>Presenter</em></div>
          <span className="brand-version">v 0.2</span>
        </div>

        <div className="header-status">
          <span className="status-pill">
            <span className={'dot ' + (projectorOn ? '' : 'off')} />
            Proyector {projectorOn ? 'conectado' : 'desconectado'}
          </span>
          <span className="timecode">{time}</span>
          <span style={{ flex: 1 }} />
        </div>

        <div className="header-actions">
          <button className="btn btn-ghost">
            <IconSearch size={14} />
            <span style={{ color: 'var(--text-3)' }}>Buscar</span>
            <span className="kbd">⌘K</span>
          </button>
          <button className="btn" onClick={() => setShowSettings(true)} title="Ajustes">
            <IconSettings size={14} /> Ajustes
          </button>
          <button className="btn btn-primary" onClick={openPresenter}>
            Abrir proyector
          </button>
        </div>
      </header>

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} onUpdate={onSettingsChange} />
      )}
    </>
  )
}

function formatNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
