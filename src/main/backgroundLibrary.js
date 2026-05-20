// Biblioteca de fondos preset CC0 — gestión del catálogo + descargas locales.
//
// FLUJO:
//  1. La app fetcha el catálogo de https://eclesia-presenter.vercel.app/backgrounds-catalog.json
//     (puede actualizarse sin recompilar la app)
//  2. Cada item tiene url, thumbnail, metadata (categoria, duración, peso)
//  3. Usuario descarga uno → archivo a userData/preset-backgrounds/<id>.mp4
//  4. Estado de descarga emitido al renderer en tiempo real (progress, ok, error)
//  5. Para usar como fondo → el renderer recibe el path local y llama a setTheme
//
// El catálogo se cachea en memoria + en disco (catalog.json) por si la app
// arranca offline.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')

const API_BASE = process.env.ECLESIA_API_BASE || 'https://eclesia-presenter.vercel.app'
const CATALOG_URL = `${API_BASE}/backgrounds-catalog.json`

const DIR = () => {
  const d = path.join(app.getPath('userData'), 'preset-backgrounds')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}
const CATALOG_CACHE = () => path.join(DIR(), 'catalog.json')

let _mainWindow = null
let _catalog = null
const _downloading = new Map()  // id → { aborted, bytes, total }

function emit(channel, payload) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    try { _mainWindow.webContents.send(channel, payload) } catch {}
  }
}

function setMainWindow(win) { _mainWindow = win }

// ============================================================
// Catálogo (manifest)
// ============================================================
async function fetchCatalog({ force = false } = {}) {
  if (_catalog && !force) return _catalog
  try {
    const res = await fetch(CATALOG_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    _catalog = data
    // Cachear en disco para uso offline
    try { fs.writeFileSync(CATALOG_CACHE(), JSON.stringify(data), 'utf8') } catch {}
    return data
  } catch (e) {
    console.warn('[bgLibrary] fetch catalog failed, trying cache:', e.message)
    // Fallback: leer del disco
    try {
      const cached = JSON.parse(fs.readFileSync(CATALOG_CACHE(), 'utf8'))
      _catalog = cached
      return cached
    } catch {
      return { version: 1, items: [], categories: [], offline: true }
    }
  }
}

// ============================================================
// Estado local (qué hay descargado)
// ============================================================
function localPath(id) {
  return path.join(DIR(), `${id}.mp4`)
}

function isDownloaded(id) {
  try {
    const stat = fs.statSync(localPath(id))
    return stat.size > 0
  } catch { return false }
}

function getLocalSize(id) {
  try { return fs.statSync(localPath(id)).size } catch { return 0 }
}

function listLocal() {
  const out = []
  try {
    for (const f of fs.readdirSync(DIR())) {
      if (f.endsWith('.mp4')) {
        const id = f.replace(/\.mp4$/, '')
        const stat = fs.statSync(path.join(DIR(), f))
        out.push({ id, size: stat.size, modified: stat.mtimeMs })
      }
    }
  } catch {}
  return out
}

// ============================================================
// Descargas con progreso (HTTPS stream)
// ============================================================
function downloadFile(url, dest, onProgress, abortSignal) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const file = fs.createWriteStream(dest)
    const req = client.get(url, { headers: { 'User-Agent': 'EclesiaPresenter/0.2' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Redirect
        file.close()
        fs.unlinkSync(dest)
        return downloadFile(res.headers.location, dest, onProgress, abortSignal).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let bytes = 0

      res.on('data', (chunk) => {
        if (abortSignal?.aborted) {
          req.destroy()
          file.close()
          try { fs.unlinkSync(dest) } catch {}
          reject(new Error('aborted'))
          return
        }
        bytes += chunk.length
        onProgress?.({ bytes, total })
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve({ bytes, total })
      })
      file.on('error', (e) => {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        reject(e)
      })
    })
    req.on('error', (e) => {
      file.close()
      try { fs.unlinkSync(dest) } catch {}
      reject(e)
    })
  })
}

async function downloadItem(id) {
  if (_downloading.has(id)) return { ok: false, error: 'ya_descargando' }
  const catalog = await fetchCatalog()
  const item = catalog.items?.find(i => i.id === id)
  if (!item) return { ok: false, error: 'item_no_existe' }

  const dest = localPath(id)
  const abortSignal = { aborted: false }
  _downloading.set(id, { aborted: abortSignal, bytes: 0, total: 0 })

  emit('bglib:download-start', { id })
  try {
    const result = await downloadFile(item.url, dest, ({ bytes, total }) => {
      const entry = _downloading.get(id)
      if (entry) { entry.bytes = bytes; entry.total = total }
      emit('bglib:download-progress', { id, bytes, total })
    }, abortSignal)
    _downloading.delete(id)
    emit('bglib:download-ok', { id, bytes: result.bytes })
    return { ok: true, path: dest }
  } catch (e) {
    _downloading.delete(id)
    emit('bglib:download-error', { id, error: e.message })
    return { ok: false, error: e.message }
  }
}

function cancelDownload(id) {
  const entry = _downloading.get(id)
  if (!entry) return false
  entry.aborted.aborted = true
  return true
}

function deleteLocal(id) {
  try {
    const p = localPath(id)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      return true
    }
  } catch {}
  return false
}

// ============================================================
// Estado consolidado para la UI
// ============================================================
async function getState() {
  const catalog = await fetchCatalog()
  const local = listLocal()
  const localMap = new Map(local.map(l => [l.id, l]))
  const items = (catalog.items || []).map(item => ({
    ...item,
    downloaded: localMap.has(item.id),
    local_size: localMap.get(item.id)?.size || 0,
    downloading: _downloading.has(item.id),
    download_progress: _downloading.get(item.id) || null,
  }))
  return {
    version: catalog.version,
    categories: catalog.categories || [],
    items,
    offline: catalog.offline || false,
    dir: DIR(),
  }
}

module.exports = {
  setMainWindow,
  fetchCatalog,
  getState,
  downloadItem,
  cancelDownload,
  deleteLocal,
  localPath,
  isDownloaded,
}
