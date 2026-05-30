// Cloud sync de canciones — orquestador en el main process.
//
// Responsabilidades:
//   - Llamar al endpoint /api/songs/sync con la license_key del usuario
//   - Construir el payload local (canciones + tombstones)
//   - Aplicar el resultado (insert/update/delete locales)
//   - Persistir `lastSyncAt` para incremental sync
//   - Auto-sync periódico (cada 5 min) si está habilitado
//   - Emitir eventos al renderer (sync:start, sync:ok, sync:error)
//
// Activación:
//   Solo se sincroniza si el usuario tiene una licencia Pro activa.
//   El plan Free no syncroniza (gate del backend).

const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const API_BASE = process.env.ECLESIA_API_BASE || 'https://eclesia-presenter.vercel.app'

// Persistimos lastSyncAt en disco para incremental sync entre arranques
const STATE_FILE = () => path.join(app.getPath('userData'), 'cloud-sync.json')

let state = {
  enabled: false,           // ¿auto-sync activado?
  lastSyncAt: 0,            // ms timestamp del último sync exitoso
  lastSyncError: null,      // último mensaje de error
  syncing: false,
}

let _db = null
let _license = null
let _mainWindow = null
let _autoTimer = null
let _debounceTimer = null

// Cuánto esperamos tras la última mutación antes de sincronizar.
// Si el usuario crea/edita 5 canciones seguidas, agrupamos en 1 solo sync.
const DEBOUNCE_MS = 2000

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'))
    state = { ...state, ...data, syncing: false }
  } catch {}
}

function saveState() {
  try {
    const { syncing, ...persist } = state
    fs.writeFileSync(STATE_FILE(), JSON.stringify(persist), 'utf8')
  } catch {}
}

function emit(channel, payload) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    try { _mainWindow.webContents.send(channel, payload) } catch {}
  }
}

async function syncOnce() {
  if (state.syncing) return { ok: false, error: 'already_syncing' }

  // Necesita licencia Pro activa
  const lic = _license.getState()
  if (!lic.licensed) return { ok: false, error: 'no_license' }
  if (!['pro_monthly', 'pro_yearly', 'lifetime'].includes(lic.plan)) {
    return { ok: false, error: 'requires_pro' }
  }

  state.syncing = true
  state.lastSyncError = null
  emit('cloud-sync:start', { time: Date.now() })

  try {
    const localPayload = _db.getSyncPayload()
    const res = await fetch(`${API_BASE}/api/songs/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: lic.license_key,
        device_id: lic.device_id,
        local: localPayload,
        since: state.lastSyncAt,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      const err = data.error || `http_${res.status}`
      state.lastSyncError = err
      state.syncing = false
      saveState()
      emit('cloud-sync:error', { error: err })
      return { ok: false, error: err }
    }

    const pullStats = _db.applySyncResult({ remote: data.remote, mapping: data.mapping })
    state.lastSyncAt = data.server_time || Date.now()
    state.syncing = false
    saveState()
    // Stats completos: lo que SUBIMOS al cloud (pushed del server) +
    // lo que BAJAMOS del cloud (pullStats del cliente)
    const combinedStats = {
      pushed: data.pushed || { uploaded: 0, updated: 0, deleted: 0 },
      pulled: pullStats,
    }
    emit('cloud-sync:ok', {
      time: state.lastSyncAt,
      stats: combinedStats,
      remoteCount: data.remote?.length || 0,
    })
    return { ok: true, stats: combinedStats }
  } catch (e) {
    state.lastSyncError = e?.message || String(e)
    state.syncing = false
    saveState()
    emit('cloud-sync:error', { error: state.lastSyncError })
    return { ok: false, error: state.lastSyncError }
  }
}

function startAutoSync(intervalMs = 5 * 60_000) {
  stopAutoSync()
  if (!state.enabled) return
  _autoTimer = setInterval(() => {
    syncOnce().catch(() => {})
  }, intervalMs)
  // Sync inicial inmediato
  syncOnce().catch(() => {})
}

function stopAutoSync() {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null }
}

// Flag: hay cambios pendientes que se hicieron MIENTRAS un sync estaba en curso.
// Sin esto, si triggerSync se llama durante state.syncing, syncOnce devuelve
// 'already_syncing' inmediatamente y los cambios se pierden hasta la próxima
// mutación. Con el flag, al terminar el sync, se re-programa un debounce.
let _pendingTrigger = false

// Trigger debounced — se llama desde los IPC handlers de songs:create/update/delete.
// Si auto-sync está deshabilitado o no hay licencia Pro, es no-op silencioso.
// Si hay múltiples mutaciones seguidas, agrupamos en 1 sync (DEBOUNCE_MS).
function triggerSync() {
  if (!state.enabled) return
  // Si hay un sync corriendo, marca trigger pendiente
  if (state.syncing) {
    _pendingTrigger = true
    return
  }
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(async () => {
    _debounceTimer = null
    try {
      await syncOnce()
    } catch {}
    // Si hubo otra mutación durante el sync, re-disparar
    if (_pendingTrigger) {
      _pendingTrigger = false
      triggerSync()
    }
  }, DEBOUNCE_MS)
}

function setEnabled(enabled) {
  state.enabled = !!enabled
  saveState()
  if (state.enabled) startAutoSync()
  else stopAutoSync()
}

function getState() {
  return { ...state, apiBase: API_BASE }
}

function init({ db, license }) {
  _db = db
  _license = license
  loadState()
  // Si quedó habilitado de la sesión anterior, arrancar auto-sync
  if (state.enabled) {
    setTimeout(() => startAutoSync(), 5000)  // delay para no agobiar el arranque
  }
}

function setMainWindow(win) { _mainWindow = win }

module.exports = {
  init,
  setMainWindow,
  setEnabled,
  syncOnce,
  triggerSync,
  getState,
}
