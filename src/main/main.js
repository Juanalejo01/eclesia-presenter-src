const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const { startServer } = require('../server/server')
const db = require('./database')
const projection = require('./projection')

const isDev = process.env.NODE_ENV !== 'production'

let mainWindow = null
let presenterWindow = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'EclesiaPresenter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function createPresenterWindow() {
  presenterWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'EclesiaPresenter — Proyector',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    presenterWindow.loadURL('http://localhost:5173/#/presenter')
  } else {
    presenterWindow.loadFile(
      path.join(__dirname, '../../dist/renderer/index.html'),
      { hash: '/presenter' }
    )
  }
}

// IPC: abrir/cerrar ventana proyector
ipcMain.handle('presenter:open', () => {
  if (!presenterWindow) createPresenterWindow()
})

ipcMain.handle('presenter:close', () => {
  if (presenterWindow) { presenterWindow.close(); presenterWindow = null }
})

// IPC: enviar slide al proyector (legacy: mantiene la ventana old + nueva proyección)
ipcMain.on('slide:send', (_event, slideData) => {
  if (presenterWindow) presenterWindow.webContents.send('slide:receive', slideData)
  projection.setSlide(slideData)
})

// IPC: proyección externa (overlay/background sin red, capturable por OBS)
ipcMain.handle('projection:open',  (_e, opts)   => projection.openProjection(opts))
ipcMain.handle('projection:close', (_e, mode)   => projection.closeProjection(mode))
ipcMain.handle('projection:theme', (_e, patch)  => { projection.setTheme(patch); return projection.getState().theme })
ipcMain.handle('projection:state', ()           => projection.getState())

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

// IPC: songs CRUD
ipcMain.handle('songs:list',     (_e, opts)    => db.listSongs(opts))
ipcMain.handle('songs:get',      (_e, id)      => db.getSong(id))
ipcMain.handle('songs:create',   (_e, data)    => db.createSong(data))
ipcMain.handle('songs:update',   (_e, id, data)=> db.updateSong(id, data))
ipcMain.handle('songs:delete',   (_e, id)      => db.deleteSong(id))
ipcMain.handle('songs:favorite', (_e, id)      => db.toggleFavorite(id))

app.whenReady().then(() => {
  db.init()

  // Protocolo custom: media://archivo.mp4 → userData/media/archivo.mp4
  // Permite que las ventanas de proyección lean archivos locales sin file:// inseguro
  protocol.registerFileProtocol('media', (request, callback) => {
    const fileName = decodeURI(request.url.replace(/^media:\/\//, ''))
    const fullPath = path.join(getMediaDir(), fileName)
    callback({ path: fullPath })
  })

  startServer()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
