// updateStore.js — hook centralizado para el estado del auto-updater.
//
// Fuente de verdad: el main process (src/main/autoUpdater.js). Aquí solo
// suscribimos los eventos del bridge (window.electron.updater.*) y exponemos
// un estado reactivo para que el botón del Topbar (UpdateButton.jsx) y
// cualquier otro consumidor futuro lo lean de forma declarativa.
//
// El estado inicial se hidrata llamando a updater.state() al montar, así si
// la app se reabre y el check de 30s ya pasó, el botón aparece de inmediato.

import { useEffect, useState } from 'react'

const INITIAL_STATE = {
  available: null,           // { version, releaseDate, releaseNotes } | null
  downloading: false,
  downloadProgress: null,    // { percent, bytesPerSecond, transferred, total } | null
  downloaded: false,
  error: null,
  isPortable: false,
  currentVersion: null,
}

export function useUpdateState() {
  const [s, setS] = useState(INITIAL_STATE)

  useEffect(() => {
    // En modo navegador (sin Electron) no hay bridge: dejamos el estado inicial.
    if (!window.electron?.updater) return

    let mounted = true

    // Hidratar desde el main al montar — cubre el caso "ya hubo update detectada
    // antes de que el componente existiera" (p. ej. tras el check inicial de 30s).
    window.electron.updater.state()
      .then(initial => { if (mounted && initial) setS(prev => ({ ...prev, ...initial })) })
      .catch(() => {})

    const off1 = window.electron.updater.onAvailable(d =>
      setS(prev => ({ ...prev, available: d, downloaded: false, error: null }))
    )
    const off2 = window.electron.updater.onNotAvailable(() =>
      setS(prev => ({ ...prev, available: null }))
    )
    const off3 = window.electron.updater.onDownloadProgress(p =>
      setS(prev => ({ ...prev, downloading: true, downloadProgress: p }))
    )
    const off4 = window.electron.updater.onDownloaded(d =>
      setS(prev => ({
        ...prev,
        downloading: false,
        downloaded: true,
        available: { ...(prev.available || {}), version: d.version, releaseDate: d.releaseDate },
      }))
    )
    const off5 = window.electron.updater.onError(e =>
      setS(prev => ({ ...prev, downloading: false, error: e?.error || 'error' }))
    )

    return () => {
      mounted = false
      try { off1 && off1() } catch {}
      try { off2 && off2() } catch {}
      try { off3 && off3() } catch {}
      try { off4 && off4() } catch {}
      try { off5 && off5() } catch {}
    }
  }, [])

  return s
}

export async function startDownload() {
  return window.electron?.updater?.download?.()
}

export function quitAndInstall() {
  return window.electron?.updater?.install?.()
}
