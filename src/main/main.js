const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

// === APP USER MODEL ID (Windows) ===
// MUY IMPORTANTE: setAppUserModelId DEBE llamarse antes de cualquier ventana.
// Sin esto, Windows agrupa la app bajo el AUMID por defecto de Electron y
// usa el icono de Electron en la barra de tareas, ignorando nuestro icon.ico.
// Lo ponemos al inicio del módulo, no en createMainWindow.
if (process.platform === 'win32') {
  try {
    app.setAppUserModelId('com.eclesiapresenter.app')
  } catch (e) {
    console.warn('[main] setAppUserModelId failed:', e?.message)
  }
}

// Quitar la barra de menú nativa (File / Edit / View / Window / Help).
Menu.setApplicationMenu(null)

// === ICON PATH RESOLVER (con logging detallado) ===
// Intenta múltiples ubicaciones en orden hasta encontrar una válida.
// Logueamos a stderr para que aparezca en electron logs del usuario en caso
// de que el icono no aparezca y queramos diagnosticar.
function resolveAppIcon() {
  const candidates = []
  if (app.isPackaged) {
    // Producción (NSIS install o portable): extraResources copia a resources/
    candidates.push(path.join(process.resourcesPath, 'icon.ico'))
    candidates.push(path.join(process.resourcesPath, 'icon.png'))
    // Fallback inesperado: junto al ejecutable
    candidates.push(path.join(path.dirname(app.getPath('exe')), 'icon.ico'))
  } else {
    // Dev
    candidates.push(path.join(__dirname, '../../build/icon.ico'))
    candidates.push(path.join(__dirname, '../../build/icon.png'))
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log('[main] Using app icon:', p)
        return p
      }
    } catch {}
  }
  console.warn('[main] No app icon found. Tried:', candidates)
  return null
}

// Sentry — solo si está configurado y NO en dev (evita ruido durante npm run dev)
// El DSN se inyecta en build vía electron-builder. Si falta, Sentry queda inactivo.
const SENTRY_DSN = process.env.SENTRY_DSN_DESKTOP || ''
if (SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/electron/main')
    Sentry.init({
      dsn: SENTRY_DSN,
      release: `eclesia-presenter@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      enabled: app.isPackaged,
      tracesSampleRate: 0.1,
      // No enviar el path del usuario (PII)
      beforeSend(event) {
        if (event.user) delete event.user.username
        if (event.user) delete event.user.email
        return event
      },
    })
  } catch (e) {
    console.warn('[main] Sentry init failed (paquete no instalado?):', e.message)
  }
}

const { startServer } = require('../server/server')
const db = require('./database')
const projection = require('./projection')
const license = require('./license')
const cloudSync = require('./cloudSync')
// (backgroundLibrary eliminado en v0.2.14 — los vídeos de fondo viven
// ahora en el apartado /recursos de la web, donde el usuario los descarga
// manualmente y los usa como archivos normales vía MediaPicker.)
const autoUpdater = require('./autoUpdater')

// app.isPackaged es true cuando se ejecuta el .exe instalado, false en `npm run dev`.
// Es más fiable que NODE_ENV porque electron-builder no setea esa variable automáticamente.
const isDev = !app.isPackaged

let mainWindow = null

function createMainWindow() {
  const iconPath = resolveAppIcon()
  // Cargar como nativeImage (mejor que pasar path crudo — Electron a veces
  // tiene problemas leyendo .ico desde paths con espacios o caracteres especiales)
  let appIcon = null
  if (iconPath) {
    try {
      appIcon = nativeImage.createFromPath(iconPath)
      if (appIcon.isEmpty()) {
        console.warn('[main] nativeImage empty from', iconPath)
        appIcon = null
      }
    } catch (e) {
      console.warn('[main] Failed to load icon:', e?.message)
    }
  }

  mainWindow = new BrowserWindow({
    // Tamaño inicial razonable para cuando el usuario "restaura" la ventana
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,  // no mostrar hasta que esté maximizada (evita "salto" visible)
    title: 'EclesiaPresenter',
    autoHideMenuBar: true,  // por si Menu.setApplicationMenu(null) no aplica en algún caso
    backgroundColor: '#14100d',  // fondo oscuro coincidente con el tema, evita flash blanco al cargar
    // Barra de título nativa estilo Windows 11 pero coloreada con la paleta
    // del brand (cobre/marrón oscuro). Solo se aplica en Win 11+. En versiones
    // antiguas cae al título nativo normal sin romper.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#14100d',       // fondo de la barra (mismo que bg-1)
      symbolColor: '#c9b29c', // color de los botones min/max/cerrar (ink-2)
      height: 32,
    },
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Sin esto, Chromium ralentiza/pausa los setInterval y requestAnimationFrame
      // cuando la ventana se minimiza o queda en background. Eso congelaba el
      // countdown y el cronómetro. El proyector (projection.js) ya lo tiene en
      // false; lo igualamos aquí para que el monitor lateral siga contando.
      backgroundThrottling: false,
    },
  })

  // Belt-and-suspenders: además del icon: en el constructor, llamamos
  // setIcon() después. Esto FUERZA a Windows a actualizar el icono de la
  // barra de tareas inmediatamente.
  if (appIcon) {
    try { mainWindow.setIcon(appIcon) } catch (e) { console.warn('[main] setIcon failed:', e?.message) }
  }

  mainWindow.setMenuBarVisibility(false)

  // Arrancar maximizada (ocupa el área visible respetando la barra de tareas).
  // No usamos fullscreen (que oculta la barra de tareas) — esto se siente
  // como una app de escritorio normal pero al 100%.
  mainWindow.maximize()
  mainWindow.show()

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  // Confirmación al cerrar + cierre de ventanas de proyección huérfanas.
  // Reemplazamos el dialog.showMessageBoxSync nativo Win11 (look genérico
  // amarillo) por el AppDialog del renderer (acorde al brand cobre). El
  // patrón: preventDefault, enviar IPC al renderer, esperar respuesta vía
  // otro IPC, decidir cerrar o cancelar. Si el renderer aún no está vivo
  // (caso edge — el close se dispara antes del did-finish-load) caemos al
  // dialog nativo como fallback para no dejar al usuario atrapado.
  //
  // Race que defendemos con el timeout: entre did-finish-load y el momento
  // en que React monta el useEffect que registra onRequestQuitConfirm, el
  // listener no existe. Si el user pulsa X en esa ventana, el send() se
  // descarta silenciosamente y e.preventDefault() deja al user atrapado.
  // Mismo problema si el renderer está freezed (loop infinito).
  //
  // CRÍTICO: el timer mide "¿el renderer está vivo?" — NO "¿el usuario ya
  // respondió?". El renderer envía un ACK inmediato al recibir el request
  // (antes de mostrar el dialog) → el main cancela el timer al recibir el
  // ack. Si no hay ack en 2s, el listener está realmente muerto y caemos
  // al dialog nativo. SIN el ack, el timer disparaba el dialog nativo en
  // paralelo al custom si el usuario tardaba en decidir (bug de v0.2.14).
  mainWindow.on('close', (e) => {
    if (_isQuitting) return  // ya confirmado, dejar cerrar
    e.preventDefault()

    // Fallback si webContents está roto antes incluso de intentar el IPC
    if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
      return _confirmQuitNativeAndMaybeClose()
    }

    // Si ya hay un request pendiente, no spamear más eventos. Cubre el
    // doble-click rápido en X.
    if (_pendingQuitTimer) return

    mainWindow.webContents.send('app:request-quit-confirm')

    // Si no recibimos ack del renderer en 2s, asumimos que el listener no
    // está montado o el renderer está freezed → fallback nativo. El ack
    // llega NORMALMENTE en milisegundos (es síncrono en el renderer, no
    // espera al usuario), así que 2s es muy generoso para el caso real.
    _pendingQuitTimer = setTimeout(() => {
      _pendingQuitTimer = null
      _confirmQuitNativeAndMaybeClose()
    }, 2000)
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// Helper centralizado para cerrar la app de verdad. Setea _isQuitting (el
// listener de close lo respeta y deja pasar), cierra todas las ventanas de
// proyección y cierra la mainWindow (lo que vuelve a entrar al listener,
// pero _isQuitting=true → pasa directo).
function _quitNow() {
  _isQuitting = true
  try { projection.closeAll() } catch {}
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
}

// Helper: dialog nativo como fallback de emergencia. NO es el flujo
// principal — solo cuando el renderer no responde (race del listener no
// montado o webContents destruido). Seguimos pidiendo confirmación al
// usuario para no cerrarle la app sin querer.
function _confirmQuitNativeAndMaybeClose() {
  if (!mainWindow || mainWindow.isDestroyed()) return _quitNow()
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['Cancelar', 'Cerrar EclesiaPresenter'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Cerrar EclesiaPresenter',
    message: '¿Seguro que quieres cerrar la aplicación?',
    detail: 'Se cerrarán también las ventanas de proyección y overlay que estén abiertas.',
  })
  if (choice === 1) _quitNow()
}

// El renderer envía este ack INMEDIATAMENTE al recibir el request — antes
// de mostrar el modal. Eso confirma que el listener está vivo y cancelamos
// el timer del fallback nativo. Sin esto, si el usuario tarda >2s en
// decidir, salía el nativo en paralelo (mala UX).
function _cancelPendingQuitTimer() {
  if (_pendingQuitTimer) {
    clearTimeout(_pendingQuitTimer)
    _pendingQuitTimer = null
  }
}

// ACK del renderer: se dispara INMEDIATAMENTE al recibir el request, antes
// de mostrar el modal. Cancela el timer del fallback nativo. Si el ack no
// llega → el listener no existe → fallback nativo a los 2s. Si SÍ llega →
// el usuario puede tardar lo que quiera respondiendo.
ipcMain.on('app:ack-quit-confirm', () => {
  _cancelPendingQuitTimer()
})

// El renderer responde al request-quit-confirm con true/false. Registrado
// UNA sola vez (fuera de createMainWindow) para no acumular handlers.
ipcMain.handle('app:respond-quit-confirm', (_e, ok) => {
  _cancelPendingQuitTimer()  // por si el ack no llegó (defensa en profundidad)
  if (ok === true) _quitNow()
  // si ok=false, no hacemos nada — la ventana se queda abierta
})

// Flag para distinguir el cierre confirmado del primer intento (que muestra
// el diálogo). También lo activan before-quit / window-all-closed.
let _isQuitting = false

// Timer del fallback "renderer no responde". Si es no-null hay un request
// en vuelo y los siguientes intentos de close se ignoran (anti-spam X).
let _pendingQuitTimer = null

// Server local: se inicializa en app.whenReady. Lo guardamos en closure para
// poder llamar a pushSlide / onRemoteEvent desde los handlers IPC.
let serverHandle = null

// IPC: enviar slide al proyector. Antes había un sistema legacy con
// `presenterWindow` (otra BrowserWindow) que se cargó toda la app de nuevo.
// Eliminado: ahora todo va al sistema moderno `projection` que abre
// ventanas dedicadas (background fullscreen + overlay transparente para OBS).
ipcMain.on('slide:send', (_event, slideData) => {
  try { projection.setSlide(slideData) } catch (e) { console.warn('projection.setSlide failed:', e.message) }
  // Push también al servidor para que los móviles conectados vean el slide
  try { serverHandle?.pushSlide(slideData) } catch (e) { console.warn('server.pushSlide failed:', e.message) }
})

// Info del servidor local para mostrar QR/URL en la app
ipcMain.handle('server:info', () => {
  if (!serverHandle) return null
  return {
    ip: serverHandle.getLocalIP(),
    port: serverHandle.port,
    remoteUrl: `http://${serverHandle.getLocalIP()}:${serverHandle.port}/remote`,
    overlayUrl: `http://${serverHandle.getLocalIP()}:${serverHandle.port}/overlay`,
    pairingPin: serverHandle.getPairingPin?.() || null,
  }
})

// IPC: licencia (activación / validación / desactivación / estado)
ipcMain.handle('license:state',       ()      => license.getState())
ipcMain.handle('license:activate',    (_e, k) => license.activate(k))
ipcMain.handle('license:deactivate',  ()      => license.deactivate())
ipcMain.handle('license:validate',    ()      => license.validate())

// IPC: cloud sync de canciones (Pro feature)
ipcMain.handle('cloud-sync:state',     ()        => cloudSync.getState())
ipcMain.handle('cloud-sync:setEnabled',(_e, on)  => cloudSync.setEnabled(on))
ipcMain.handle('cloud-sync:syncNow',   ()        => cloudSync.syncOnce())

// IPC: biblioteca de fondos preset (catálogo + descargas)

// IPC: proyección externa (overlay/background sin red, capturable por OBS)
ipcMain.handle('projection:open',  (_e, opts)   => projection.openProjection(opts))
ipcMain.handle('projection:close', (_e, mode)   => projection.closeProjection(mode))
// T11: cerrar TODAS las ventanas de proyeccion de golpe (panico desde mobile).
// El handler NO acepta argumentos del renderer: si en el futuro alguien lo
// expone via IPC con args, projection.closeAll los ignora — solo itera las
// BrowserWindows internas que ya tiene registradas.
ipcMain.handle('projection:closeAll', () => projection.closeAll())
ipcMain.handle('projection:theme', (_e, patch)  => { projection.setTheme(patch); return projection.getState().theme })
ipcMain.handle('projection:resetTheme', ()      => projection.resetTheme())
ipcMain.handle('projection:state', ()           => projection.getState())
ipcMain.handle('projection:toggleOverlayVisible', (_e, visible) => projection.toggleOverlayVisible(visible))
// Stage Display v2: notas del predicador + countdown integrado
ipcMain.handle('projection:setNotes',     (_e, text)  => projection.setNotes(text))
ipcMain.handle('projection:setCountdown', (_e, state) => projection.setCountdown(state))

// --------- Media library ---------

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv', 'avi']

function getMediaDir() {
  const dir = path.join(app.getPath('userData'), 'media')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function detectType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (IMAGE_EXTS.includes(ext)) return { type: 'image', mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` }
  if (VIDEO_EXTS.includes(ext)) return { type: 'video', mime: `video/${ext}` }
  return null
}

ipcMain.handle('media:pick', async (_e, kind = 'all') => {
  const filters = []
  if (kind === 'image' || kind === 'all') filters.push({ name: 'Imágenes', extensions: IMAGE_EXTS })
  if (kind === 'video' || kind === 'all') filters.push({ name: 'Videos',   extensions: VIDEO_EXTS })

  const result = await dialog.showOpenDialog({
    title: 'Seleccionar medio',
    properties: ['openFile', 'multiSelections'],
    filters,
  })
  if (result.canceled || result.filePaths.length === 0) return []

  const added = []
  for (const sourcePath of result.filePaths) {
    const detected = detectType(sourcePath)
    if (!detected) continue
    const name = path.basename(sourcePath)
    const safe = `${Date.now()}-${name.replace(/[^\w.\-]/g, '_')}`
    const dest = path.join(getMediaDir(), safe)
    try {
      fs.copyFileSync(sourcePath, dest)
      const stats = fs.statSync(dest)
      const item = db.addMedia({ name, type: detected.type, path: dest, mime: detected.mime, size: stats.size })
      added.push(item)
    } catch (err) {
      console.error('media:pick copy failed', err)
    }
  }
  return added
})

ipcMain.handle('media:list',   (_e, opts) => db.listMedia(opts))
ipcMain.handle('media:delete', (_e, id)   => db.deleteMedia(id))

// Directorios que nunca deben ser fuente de archivos de media.
// Un XSS en el renderer podria llamar addFiles(['C:/Windows/System32/...'])
// y copiar archivos sensibles a userData/media (exfiltracion local).
// Usamos una whitelist de directorios permitidos: solo carpetas del usuario.
function isMediaSourceAllowed(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') return false
  const resolved = path.resolve(sourcePath)

  // En Windows, bloquear rutas del sistema
  if (process.platform === 'win32') {
    const systemRoots = [
      process.env.SYSTEMROOT || 'C:\\Windows',
      process.env.PROGRAMDATA || 'C:\\ProgramData',
      process.env.WINDIR || 'C:\\Windows',
      path.join(process.env.APPDATA || '', 'Microsoft'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft'),
    ].filter(Boolean).map(p => path.resolve(p).toLowerCase())
    const lower = resolved.toLowerCase()
    if (systemRoots.some(root => lower.startsWith(root))) {
      console.warn('[security] media:addFiles fuente bloqueada:', resolved)
      return false
    }
  }

  // En macOS/Linux, bloquear rutas del sistema
  if (process.platform !== 'win32') {
    const blocked = ['/System', '/Library/Keychains', '/etc', '/var', '/usr/bin', '/usr/sbin']
    const home = app.getPath('home')
    const blockedHome = [path.join(home, '.ssh'), path.join(home, '.gnupg')]
    const allBlocked = [...blocked, ...blockedHome]
    if (allBlocked.some(b => resolved.startsWith(b))) {
      console.warn('[security] media:addFiles fuente bloqueada:', resolved)
      return false
    }
  }

  return true
}

// Drag & drop: recibe paths absolutos de archivos arrastrados al renderer
// y los copia a userData/media igual que media:pick.
ipcMain.handle('media:addFiles', async (_e, sourcePaths = []) => {
  const added = []
  for (const sourcePath of sourcePaths) {
    if (!sourcePath || !fs.existsSync(sourcePath)) continue
    if (!isMediaSourceAllowed(sourcePath)) continue  // bloquear rutas del sistema
    const detected = detectType(sourcePath)
    if (!detected) continue
    const name = path.basename(sourcePath)
    const safe = `${Date.now()}-${name.replace(/[^\w.\-]/g, '_')}`
    const dest = path.join(getMediaDir(), safe)
    try {
      fs.copyFileSync(sourcePath, dest)
      const stats = fs.statSync(dest)
      const item = db.addMedia({ name, type: detected.type, path: dest, mime: detected.mime, size: stats.size })
      added.push(item)
    } catch (err) {
      console.error('media:addFiles copy failed', err)
    }
  }
  return added
})

// IPC: songs CRUD — las mutaciones disparan 2 cosas:
//   1. syncSongsToServer() → push inmediato a clientes móviles LAN
//   2. cloudSync.triggerSync() → push a Supabase debounced 2s
//      (no-op silencioso si no hay licencia Pro o auto-sync está apagado)
ipcMain.handle('songs:list',     (_e, opts)    => db.listSongs(opts))
ipcMain.handle('songs:get',      (_e, id)      => db.getSong(id))
ipcMain.handle('songs:create',   (_e, data)    => {
  const r = db.createSong(data)
  syncSongsToServer({ changeType: 'created', songIds: r?.id ? [r.id] : [] })
  cloudSync.triggerSync(); return r
})
ipcMain.handle('songs:update',   (_e, id, data)=> {
  const r = db.updateSong(id, data)
  syncSongsToServer({ changeType: 'updated', songIds: Number(id) ? [Number(id)] : [] })
  cloudSync.triggerSync(); return r
})
ipcMain.handle('songs:delete',   (_e, id)      => {
  const r = db.deleteSong(id)
  syncSongsToServer({ changeType: 'deleted', songIds: Number(id) ? [Number(id)] : [] })
  cloudSync.triggerSync(); return r
})
ipcMain.handle('songs:favorite', (_e, id)      => {
  const r = db.toggleFavorite(id)
  syncSongsToServer({ changeType: 'updated', songIds: Number(id) ? [Number(id)] : [] })
  cloudSync.triggerSync(); return r
})

// --------- App utilities (settings) ---------

// Selector de carpeta nativo
ipcMain.handle('app:pickDirectory', async (_e, title) => {
  const result = await dialog.showOpenDialog({
    title: title || 'Seleccionar carpeta',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// Versión + paths de la app
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  videos: app.getPath('videos'),
  pictures: app.getPath('pictures'),
}))

// --------- Songs export/import (backup) ---------

ipcMain.handle('songs:export', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Exportar canciones',
    defaultPath: `eclesia-canciones-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  const songs = db.listSongs({})
  const payload = {
    type: 'eclesiapresenter.songs',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: songs.length,
    songs,
  }
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
  return { ok: true, path: result.filePath, count: songs.length }
})

ipcMain.handle('songs:import', async (_e, opts = {}) => {
  const result = await dialog.showOpenDialog({
    title: 'Importar canciones',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }

  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf8')
    const payload = JSON.parse(raw)
    const list = Array.isArray(payload) ? payload : payload.songs || []
    let created = 0
    for (const s of list) {
      try {
        db.createSong({
          title: s.title, author: s.author, tags: s.tags,
          sections: s.sections, maxLines: s.maxLines,
        })
        created++
      } catch (e) { console.warn('skip song:', e.message) }
    }
    return { ok: true, count: created, total: list.length }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// --------- Songs import desde Holyrics (migración) ---------
// Acepta uno o varios archivos exportados de Holyrics (JSON de su API o texto
// plano con bloques separados por línea en blanco) y crea las canciones en local.
const { parseHolyrics } = require('./holyricsImport')

ipcMain.handle('songs:importHolyrics', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importar canciones de Holyrics',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Holyrics (JSON o texto)', extensions: ['json', 'txt'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }

  let created = 0, total = 0, files = 0
  for (const fp of result.filePaths) {
    try {
      const content = fs.readFileSync(fp, 'utf8')
      const songs = parseHolyrics(content, path.basename(fp))
      total += songs.length
      for (const s of songs) {
        try { db.createSong(s); created++ }
        catch (e) { console.warn('skip holyrics song:', e.message) }
      }
      files++
    } catch (e) {
      console.warn('holyrics file failed:', fp, e.message)
    }
  }
  if (created > 0) {
    try { syncSongsToServer() } catch {}
    try { cloudSync.triggerSync() } catch {}
  }
  if (total === 0) {
    return { ok: false, error: 'No se reconocieron canciones en el archivo. ¿Es un export de Holyrics (JSON o texto)?' }
  }
  return { ok: true, count: created, total, files }
})

// --------- Bibles import (XMM, JSON) ---------

const BIBLES_DIR = path.join(app.getPath('userData'), 'bibles')

function ensureBiblesDir() {
  if (!fs.existsSync(BIBLES_DIR)) fs.mkdirSync(BIBLES_DIR, { recursive: true })
}

const ABBREV = {
  'Génesis': 'gn', 'Éxodo': 'ex', 'Levítico': 'lv', 'Números': 'nm',
  'Deuteronomio': 'dt', 'Josué': 'js', 'Jueces': 'jud', 'Rut': 'rt',
  '1 Samuel': '1sm', '2 Samuel': '2sm', '1 Reyes': '1kgs', '2 Reyes': '2kgs',
  '1 Crónicas': '1ch', '2 Crónicas': '2ch', 'Esdras': 'ezr', 'Nehemías': 'ne',
  'Ester': 'et', 'Job': 'job', 'Salmos': 'ps', 'Proverbios': 'prv',
  'Eclesiastés': 'ec', 'Cantares': 'so', 'Cantar de los Cantares': 'so',
  'Isaías': 'is', 'Jeremías': 'jr', 'Lamentaciones': 'lm', 'Ezequiel': 'ez',
  'Daniel': 'dn', 'Oseas': 'ho', 'Joel': 'jl', 'Amós': 'am',
  'Abdías': 'ob', 'Jonás': 'jn', 'Miqueas': 'mi', 'Nahúm': 'na',
  'Habacuc': 'hk', 'Sofonías': 'zp', 'Hageo': 'hg', 'Zacarías': 'zc',
  'Malaquías': 'ml',
  'Mateo': 'mt', 'Marcos': 'mk', 'Lucas': 'lk', 'Juan': 'jo',
  'Hechos': 'act', 'Romanos': 'rm',
  '1 Corintios': '1co', '2 Corintios': '2co', 'Gálatas': 'gl',
  'Efesios': 'eph', 'Filipenses': 'ph', 'Colosenses': 'cl',
  '1 Tesalonicenses': '1ts', '2 Tesalonicenses': '2ts',
  '1 Timoteo': '1tm', '2 Timoteo': '2tm',
  'Tito': 'tt', 'Filemón': 'phm', 'Hebreos': 'hb', 'Santiago': 'jm',
  '1 Pedro': '1pe', '2 Pedro': '2pe',
  '1 Juan': '1jo', '2 Juan': '2jo', '3 Juan': '3jo',
  'Judas': 'jd', 'Apocalipsis': 'rv',
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

function cleanVerse(text) {
  return decodeEntities(text)
    .replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')
    .replace(/\[\d+\]/g, '').trim()
}

// Parser para .xmm y .xml estilo OpenSong/MyBible que usen el mismo schema
function parseBibleXML(xml) {
  xml = xml.replace(/^﻿/, '').replace(/<\?xml[^?]*\?>/, '')
  const books = []
  const bookRe = /<b\s+n="([^"]+)"\s*>([\s\S]*?)<\/b>/g
  let bMatch
  while ((bMatch = bookRe.exec(xml)) !== null) {
    const bookName = bMatch[1]
    const bookBody = bMatch[2]
    const chapters = []
    const chapRe = /<c\s+n="(\d+)"\s*>([\s\S]*?)<\/c>/g
    let cMatch
    while ((cMatch = chapRe.exec(bookBody)) !== null) {
      const chapNum = +cMatch[1]
      const chapBody = cMatch[2]
      const verses = []
      const verseRe = /<v\s+n="(\d+)"\s*>([\s\S]*?)<\/v>/g
      let vMatch
      while ((vMatch = verseRe.exec(chapBody)) !== null) {
        verses[+vMatch[1] - 1] = cleanVerse(vMatch[2])
      }
      chapters[chapNum - 1] = verses
    }
    books.push({
      abbrev: ABBREV[bookName] || bookName.toLowerCase().replace(/\s+/g, ''),
      name: bookName,
      chapters,
    })
  }
  return books
}

ipcMain.handle('bibles:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importar Biblia',
    properties: ['openFile'],
    filters: [
      { name: 'Biblia', extensions: ['xmm', 'xml', 'json', 'bib'] },
      { name: 'Todos', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }

  ensureBiblesDir()
  const sourcePath = result.filePaths[0]
  const ext = path.extname(sourcePath).slice(1).toLowerCase()
  const filename = path.basename(sourcePath, path.extname(sourcePath))
  const id = 'custom-' + filename.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  try {
    let books
    const raw = fs.readFileSync(sourcePath, 'utf8')

    if (ext === 'json') {
      const data = JSON.parse(raw.replace(/^﻿/, ''))
      books = Array.isArray(data) ? data : data.books || data.songs
    } else if (ext === 'xmm' || ext === 'xml' || ext === 'bib') {
      books = parseBibleXML(raw)
    } else {
      return { ok: false, error: 'Formato no soportado: ' + ext }
    }

    if (!books || !books.length) return { ok: false, error: 'No se encontraron libros' }

    const outPath = path.join(BIBLES_DIR, `${id}.json`)
    fs.writeFileSync(outPath, JSON.stringify(books))

    const meta = {
      id, short: filename.slice(0, 8).toUpperCase(),
      name: filename, license: 'Importada por el usuario',
      type: 'imported', file: outPath,
      books: books.length,
      addedAt: new Date().toISOString(),
    }

    // Persistir registry
    const registryPath = path.join(BIBLES_DIR, 'registry.json')
    let registry = []
    if (fs.existsSync(registryPath)) {
      try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) } catch {}
    }
    registry = registry.filter(r => r.id !== id)
    registry.push(meta)
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2))

    return { ok: true, meta }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('bibles:listImported', () => {
  ensureBiblesDir()
  const registryPath = path.join(BIBLES_DIR, 'registry.json')
  if (!fs.existsSync(registryPath)) return []
  try { return JSON.parse(fs.readFileSync(registryPath, 'utf8')) } catch { return [] }
})

// Validador: id de biblia importada debe ser seguro (no permite ../, no
// permite caracteres exóticos). Sin esto, un atacante puede leer/borrar
// cualquier archivo del FS pasando id='../../../passwords'.
function isValidBibleId(id) {
  if (typeof id !== 'string' || !id) return false
  if (id.length > 64) return false
  return /^[a-zA-Z0-9._-]+$/.test(id)
}

ipcMain.handle('bibles:readImported', (_e, id) => {
  if (!isValidBibleId(id)) {
    console.warn('[security] bibles:readImported id inválido:', id)
    return null
  }
  const filePath = path.join(BIBLES_DIR, `${id}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
})

ipcMain.handle('bibles:deleteImported', (_e, id) => {
  if (!isValidBibleId(id)) {
    console.warn('[security] bibles:deleteImported id inválido:', id)
    return { ok: false, error: 'invalid_id' }
  }
  ensureBiblesDir()
  const filePath = path.join(BIBLES_DIR, `${id}.json`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  const registryPath = path.join(BIBLES_DIR, 'registry.json')
  if (fs.existsSync(registryPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
      fs.writeFileSync(registryPath, JSON.stringify(reg.filter(r => r.id !== id), null, 2))
    } catch {}
  }
  return { ok: true }
})

app.whenReady().then(() => {
  db.init()
  license.init()
  cloudSync.init({ db, license })

  // Helper: previene path traversal asegurando que el path resuelto
  // está DENTRO del directorio base esperado. Sin esto, un atacante
  // (XSS en renderer, video remoto manipulado) podría hacer
  // media://../../../Windows/win.ini para leer archivos arbitrarios.
  function safeResolveWithin(baseDir, untrustedName) {
    try {
      const normalized = path.normalize(untrustedName).replace(/^(\.\.[\/\\])+/, '')
      const resolved = path.resolve(baseDir, normalized)
      const baseResolved = path.resolve(baseDir) + path.sep
      if (!resolved.startsWith(baseResolved) && resolved !== path.resolve(baseDir)) {
        console.warn('[security] path traversal bloqueado:', untrustedName)
        return null
      }
      return resolved
    } catch (e) {
      console.warn('[security] resolve falló:', e?.message)
      return null
    }
  }

  // Protocolo custom: media://archivo.mp4 → userData/media/archivo.mp4
  // VALIDACIÓN: el path resultante debe estar dentro de getMediaDir().
  protocol.registerFileProtocol('media', (request, callback) => {
    const fileName = decodeURI(request.url.replace(/^media:\/\//, ''))
    const safePath = safeResolveWithin(getMediaDir(), fileName)
    if (!safePath) return callback({ error: -10 /* ACCESS_DENIED */ })
    callback({ path: safePath })
  })

  // Protocolo preset://<id>.mp4 — compatibilidad con temas guardados antes
  // de v0.2.14. La biblioteca interna de descargas se eliminó (los vídeos
  // viven ahora en /recursos en la web), pero los archivos que el usuario
  // ya bajó en versiones anteriores siguen en disco y este resolver les
  // permite seguir funcionando. Si no existe, el <video> simplemente fallará
  // y el usuario verá un fondo negro — entonces puede elegir otro fondo.
  // VALIDACIÓN: el id solo puede contener caracteres seguros.
  protocol.registerFileProtocol('preset', (request, callback) => {
    const fileName = decodeURI(request.url.replace(/^preset:\/\//, ''))
    const id = fileName.replace(/\.mp4$/, '')
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      console.warn('[security] preset id inválido:', id)
      return callback({ error: -10 })
    }
    // Sólo carpeta histórica (preset-backgrounds en userData) — no buscamos
    // en la carpeta custom de videos porque ya no la sincronizamos aquí.
    const fullPath = path.join(app.getPath('userData'), 'preset-backgrounds', `${id}.mp4`)
    callback({ path: fullPath })
  })

  // Inicializa el módulo de pairing con persistencia en disco. Si no lo
  // hacemos, los tokens viven solo en memoria y los móviles emparejados
  // pierden la sesión cada vez que se reinicia la app del PC.
  try {
    const pairing = require('../server/pairing')
    pairing.init({
      storagePath: path.join(app.getPath('userData'), 'pairing_tokens.json'),
    })
  } catch (e) {
    console.warn('[pairing] init failed:', e?.message)
  }

  serverHandle = startServer()
  // Bridge: cuando el móvil dispara un comando, lo reenviamos a la mainWindow
  // como evento IPC. App.jsx lo escucha y dispara la acción correspondiente.
  serverHandle.onRemoteEvent((name, payload) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('remote:event', name, payload || null)
      }
    } catch (e) { console.warn('remote bridge failed:', e.message) }
  })

  // Push inicial de la lista de canciones al server (para que la app móvil
  // pueda mostrar la lista al conectarse).
  try { serverHandle.pushSongs(db.listSongs({})) }
  catch (e) { console.warn('pushSongs initial failed:', e.message) }

  createMainWindow()
  // Una vez la ventana existe, dar a los servicios una referencia para emitir eventos
  cloudSync.setMainWindow(mainWindow)
  autoUpdater.setMainWindow(mainWindow)
  projection.setMainWindow(mainWindow)
  autoUpdater.init()  // arranca check inicial 30s después
})

// --------- Auto-updater IPC ---------
ipcMain.handle('updater:state',    ()  => autoUpdater.getState())
ipcMain.handle('updater:check',    ()  => autoUpdater.checkForUpdates())
ipcMain.handle('updater:download', ()  => autoUpdater.downloadUpdate())
ipcMain.handle('updater:install',  ()  => autoUpdater.quitAndInstall())

// Refrescar la lista de canciones del server cada vez que se cree/edite/borre.
// Es barato: la query es ~ms y los push solo afectan a clientes móviles conectados.
//
// T10: ademas del pushSongs (warmup inicial /remote HTML + WS), emitimos
// 'songs-changed' con delta para que los mobiles invaliden cache granular
// y refetcheen solo lo necesario.
function syncSongsToServer({ changeType = 'bulk', songIds = [] } = {}) {
  if (!serverHandle) return
  try { serverHandle.pushSongs(db.listSongs({})) } catch {}
  try { serverHandle.pushSongsChanged?.({ changeType, songIds }) } catch {}
}

// Wrap los IPC handlers existentes para que llamen syncSongsToServer despues.
// (Nota: los handlers ya están registrados arriba; los re-wrapeamos abajo después
// de definir syncSongsToServer.)

// Antes de salir por CUALQUIER vía (Cmd+Q, app.quit, cierre de ventana ya
// confirmado), marcar quitting y cerrar todas las proyecciones para no dejar
// ventanas huérfanas.
app.on('before-quit', () => {
  _isQuitting = true
  try { projection.closeAll() } catch {}
})

app.on('window-all-closed', () => {
  try { projection.closeAll() } catch {}
  if (process.platform !== 'darwin') app.quit()
})

// macOS: si el user cierra todas las ventanas pero deja el icono en el Dock,
// click en el icono debe reabrir la ventana principal (convención macOS).
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
