// Auto-updater para Windows (NSIS) usando GitHub Releases como feed.
//
// FLUJO:
//   1. Al startup (NSIS): check silencioso 30s después de createMainWindow.
//   2. Si hay versión nueva → emite 'updater:available' al renderer.
//   3. El renderer muestra notificación; usuario decide cuándo descargar.
//   4. Al hacer click en "Descargar" → emite 'updater:download-progress' cada
//      vez que avanza, y 'updater:downloaded' al terminar.
//   5. Al hacer click en "Reiniciar e instalar" → autoUpdater.quitAndInstall().
//
// PORTABLE: electron-updater no puede actualizar .exe portable in-place
// (no hay installer al que reemplazar). Detectamos via process.env.PORTABLE_EXECUTABLE_FILE
// y en ese caso solo notificamos "hay nueva versión, descárgala desde GitHub".
//
// DEV: no se chequea en dev (autoUpdater.isUpdaterActive() devuelve false sin .exe firmado).

const { autoUpdater } = require('electron-updater')
const { app } = require('electron')

let _mainWindow = null
let _state = {
  checking: false,
  available: null,         // { version, releaseDate, releaseNotes } | null
  downloading: false,
  downloadProgress: null,  // { percent, bytesPerSecond, transferred, total } | null
  downloaded: false,
  error: null,
  isPortable: !!process.env.PORTABLE_EXECUTABLE_FILE,
  currentVersion: app.getVersion(),
}

function emit(channel, payload) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    try { _mainWindow.webContents.send(channel, payload) } catch {}
  }
}

function setMainWindow(win) {
  _mainWindow = win
}

function init() {
  // Config: NO auto-descargar — el usuario decide cuándo. Esto evita consumo
  // de datos no esperado en redes lentas (iglesias rurales con WiFi limitado).
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true  // Si descargó, instala al cerrar

  // Logger ligero — electron-updater es verboso, redirigimos a console
  autoUpdater.logger = {
    info:  (...args) => console.log('[updater]', ...args),
    warn:  (...args) => console.warn('[updater]', ...args),
    error: (...args) => console.error('[updater]', ...args),
    debug: () => {},  // silencio el spam de debug
  }

  // --- Eventos ---
  autoUpdater.on('checking-for-update', () => {
    _state.checking = true
    _state.error = null
    emit('updater:checking', {})
  })

  autoUpdater.on('update-available', (info) => {
    _state.checking = false
    _state.available = {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    }
    emit('updater:available', _state.available)
  })

  autoUpdater.on('update-not-available', (info) => {
    _state.checking = false
    _state.available = null
    emit('updater:not-available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    _state.downloading = true
    _state.downloadProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    }
    emit('updater:download-progress', _state.downloadProgress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    _state.downloading = false
    _state.downloaded = true
    emit('updater:downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
    })
  })

  autoUpdater.on('error', (err) => {
    _state.checking = false
    _state.downloading = false
    _state.error = err?.message || String(err)
    console.error('[updater] error:', _state.error)
    emit('updater:error', { error: _state.error })
  })

  // Check inicial 30s después del startup, solo si estamos en build empaquetada
  // y NO es portable. Para portable solo hacemos check on-demand.
  if (app.isPackaged && !_state.isPortable) {
    setTimeout(() => {
      checkForUpdates().catch(e => console.warn('[updater] initial check failed:', e.message))
    }, 30_000)
  }
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    return { ok: false, error: 'dev_mode' }
  }
  // En portable, el chequeo sirve para AVISAR (no puede instalar)
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, updateInfo: result?.updateInfo || null }
  } catch (e) {
    _state.error = e?.message || String(e)
    return { ok: false, error: _state.error }
  }
}

async function downloadUpdate() {
  if (_state.isPortable) {
    return { ok: false, error: 'portable_no_download' }
  }
  if (!_state.available) {
    return { ok: false, error: 'no_update_available' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (e) {
    _state.error = e?.message || String(e)
    return { ok: false, error: _state.error }
  }
}

function quitAndInstall() {
  if (!_state.downloaded) return { ok: false, error: 'not_downloaded' }
  // forceRunAfter=true → Windows reabre la app tras instalar. isSilent=false
  // muestra la GUI de NSIS brevemente para que el user vea que está instalando.
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return { ok: true }
}

function getState() {
  return { ..._state }
}

module.exports = {
  init,
  setMainWindow,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getState,
}
