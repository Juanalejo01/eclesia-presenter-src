/**
 * transport.js
 *
 * Capa de transporte WebSocket del remoto móvil EclesiaPresenter.
 * Singleton con state machine de 6 estados, reconnect exponencial con
 * jitter, heartbeat ping/pong de 25 s, cola offline FIFO con tope 100 y
 * patrón observer manual para que los hooks React se suscriban al estado.
 *
 * Por qué un singleton imperativo (no Redux, no Zustand): el ciclo de vida
 * del socket es global a la app (sobrevive a navegaciones) y la API que
 * exponen T3-T7 es disparar comandos imperativos. Un store reactivo añade
 * peso sin ventaja.
 *
 * Lifecycle wake-up: el módulo instala listeners para `online`,
 * `visibilitychange` y `appStateChange` (Capacitor App). Cuando el
 * sistema avisa de que la red volvió o la app pasó a foreground,
 * cancelamos el backoff pendiente y reintentamos al instante; así
 * después de un cambio de WiFi o de un retorno desde background el
 * usuario no espera hasta 30 s.
 *
 * Ejemplo:
 *   import { transport, TransportStatus } from './transport.js'
 *   await transport.connect('ws://192.168.1.10:7777', 'abc123')
 *   const off = transport.subscribe('pgm-update', (p) => console.log(p))
 *   transport.send({ type: 'next' })
 *
 * Edge cases:
 *   - Si `connect(A)` está en vuelo y se llama `connect(B)`, B gana:
 *     se cierra el socket A y se crea uno nuevo para B.
 *   - Close code 4001 = auth-error custom: NO reconectamos, limpiamos
 *     credenciales y emitimos AUTH_ERROR al renderer.
 *   - Suscriptores que lancen excepción NO rompen el dispatcher.
 */
import { ClientCommand, ServerEvent, isValidCommand } from './transportEvents.js'
import { saveCredentials, clearCredentials, loadCredentials } from './transportStorage.js'

/* ============================================================== */
/* Estados de la máquina                                          */
/* ============================================================== */
export const TransportStatus = Object.freeze({
  IDLE:         'idle',          // nunca se intentó conectar
  CONNECTING:   'connecting',    // WebSocket abriéndose
  OPEN:         'open',          // conectado y operativo
  RECONNECTING: 'reconnecting',  // perdió conexión, esperando backoff
  ERROR:        'error',         // error fatal (auth)
  CLOSED:       'closed',        // cerrado intencionalmente
})

/* ============================================================== */
/* Constantes de tuning                                           */
/* ============================================================== */
const HEARTBEAT_INTERVAL_MS = 25_000   // cada cuánto enviar ping
const PONG_TIMEOUT_MS       = 10_000   // si no llega pong en este tiempo, zombie
const QUEUE_MAX             = 100      // tope de la cola offline
const BACKOFF_BASE_MS       = 1_000
const BACKOFF_CAP_MS        = 30_000
const BACKOFF_JITTER_MS     = 1_000
const AUTH_ERROR_CODE       = 4001     // close code custom del server para 401
const NORMAL_CLOSE_CODE     = 1000

// readyState OPEN según WebSocket API. Definido a mano por si en SSR
// (o tests Node sin polyfill) `WebSocket` es undefined al evaluar el módulo.
const WS_OPEN = 1

/* ============================================================== */
/* Estado interno (única fuente de verdad)                        */
/* ============================================================== */
const _state = {
  status:     TransportStatus.IDLE,
  latencyMs:  null,
  queueSize:  0,
  lastError:  null,
  url:        null,
  sentCount:  0,
  recvCount:  0,
}

// Datos privados que NO viajan en el snapshot
let _ws                 = null
let _token              = null
let _intentionalClose   = false
let _reconnectAttempt   = 0
let _reconnectTimer     = null
let _heartbeatTimer     = null
let _pongTimer          = null
let _connectGeneration  = 0   // serial para detectar carreras connect(A)→connect(B)
let _connectResolvers   = []  // resuelven cuando alcanzamos OPEN
const _queue            = []  // cola FIFO de comandos pendientes
const _eventSubs        = new Map()  // eventType → Set<handler>
const _stateSubs        = new Set()

/* ============================================================== */
/* Logging                                                        */
/* ============================================================== */
function log(...args)   { console.log('[transport]', ...args) }
function warn(...args)  { console.warn('[transport]', ...args) }
function error(...args) { console.error('[transport]', ...args) }

/* ============================================================== */
/* Snapshot inmutable                                             */
/* ============================================================== */
function snapshot() {
  return {
    status:    _state.status,
    latencyMs: _state.latencyMs,
    queueSize: _state.queueSize,
    lastError: _state.lastError,
    url:       _state.url,
    sentCount: _state.sentCount,
    recvCount: _state.recvCount,
  }
}

/* ============================================================== */
/* Mutación de estado + notificación a suscriptores               */
/* ============================================================== */
function setStatus(next, extra = {}) {
  const prev = _state.status
  const hasExtras = Object.keys(extra).length > 0
  if (prev === next && !hasExtras) return
  _state.status = next
  if ('lastError' in extra) _state.lastError = extra.lastError
  if ('latencyMs' in extra) _state.latencyMs = extra.latencyMs
  if ('url'       in extra) _state.url       = extra.url
  if (prev !== next) {
    log(`status: ${prev} -> ${next}`)
  }
  notifyState()
}

function notifyState() {
  const snap = snapshot()
  for (const cb of _stateSubs) {
    try { cb(snap) } catch (e) { error('state subscriber threw:', e) }
  }
}

/* ============================================================== */
/* Cola offline                                                   */
/* ============================================================== */
function enqueue(cmd) {
  if (_queue.length >= QUEUE_MAX) {
    const dropped = _queue.shift()
    warn(`queue full (${QUEUE_MAX}), dropping oldest:`, dropped?.type)
  }
  _queue.push(cmd)
  _state.queueSize = _queue.length
  notifyState()
}

function flushQueue() {
  if (_queue.length === 0) return
  log(`flushing queue (${_queue.length} pending)`)
  while (_queue.length > 0) {
    const cmd = _queue.shift()
    rawSend(cmd)
  }
  _state.queueSize = 0
  notifyState()
}

/* ============================================================== */
/* Envío crudo (asume socket OPEN)                                */
/* ============================================================== */
function rawSend(cmd) {
  if (!_ws || _ws.readyState !== WS_OPEN) return false
  try {
    _ws.send(JSON.stringify(cmd))
    if (cmd.type !== ClientCommand.PING) {
      _state.sentCount++
      log('-> send', cmd.type)
      notifyState()
    }
    return true
  } catch (e) {
    error('rawSend failed:', e)
    return false
  }
}

/* ============================================================== */
/* Heartbeat                                                      */
/* ============================================================== */
function startHeartbeat() {
  stopHeartbeat()
  _heartbeatTimer = setInterval(() => {
    if (!_ws || _ws.readyState !== WS_OPEN) return
    const ts = Date.now()
    rawSend({ type: ClientCommand.PING, payload: { ts } })
    // armar timeout: si en 10 s no hay pong → zombie
    clearTimeout(_pongTimer)
    _pongTimer = setTimeout(() => {
      warn('pong timeout: closing socket and reconnecting')
      // Provocar reconnect cerrando con código no-normal
      try { _ws?.close(4000, 'pong-timeout') } catch { /* ignore */ }
    }, PONG_TIMEOUT_MS)
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null }
  if (_pongTimer)      { clearTimeout(_pongTimer);  _pongTimer = null }
}

/* ============================================================== */
/* Reconnect con backoff exponencial + jitter                     */
/* ============================================================== */
function computeBackoffMs(attempt) {
  const exp = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS)
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS)
  return exp + jitter
}

function scheduleReconnect() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer)
  if (!_state.url || !_token) {
    warn('no credentials: cannot reconnect, going ERROR')
    setStatus(TransportStatus.ERROR, { lastError: 'no-credentials' })
    return
  }
  const delay = computeBackoffMs(_reconnectAttempt)
  log(`scheduling reconnect attempt #${_reconnectAttempt + 1} in ${delay}ms`)
  setStatus(TransportStatus.RECONNECTING)
  _reconnectTimer = setTimeout(() => {
    _reconnectAttempt++
    openSocket(_state.url, _token)
  }, delay)
}

/* ============================================================== */
/* Apertura del socket                                            */
/* ============================================================== */
function openSocket(url, token) {
  // Limpiar socket previo si existe
  if (_ws) {
    try {
      _ws.onopen = _ws.onmessage = _ws.onerror = _ws.onclose = null
      _ws.close()
    } catch { /* ignore */ }
    _ws = null
  }
  stopHeartbeat()

  const generation = ++_connectGeneration
  _intentionalClose = false
  setStatus(TransportStatus.CONNECTING, { url, lastError: null })

  // El token va como subprotocol Bearer.<token> — el server lo lee de
  // Sec-WebSocket-Protocol y responde 4001 si no valida.
  let socket
  try {
    socket = new WebSocket(url, ['eclesia.v1', `bearer.${token}`])
  } catch (e) {
    error('WebSocket ctor threw:', e)
    setStatus(TransportStatus.ERROR, { lastError: String(e?.message || e) })
    rejectPendingConnect(e)
    return
  }
  _ws = socket

  socket.onopen = () => {
    if (generation !== _connectGeneration) {
      // Hubo un connect() posterior: este socket ya no nos sirve
      try { socket.close() } catch { /* ignore */ }
      return
    }
    _reconnectAttempt = 0
    // Reset de campos de "salud" — un reconnect OK debe borrar el error
    // que dejó el ciclo anterior y arrancar latencyMs en null hasta el
    // primer pong.
    setStatus(TransportStatus.OPEN, { lastError: null, latencyMs: null })
    startHeartbeat()
    flushQueue()
    resolvePendingConnect()
  }

  socket.onmessage = (ev) => {
    if (generation !== _connectGeneration) return
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      warn('invalid JSON from server, ignoring')
      return
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      // Mensaje sin type → ignora silenciosamente
      return
    }
    _state.recvCount++
    dispatchServerMessage(msg)
    notifyState()
  }

  socket.onerror = (ev) => {
    if (generation !== _connectGeneration) return
    error('socket error:', ev?.message || ev)
    // Anota el error y notifica vía setStatus (no mutación directa).
    // Mantenemos el status actual — onclose decidirá la transición.
    setStatus(_state.status, { lastError: ev?.message || 'socket-error' })
  }

  socket.onclose = (ev) => {
    if (generation !== _connectGeneration) return
    stopHeartbeat()
    const code = ev?.code
    log(`socket closed (code=${code}, reason="${ev?.reason || ''}")`)

    if (code === AUTH_ERROR_CODE) {
      // 4001 → auth-error: NO reconectamos
      setStatus(TransportStatus.ERROR, { lastError: 'auth-error' })
      _token = null
      // Limpiar credenciales en background
      clearCredentials().catch(() => { /* ignore */ })
      emitEvent(ServerEvent.AUTH_ERROR, { code: 4001, message: 'auth-error' })
      rejectPendingConnect(new Error('auth-error'))
      return
    }

    if (_intentionalClose) {
      setStatus(TransportStatus.CLOSED)
      rejectPendingConnect(new Error('closed'))
      return
    }

    // Reconnect
    rejectPendingConnect(new Error('connection-lost'))
    scheduleReconnect()
  }
}

/* ============================================================== */
/* Dispatcher de mensajes server → cliente                        */
/* ============================================================== */
function dispatchServerMessage(msg) {
  // PONG: calcular latencia, NO emite al exterior
  if (msg.type === ServerEvent.PONG) {
    if (_pongTimer) { clearTimeout(_pongTimer); _pongTimer = null }
    const ts = msg?.payload?.ts
    if (typeof ts === 'number') {
      _state.latencyMs = Math.max(0, Date.now() - ts)
    }
    return
  }
  log('<- recv', msg.type)
  emitEvent(msg.type, msg.payload)
}

function emitEvent(type, payload) {
  const set = _eventSubs.get(type)
  if (!set) return
  for (const handler of set) {
    try { handler(payload) } catch (e) { error(`handler for ${type} threw:`, e) }
  }
}

/* ============================================================== */
/* Promesas de connect()                                          */
/* ============================================================== */
function resolvePendingConnect() {
  const list = _connectResolvers
  _connectResolvers = []
  for (const { resolve } of list) {
    try { resolve() } catch { /* ignore */ }
  }
}

function rejectPendingConnect(err) {
  const list = _connectResolvers
  _connectResolvers = []
  for (const { reject } of list) {
    try { reject(err) } catch { /* ignore */ }
  }
}

/* ============================================================== */
/* API pública                                                    */
/* ============================================================== */
export const transport = {
  /**
   * Conecta al servidor. Persiste url+token en storage.
   * Si ya hay conexión activa o intento en curso, lo aborta y reabre.
   * @param {string} url   ws://host:port
   * @param {string} token Bearer token del pairing
   * @returns {Promise<void>} resuelve al estar OPEN, rechaza si ERROR.
   */
  connect(url, token) {
    if (typeof url !== 'string' || !url.startsWith('ws')) {
      return Promise.reject(new Error('invalid url'))
    }
    if (typeof token !== 'string' || token.length === 0) {
      return Promise.reject(new Error('invalid token'))
    }
    _token = token
    _state.url = url
    _reconnectAttempt = 0
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }

    // Persistir en background — no bloqueamos la conexión por storage
    saveCredentials({ url, token }).catch((e) => warn('saveCredentials failed:', e))

    const p = new Promise((resolve, reject) => {
      _connectResolvers.push({ resolve, reject })
    })
    openSocket(url, token)
    return p
  },

  /**
   * Cierra la conexión intencionalmente, sin reintentos.
   * Limpia credenciales del storage.
   */
  disconnect() {
    _intentionalClose = true
    _connectGeneration++  // invalida cualquier callback en vuelo
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
    stopHeartbeat()
    if (_ws) {
      try { _ws.close(NORMAL_CLOSE_CODE, 'disconnect') } catch { /* ignore */ }
      _ws = null
    }
    _token = null
    _queue.length = 0
    _state.queueSize = 0
    setStatus(TransportStatus.CLOSED, { url: null, lastError: null, latencyMs: null })
    clearCredentials().catch(() => { /* ignore */ })
    rejectPendingConnect(new Error('disconnected'))
  },

  /**
   * Intenta restaurar conexión desde storage.
   * @returns {Promise<boolean>} true si encontró y arrancó la conexión.
   */
  async restore() {
    const creds = await loadCredentials()
    if (!creds) return false
    try {
      await this.connect(creds.url, creds.token)
      return true
    } catch (e) {
      warn('restore: connect failed:', e?.message || e)
      return false
    }
  },

  /**
   * Envía un comando. Si NOT OPEN, lo encola (excepto PING).
   * @param {{type: string, payload?: any}} cmd
   * @returns {boolean} true si enviado o encolado, false si descartado.
   */
  send(cmd) {
    if (!isValidCommand(cmd)) {
      warn('invalid command, dropped:', cmd?.type)
      return false
    }
    if (_state.status === TransportStatus.OPEN) {
      return rawSend(cmd)
    }
    // No-OPEN: PING nunca se encola
    if (cmd.type === ClientCommand.PING) return false
    enqueue(cmd)
    return true
  },

  /**
   * Suscribe a un tipo de evento del server.
   * @param {string} eventType
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe (idempotente)
   */
  subscribe(eventType, handler) {
    if (typeof eventType !== 'string' || typeof handler !== 'function') {
      return () => {}
    }
    let set = _eventSubs.get(eventType)
    if (!set) { set = new Set(); _eventSubs.set(eventType, set) }
    set.add(handler)
    let active = true
    return () => {
      if (!active) return
      active = false
      const s = _eventSubs.get(eventType)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) _eventSubs.delete(eventType)
    }
  },

  /**
   * Suscribe a cambios del snapshot del estado.
   * @param {(snap: object) => void} cb
   * @returns {() => void} unsubscribe (idempotente)
   */
  subscribeState(cb) {
    if (typeof cb !== 'function') return () => {}
    _stateSubs.add(cb)
    let active = true
    return () => {
      if (!active) return
      active = false
      _stateSubs.delete(cb)
    }
  },

  /**
   * Snapshot síncrono del estado actual.
   * @returns {{status, latencyMs, queueSize, lastError, url, sentCount, recvCount}}
   */
  getState() {
    return snapshot()
  },
}

/* ============================================================== */
/* Hook para tests: reseteo total (NO usar en producción)         */
/* ============================================================== */
export function __resetForTests() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer)
  stopHeartbeat()
  if (_ws) {
    try {
      _ws.onopen = _ws.onmessage = _ws.onerror = _ws.onclose = null
      _ws.close()
    } catch { /* ignore */ }
  }
  _ws = null
  _token = null
  _intentionalClose = false
  _reconnectAttempt = 0
  _reconnectTimer = null
  _heartbeatTimer = null
  _pongTimer = null
  _connectGeneration++
  _connectResolvers = []
  _queue.length = 0
  _eventSubs.clear()
  _stateSubs.clear()
  _state.status     = TransportStatus.IDLE
  _state.latencyMs  = null
  _state.queueSize  = 0
  _state.lastError  = null
  _state.url        = null
  _state.sentCount  = 0
  _state.recvCount  = 0
}

/* ============================================================== */
/* Lifecycle wake-up: red/visibilidad/Capacitor App                */
/* ============================================================== */
/**
 * Cancela el backoff pendiente y reconecta YA si estábamos esperando.
 * Idempotente y silenciosa si no procede (no hay credenciales, o ya
 * estamos OPEN, ERROR o CLOSED).
 */
function _wakeUpAndReconnect(reason) {
  if (_state.status === TransportStatus.OPEN)    return
  if (_state.status === TransportStatus.ERROR)   return
  if (_state.status === TransportStatus.CLOSED)  return
  if (!_state.url || !_token)                    return
  log('wake-up reconnect triggered by', reason)
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
  _reconnectAttempt = 0
  openSocket(_state.url, _token)
}

/**
 * Instala una sola vez los listeners de red/visibilidad/Capacitor App.
 * En entornos sin DOM (Node/Jest) sale silencioso — los tests no
 * dependen de estos hooks, así que no hace falta exponerlos.
 */
function _installLifecycleListeners() {
  if (typeof window === 'undefined') return

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => _wakeUpAndReconnect('online'))
    window.addEventListener('offline', () => {
      // No forzamos disconnect: si el offline es transitorio (1-2 s)
      // mantener el socket evita un ciclo de reconnect innecesario.
      // Heartbeat detectará el zombie y disparará reconnect si toca.
      log('browser reports offline')
    })
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        _wakeUpAndReconnect('visibility')
      }
    })
  }

  // Capacitor App lifecycle (iOS/Android background/foreground).
  // Import dinámico con catch para que en web pura (sin Capacitor)
  // no rompa: el módulo no existe en bundle y `import()` rechaza.
  import('@capacitor/app').then(({ App }) => {
    try {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) _wakeUpAndReconnect('app-foreground')
      })
    } catch { /* ignore — plugin no disponible en este runtime */ }
  }).catch(() => {
    // No estamos en Capacitor (web puro). Silencioso.
  })
}

_installLifecycleListeners()

// Re-export útil para los consumers
export { ClientCommand, ServerEvent, isValidCommand } from './transportEvents.js'
