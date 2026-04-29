// Servicio dual de biblioteca de medios.
// Electron: archivos copiados a userData/media/ + tabla SQLite + protocolo media://
// Navegador: archivos en IndexedDB (los videos son grandes para localStorage)
//
// Ambos exponen la misma API: pick(), list(), remove(), getURL(item).

const hasElectron = typeof window !== 'undefined' && !!window.electron?.media

// --------- IndexedDB fallback ---------

const DB_NAME = 'eclesia-media'
const STORE = 'media'

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('addedAt', 'addedAt')
        store.createIndex('type', 'type')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function idbGetAll() {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.addedAt - a.addedAt))
    req.onerror   = () => reject(req.error)
  })
}

async function idbAdd(item) {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add(item)
    req.onsuccess = () => resolve({ ...item, id: req.result })
    req.onerror   = () => reject(req.error)
  })
}

async function idbDelete(id) {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve(true)
    tx.onerror    = () => reject(tx.error)
  })
}

// --------- API pública ---------

/**
 * Abre el file picker. En Electron usa diálogo nativo.
 * En navegador usa <input type="file"> y guarda los blobs en IndexedDB.
 */
export async function pickMedia(kind = 'all') {
  if (hasElectron) return window.electron.media.pick(kind)

  return new Promise(resolve => {
    const accept = []
    if (kind === 'image' || kind === 'all') accept.push('image/*')
    if (kind === 'video' || kind === 'all') accept.push('video/*')

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept.join(',')
    input.multiple = true

    input.onchange = async () => {
      const files = Array.from(input.files || [])
      const added = []
      for (const file of files) {
        const type = file.type.startsWith('video/') ? 'video' : 'image'
        const item = await idbAdd({
          name: file.name,
          type,
          mime: file.type,
          size: file.size,
          blob: file,
          addedAt: Date.now(),
        })
        added.push(item)
      }
      resolve(added)
    }

    input.click()
  })
}

export async function listMedia(opts = {}) {
  if (hasElectron) return window.electron.media.list(opts)
  const all = await idbGetAll()
  return opts.type ? all.filter(m => m.type === opts.type) : all
}

export async function deleteMedia(id) {
  if (hasElectron) return window.electron.media.delete(id)
  return idbDelete(id)
}

/**
 * Devuelve una URL utilizable en <img>/<video>:
 *  - Electron: media://<basename> (resuelto por protocolo registrado)
 *  - Browser: blob URL temporal del Blob almacenado
 */
export function getMediaURL(item) {
  if (!item) return null
  if (hasElectron) {
    // En Electron viene con `path` absoluto a userData/media/<safe>
    const fileName = item.path.split(/[\\/]/).pop()
    return `media://${encodeURIComponent(fileName)}`
  }
  if (item.blob) return URL.createObjectURL(item.blob)
  return null
}

export function isUsingNativeStorage() {
  return hasElectron
}
