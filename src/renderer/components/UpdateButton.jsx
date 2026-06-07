// UpdateButton.jsx — botón persistente en el Topbar que guía al usuario por
// el flujo completo de actualización de EclesiaPresenter.
//
// Estados (lee el updateStore como única fuente de verdad):
//   1. available + !downloading + !downloaded → "↑ Actualizar EclesiaPresenter v X.X.X"
//      → click llama a startDownload()
//   2. downloading → "Descargando NN%" (disabled, barra de progreso superpuesta)
//   3. downloaded → "↻ Reiniciar e instalar v X.X.X" (estilo verde "ready")
//      → click llama a quitAndInstall()
//   4. error con available → muestra mensaje en tooltip y permite reintentar download()
//   5. isPortable + available → abre el GitHub Release en navegador externo
//   6. sin available y sin downloaded → no renderiza nada
//   7. sin window.electron (modo navegador) → no renderiza nada
//
// El componente respeta WebkitAppRegion: 'no-drag' para ser clickable dentro
// del header (que tiene drag-region activo).

import { useUpdateState, startDownload, quitAndInstall } from '../services/updateStore.js'

export default function UpdateButton() {
  const s = useUpdateState()

  // En modo navegador o sin update detectada (ni descargada) → no renderizar.
  // currentVersion se hidrata desde el main; si no hay bridge nunca se hidrata.
  if (!s.available && !s.downloaded) return null

  const version = s.available?.version || ''
  const releaseDate = s.available?.releaseDate
  const noDragStyle = { WebkitAppRegion: 'no-drag' }

  // --- Estado 3: descargado → reiniciar e instalar ---
  if (s.downloaded) {
    return (
      <button
        className="btn btn-update btn-update-ready"
        onClick={() => quitAndInstall()}
        title={`Reinicia la app para instalar v${version}`}
        style={noDragStyle}
      >
        <span className="btn-update-icon" aria-hidden="true">↻</span>
        Reiniciar e instalar v{version}
      </button>
    )
  }

  // --- Estado 2: descargando ---
  if (s.downloading) {
    const pct = s.downloadProgress?.percent
    const pctRounded = typeof pct === 'number' && isFinite(pct) ? Math.round(pct) : null
    const label = pctRounded != null ? `Descargando ${pctRounded}%` : 'Descargando…'
    const width = pctRounded != null ? `${Math.max(0, Math.min(100, pctRounded))}%` : '0%'
    return (
      <button
        className="btn btn-update btn-update-downloading"
        disabled
        title={`Descargando EclesiaPresenter v${version}`}
        style={noDragStyle}
      >
        <span className="btn-update-progress" style={{ width }} aria-hidden="true" />
        <span className="btn-update-label">{label}</span>
      </button>
    )
  }

  // --- Estado 5: portable → abrir GitHub Release ---
  if (s.isPortable && s.available) {
    const url = `https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v${version}`
    const openExternal = (e) => {
      // Si el preload expone shell.openExternal úsalo; si no, deja que el <a> lo gestione.
      if (window.electron?.shell?.openExternal) {
        e.preventDefault()
        try { window.electron.shell.openExternal(url) } catch {}
      }
    }
    return (
      <a
        className="btn btn-update btn-update-available pulse-on-mount"
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={openExternal}
        title={buildTooltip('Descarga la nueva versión desde GitHub', releaseDate, s.error)}
        style={noDragStyle}
      >
        <span className="btn-update-icon" aria-hidden="true">↑</span>
        Descargar v{version} desde GitHub
      </a>
    )
  }

  // --- Estado 1 (y 4: con error, mismo botón con tooltip de aviso) ---
  const hasError = !!s.error
  return (
    <button
      className={'btn btn-update btn-update-available pulse-on-mount' + (hasError ? ' has-error' : '')}
      onClick={() => startDownload()}
      title={buildTooltip(
        hasError ? `Reintentar (error previo: ${s.error})` : 'Descargar la nueva versión',
        releaseDate,
        hasError ? s.error : null
      )}
      style={noDragStyle}
    >
      <span className="btn-update-icon" aria-hidden="true">↑</span>
      Actualizar EclesiaPresenter v{version}
      {hasError && <span className="btn-update-warn" aria-hidden="true">!</span>}
    </button>
  )
}

function buildTooltip(base, releaseDate, error) {
  const parts = [base]
  if (releaseDate) {
    try {
      const d = new Date(releaseDate)
      if (!isNaN(d.getTime())) parts.push(`Publicada: ${d.toLocaleDateString()}`)
    } catch {}
  }
  if (error) parts.push(`Error: ${error}`)
  return parts.join('\n')
}
