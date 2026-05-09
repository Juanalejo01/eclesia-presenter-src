// Gestor de ventanas de proyección.
// Crea BrowserWindows nativas que OBS puede capturar directamente
// (sin servidor HTTP, sin red, latencia cero vía IPC del SO).

const { app, BrowserWindow, screen } = require('electron')
const path = require('path')

const isDev = !app.isPackaged
const projections = new Map()  // mode → { window, options }
let currentSlide = null
let currentTheme = defaultTheme()

// IMPORTANTE: este default debe coincidir con DEFAULT_THEME en
// src/renderer/services/themeStore.js para evitar desincronía visual.
function defaultTheme() {
  return {
    bgType: 'gradient',
    bgColor: '#0a1620',
    bgGradient: ['#0a1620', '#1e3a5f'],
    bgImage: null,
    bgVideo: null,
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 64,
    fontColor: '#ffffff',
    fontWeight: 500,
    textShadow: true,
    textAlign: 'center',
    referenceVisible: true,
    transitionType: 'fade',
    transitionDuration: 500,
    transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  }
}

function getDisplays() {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: d.label || `Pantalla ${d.id}`,
    bounds: d.bounds,
    primary: d.id === screen.getPrimaryDisplay().id,
  }))
}

function buildWindowURL(mode) {
  const base = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../../dist/renderer/index.html')}`
  return `${base}/#/projection?mode=${mode}`
}

/**
 * Abre una ventana de proyección.
 * @param {Object} opts
 * @param {'background'|'overlay'} opts.mode  - background = pantalla completa con fondo / overlay = transparente
 * @param {number} [opts.displayId]            - id de la pantalla, default secundaria
 * @param {boolean} [opts.fullscreen]          - default true para background, false para overlay
 */
function openProjection(opts = {}) {
  const mode = opts.mode || 'background'
  if (projections.has(mode)) {
    const existing = projections.get(mode).window
    if (!existing.isDestroyed()) existing.focus()
    return existing.id
  }

  const displays = screen.getAllDisplays()
  const primary  = screen.getPrimaryDisplay()
  const target   = displays.find(d => d.id === opts.displayId)
                || displays.find(d => d.id !== primary.id)
                || primary

  const isOverlay = mode === 'overlay'

  const win = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: isOverlay ? Math.round(target.bounds.height / 3) : target.bounds.height,
    fullscreen: !isOverlay && (opts.fullscreen ?? true),
    frame: false,
    transparent: isOverlay,
    backgroundColor: isOverlay ? '#00000000' : '#000000',
    hasShadow: false,
    skipTaskbar: isOverlay,
    alwaysOnTop: isOverlay,
    resizable: !isOverlay,
    focusable: !isOverlay,           // overlay no roba focus al recibir slides
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  if (isOverlay) {
    win.setIgnoreMouseEvents(true, { forward: true })  // click pasa a través
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true, 'screen-saver')
    }
  }

  win.loadURL(buildWindowURL(mode))

  win.webContents.on('did-finish-load', () => {
    // Estado inicial al abrir
    win.webContents.send('projection:init', { mode, slide: currentSlide, theme: currentTheme })
  })

  win.on('closed', () => projections.delete(mode))

  projections.set(mode, { window: win, options: opts })
  return win.id
}

function closeProjection(mode) {
  const entry = projections.get(mode)
  if (!entry) return false
  if (!entry.window.isDestroyed()) entry.window.close()
  return true
}

function closeAll() {
  for (const mode of [...projections.keys()]) closeProjection(mode)
}

function broadcast(channel, payload) {
  for (const { window } of projections.values()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function setSlide(slide) {
  currentSlide = slide
  broadcast('projection:slide', slide)
}

function setTheme(patch) {
  currentTheme = { ...currentTheme, ...patch }
  broadcast('projection:theme', currentTheme)
}

function getState() {
  return {
    slide: currentSlide,
    theme: currentTheme,
    open: [...projections.keys()],
    displays: getDisplays(),
  }
}

module.exports = {
  openProjection, closeProjection, closeAll,
  setSlide, setTheme, getState,
}
