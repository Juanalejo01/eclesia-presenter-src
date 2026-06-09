// Servidor Express + Socket.IO embebido en el main process.
// Sirve:
//   - /overlay   → HTML transparente para usar como Browser Source en OBS
//   - /remote    → UI móvil para controlar la app desde el teléfono
//   - /          → Página de bienvenida con info de conexión + QR
//
// Comunicación bidireccional con el main process via los callbacks
// `onRemoteEvent` (mando móvil → app) y `pushSlide` (app → móviles).

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const os = require('os')
const pairing = require('./pairing')
const bibleSearch = require('./bibleSearch')
const { attachWsRemote } = require('./wsRemote')

const PORT = 3434  // movido del clásico 3000 para evitar choque con otros dev servers

// Cacheamos la versión del package.json al cargar el módulo. require() está
// memoized por Node (siempre devuelve el mismo objeto), pero parsear la ruta
// + lookup en el cache por cada request es trabajo gratuito que ya teníamos
// en /api/info y /api/pair. Mejor leerlo una vez al boot.
const APP_VERSION = require('../../package.json').version

// Estado del slide actual (lo mantiene el server para enviarlo a clientes nuevos)
let currentSlide = { text: '', reference: '', type: 'blank' }
let currentTheme = null
let currentSchedule = []

// PIN, tokens y rate-limit viven en src/server/pairing.js (módulo aparte
// para tests aislados + reutilización desde el WS raw del mobile).

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) return config.address
    }
  }
  return '127.0.0.1'
}

let onRemoteEventHandlers = []

function emitRemoteEvent(name, payload) {
  for (const fn of onRemoteEventHandlers) {
    try { fn(name, payload) } catch (e) { console.error('[server] remote handler:', e) }
  }
}

/** Llamar desde main.js para recibir eventos del móvil. */
function onRemoteEvent(fn) {
  onRemoteEventHandlers.push(fn)
  return () => { onRemoteEventHandlers = onRemoteEventHandlers.filter(x => x !== fn) }
}

let _io = null
let _songsCache = null

// Canal de broadcast simple para sincronizar pushSlide/pushTheme/pushSchedule
// entre Socket.IO (legacy /remote HTML) y el WS raw (/ws/remote para mobile).
// Cada subscriber recibe (type, payload) cuando se publica un evento.
const _broadcastSubscribers = new Set()
const broadcastChannel = {
  subscribe(fn) {
    _broadcastSubscribers.add(fn)
    return () => _broadcastSubscribers.delete(fn)
  },
  publish(type, payload) {
    // Snapshot del Set antes de iterar: si un subscriber llama a
    // subscribe/unsubscribe durante el callback, mutar el Set en plena
    // iteración tiene semántica indefinida en ES; el snapshot lo evita.
    const snapshot = Array.from(_broadcastSubscribers)
    for (const fn of snapshot) {
      try { fn(type, payload) } catch (e) {
        console.warn('[server] broadcast subscriber error:', e?.message || e)
      }
    }
  },
}

/** Llamar desde main.js cuando el slide cambie en la app, para empujar a los móviles. */
function pushSlide(slide) {
  currentSlide = slide || { text: '', reference: '', type: 'blank' }
  if (_io) _io.emit('slide:update', currentSlide)            // legacy Socket.IO
  broadcastChannel.publish('pgm-update', currentSlide)        // mobile WS raw
}

function pushTheme(theme) {
  currentTheme = theme
  if (_io) _io.emit('theme:update', currentTheme)
  broadcastChannel.publish('pgm-update-theme', currentTheme)
}

/** Push del schedule (lista del día) a los móviles.
 *  API expuesta pero aún SIN caller — se cableará desde main.js (T7) cuando
 *  se modifique la Lista del día (drag&drop reorder, etc.). */
function pushSchedule(items) {
  currentSchedule = Array.isArray(items) ? items : []
  broadcastChannel.publish('schedule-update', currentSchedule)
}

/** Push de la lista de canciones a los móviles conectados. */
function pushSongs(songs) {
  _songsCache = Array.isArray(songs) ? songs.map(s => ({
    id: s.id, title: s.title, author: s.author, tags: s.tags,
  })) : []
  if (_io) _io.emit('songs:list', _songsCache)
  broadcastChannel.publish('songs-list', _songsCache)
}

function getCurrentSlide() { return currentSlide }
function getCurrentTheme() { return currentTheme }
function getCurrentSchedule() { return currentSchedule }

/**
 * Arranca el servidor HTTP + Socket.IO + WS raw.
 * @param {{ port?: number }} [opts] — port=0 elige uno random (útil en tests)
 */
function startServer(opts = {}) {
  const listenPort = Number.isInteger(opts.port) ? opts.port : PORT
  const app = express()
  const httpServer = http.createServer(app)
  // CORS restringido a same-origin + cualquier IP local (no '*').
  // Solo clientes de la propia LAN deberían poder conectar.
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        // Permitir conexiones sin Origin (apps móviles, file://, curl)
        if (!origin) return cb(null, true)
        // Permitir mismo origen
        try {
          const u = new URL(origin)
          // Solo IPs privadas (10.x, 192.168.x, 172.16-31.x) y localhost
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return cb(null, true)
          if (u.hostname.match(/^192\.168\./)) return cb(null, true)
          if (u.hostname.match(/^10\./)) return cb(null, true)
          if (u.hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) return cb(null, true)
        } catch {}
        cb(new Error('CORS: origin no permitido'))
      },
    },
  })
  _io = io
  app.use(express.json({ limit: '8kb' }))

  // CORS global para TODAS las rutas /api/*. Sin esto, los browsers bloquean
  // el POST /api/pair desde el mobile dev server (puerto 5173) hacia el server
  // (puerto 3434) — son origins distintos para el navegador aunque coincida IP.
  // Permitimos '*' porque:
  //   - Solo expuesto en LAN (puerto 3434 sin reverse proxy a internet)
  //   - Endpoints sensibles (/api/pair/devices, /api/pair/:token) usan Bearer
  //   - El rate-limit por IP del /api/pair sigue activo
  // OPTIONS preflight se responde con 204 + headers para los POST con
  // content-type: application/json (que disparan preflight).
  app.use('/api', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.set('Access-Control-Max-Age', '86400')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  // Página raíz: bienvenida + link al remote
  app.get('/', (_req, res) => {
    const ip = getLocalIP()
    res.send(WELCOME_PAGE.replace(/\$\{IP\}/g, ip).replace(/\$\{PORT\}/g, String(PORT)))
  })

  // OBS browser source
  app.get('/overlay', (_req, res) => res.send(OVERLAY_PAGE))

  // Mobile remote control
  app.get('/remote', (_req, res) => res.send(REMOTE_PAGE))

  // Discriminador público para el móvil: responde "¿soy EclesiaPresenter?".
  // Lo llama pairing.checkServer() ANTES de POST /api/pair para distinguir
  //   - puerto incorrecto (responde, pero no es esta app)
  //   - servidor caído (no responde)
  //   - red/firewall (timeout)
  //   - Brave Shields / mixed-content (TypeError con patrón policy)
  // sin gastar intentos del rate-limiter de /api/pair (5/min/IP).
  //
  // GET simple sin headers custom → no dispara CORS preflight.
  // CORS '*' aquí es seguro: la respuesta no expone nada sensible
  // (nombre app + versión semver pública).
  app.get('/api/info', (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'no-store')
    res.json({
      ok: true,
      app: 'EclesiaPresenter',
      version: APP_VERSION,
      protocol: 1,
      capabilities: ['ws-remote', 'pair-v1'],
    })
  })

  // Endpoint para que el móvil valide el PIN y reciba un token de autorización.
  // Rate-limited por IP para prevenir brute-force del PIN de 6 dígitos.
  // Body: { pin, deviceId?, deviceName? }
  //   - deviceId/Name son opcionales (compat con el remote HTML legacy que solo
  //     manda { pin }). Si vienen, se asocian al token para listado/revocación.
  app.post('/api/pair', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown'
    const rate = pairing.checkPinRateLimit(ip)
    if (!rate.allowed) {
      res.setHeader('Retry-After', Math.ceil(rate.retryAfterMs / 1000))
      return res.status(429).json({
        ok: false,
        error: 'demasiados_intentos',
        retryAfterMs: rate.retryAfterMs,
      })
    }
    // Comparación timing-safe centralizada en pairing.verifyPin para no
    // exponer PAIRING_PIN al endpoint y evitar oracle timing attacks (un
    // `!==` permitiría inferir el PIN byte-a-byte midiendo latencias).
    if (!pairing.verifyPin(req.body?.pin)) {
      return res.status(401).json({ ok: false, error: 'pin_incorrecto' })
    }
    const deviceId = String(req.body?.deviceId || '').slice(0, 64) || 'unknown'
    const deviceName = String(req.body?.deviceName || '').slice(0, 64) || 'Cliente sin nombre'
    const token = pairing.issueToken({ deviceId, deviceName })
    res.json({
      ok: true,
      token,
      serverInfo: {
        version: APP_VERSION,
        // Usamos el puerto real del listener (no la constante PORT) por si
        // en tests/dev se levantó en un puerto distinto.
        wsUrl: `ws://${getLocalIP()}:${httpServer.address()?.port || PORT}/ws/remote`,
      },
    })
  })

  // ---- Endpoints de gestión de dispositivos (protegidos por Bearer token) ----
  //
  // Middleware mínimo: lee 'Authorization: Bearer <token>' y verifica que
  // el token sea válido. Reutiliza el mismo Map de pairing.
  const requireBearer = (req, res, next) => {
    const auth = String(req.headers['authorization'] || '')
    // Regex tightened: token sin espacios internos (\S+) y trailing whitespace
    // opcional. Antes (.+) podía aceptar tokens con espacios — válido en HTTP
    // pero no en nuestros tokens hex.
    const m = auth.match(/^Bearer\s+(\S+)\s*$/i)
    if (!m) return res.status(401).json({ ok: false, error: 'token_requerido' })
    const v = pairing.validateToken(m[1])
    if (!v.valid) return res.status(401).json({ ok: false, error: 'token_invalido' })
    req.deviceInfo = { token: m[1], deviceId: v.deviceId, deviceName: v.deviceName }
    next()
  }

  // Lista dispositivos pareados (sin exponer el token completo en respuesta:
  // se ofusca dejando solo los últimos 8 chars para identificación visual).
  app.get('/api/pair/devices', requireBearer, (_req, res) => {
    const devices = pairing.listDevices().map(d => ({
      tokenTail: d.token.slice(-8),
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      issuedAt: d.issuedAt,
      lastUsedAt: d.lastUsedAt,
    }))
    res.json({ ok: true, devices })
  })

  // Revoca un token. SOLO permitimos self-revocation (un device cierra su
  // propia sesión). Todos los devices pareados son peers iguales — no hay
  // rol "admin del servicio". Sin esta restricción, cualquier token válido
  // podría revocar a cualquier otro device → privilege escalation entre peers.
  //
  // SI en el futuro queremos un rol "admin del servicio" (operador del PC),
  // añadir un flag isAdmin al token (emitido desde el desktop UI) y permitir
  // a esos tokens revocar otros.
  app.delete('/api/pair/:token', requireBearer, (req, res) => {
    const target = String(req.params.token || '')
    if (target !== req.deviceInfo.token) {
      return res.status(403).json({ ok: false, error: 'no_autorizado' })
    }
    const existed = pairing.revokeToken(target)
    res.json({ ok: true, revoked: existed })
  })

  // ---- Endpoint de búsqueda bíblica (T9 mobile) ----
  //
  // Bearer auth obligatoria + rate-limit por device (30 req/min). El resultado
  // viene del módulo bibleSearch que carga los JSON de public/ en memoria
  // lazy por versionId. Si el modo es 'auto', primero intenta parsear como
  // referencia ("Juan 3:16") y si no encaja cae a fulltext.
  //
  // Mismo modelo de errores que /api/pair: status code HTTP + body { ok:false, error }.
  // Nunca devolvemos paths del filesystem ni el query del usuario en producción
  // (solo en dev). Cache-Control: no-store para que ningún proxy cache la respuesta
  // con Bearer auth.
  app.post('/api/bible/search', requireBearer, (req, res) => {
    res.set('Cache-Control', 'no-store')

    // Rate-limit per-device antes de tocar el filesystem.
    const rate = bibleSearch.checkRateLimit(req.deviceInfo.deviceId)
    if (!rate.allowed) {
      res.setHeader('Retry-After', Math.ceil(rate.retryAfterMs / 1000))
      return res.status(429).json({
        ok: false,
        error: 'demasiadas_busquedas',
        retryAfterMs: rate.retryAfterMs,
      })
    }

    // Sanitización del query. express.json({limit:'8kb'}) ya impide payloads
    // monstruosos; aquí cortamos a 200 chars y colapsamos whitespace para
    // que parseReference no tropiece.
    const q = String(req.body?.q || '').slice(0, 200).replace(/\s+/g, ' ').trim()
    if (!q) return res.status(400).json({ ok: false, error: 'q_required' })

    const version = typeof req.body?.version === 'string' ? req.body.version : bibleSearch.DEFAULT_VERSION
    if (!bibleSearch.VERSION_IDS.includes(version)) {
      // Fallback silencioso a default — no rompemos UX por un typo del cliente.
      // El response devuelve la version efectivamente usada para que el cliente
      // pueda detectar el downgrade.
    }
    const limit = Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : 20
    const mode = ['auto', 'ref', 'text'].includes(req.body?.mode) ? req.body.mode : 'auto'

    const result = bibleSearch.search({ q, version, limit, mode })

    if (!result.ok) {
      // Mapeo error → HTTP code
      const code = result.error === 'q_required'           ? 400
                 : result.error === 'q_too_short'          ? 400
                 : result.error === 'book_not_found'       ? 404
                 : result.error === 'reference_not_found'  ? 404
                 : result.error === 'bible_unavailable'    ? 503
                 : 400
      const body = { ok: false, error: result.error }
      if (result.error === 'q_too_short') body.minLength = 3
      if (result.parsed) body.parsed = result.parsed
      return res.status(code).json(body)
    }

    return res.json(result)
  })

  io.on('connection', (socket) => {
    // Estado inicial al conectar — read-only es libre
    socket.emit('slide:update', currentSlide)
    if (currentTheme) socket.emit('theme:update', currentTheme)
    if (_songsCache) socket.emit('songs:list', _songsCache)

    // Endpoint para autenticarse via socket con un token previamente emitido
    let isAuthorized = false
    socket.on('auth:token', (token) => {
      if (typeof token === 'string' && pairing.validateToken(token).valid) {
        isAuthorized = true
        pairing.touchToken(token)
        socket.emit('auth:ok')
      } else {
        socket.emit('auth:fail')
      }
    })

    // Middleware: solo dejar pasar comandos si está autorizado
    const requireAuth = (handler) => (...args) => {
      if (!isAuthorized) {
        socket.emit('auth:required')
        return
      }
      handler(...args)
    }

    // Comandos desde móvil → bridge al main process (requieren auth)
    socket.on('remote:next',  requireAuth(() => emitRemoteEvent('next')))
    socket.on('remote:prev',  requireAuth(() => emitRemoteEvent('prev')))
    socket.on('remote:blank', requireAuth(() => emitRemoteEvent('blank')))
    socket.on('remote:black', requireAuth(() => emitRemoteEvent('black')))
    socket.on('remote:clear', requireAuth(() => emitRemoteEvent('clear')))
    socket.on('remote:bible-ref', requireAuth((p) => emitRemoteEvent('bible-ref', p || {})))
    socket.on('remote:song',      requireAuth((p) => emitRemoteEvent('song', p || {})))
  })

  // Endpoint WS raw para el mobile (Capacitor + React).
  // Coexiste con Socket.IO en el mismo puerto gracias al evento 'upgrade'.
  const wsRemoteHandle = attachWsRemote(httpServer, {
    pairing,
    getCurrentSlide,
    getCurrentSchedule,
    getCurrentTheme,
    onRemoteEvent: emitRemoteEvent,
    broadcastChannel,
  })

  // En tests pasamos port=0 → Node escoge uno random; el caller lo lee de
  // address().port después de listen.
  const isTestMode = listenPort === 0
  httpServer.listen(listenPort, '0.0.0.0', () => {
    const ip = getLocalIP()
    const actualPort = httpServer.address()?.port || listenPort
    if (!isTestMode) {
      console.log(`[EclesiaPresenter] server activo en http://${ip}:${actualPort}`)
      console.log(`  Página inicio:    http://${ip}:${actualPort}/`)
      console.log(`  Control móvil:    http://${ip}:${actualPort}/remote`)
      console.log(`  OBS overlay:      http://${ip}:${actualPort}/overlay`)
      console.log(`  Mobile WS:        ws://${ip}:${actualPort}/ws/remote`)
    }
  })

  return {
    io, httpServer, getLocalIP,
    get port() { return httpServer.address()?.port || listenPort },
    pushSlide, pushTheme, pushSongs, pushSchedule, onRemoteEvent,
    getCurrentSlide, getCurrentSchedule, getCurrentTheme,
    getPairingPin: () => pairing.PAIRING_PIN,
    // Cierre ordenado (útil para tests)
    close: async () => {
      try { await wsRemoteHandle.close() } catch {}
      try { io.close() } catch {}
      await new Promise(resolve => httpServer.close(() => resolve()))
    },
  }
}

// ------------ PAGES ------------

const OVERLAY_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Overlay OBS</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { height:100%; background: transparent; font-family: 'Cormorant Garamond', Georgia, serif; }
  body { display:flex; align-items:flex-end; justify-content:center; padding: 6vh 8vw; }
  #slide { text-align:center; color:#fff; text-shadow: 0 4px 16px rgba(0,0,0,.85); max-width: 84vw; }
  #text { font-size: clamp(36px, 4.4vw, 76px); font-weight:500; line-height:1.25; letter-spacing:.005em; }
  #reference { font-family: 'Geist Mono', monospace; font-size: clamp(13px, 1.05vw, 18px);
               margin-top: 14px; letter-spacing:.18em; text-transform:uppercase;
               color:#f4e6d7; opacity:.92; }
</style>
</head>
<body>
  <div id="slide">
    <div id="text"></div>
    <div id="reference"></div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io()
    function render(d) {
      const text = d?.type === 'blackout' ? '' : (d?.text || '')
      document.getElementById('text').textContent = text
      document.getElementById('reference').textContent = d?.reference || ''
    }
    socket.on('slide:update', render)
  </script>
</body>
</html>`

const REMOTE_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0c0a09">
<title>EclesiaPresenter — Control</title>
<style>
  :root {
    --bg-0: #0c0a09;
    --bg-1: #14100d;
    --bg-2: #1c1614;
    --bg-3: #261e1a;
    --copper-100: #f4e6d7;
    --copper-200: #db9f75;
    --copper-300: #a85f33;
    --text-1: #f5ebe0;
    --text-2: #c9b29c;
    --text-3: #8a7866;
    --danger: #e87575;
  }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color: transparent; }
  html, body { min-height: 100vh; background: var(--bg-0); color: var(--text-1);
    font-family: -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif;
    overscroll-behavior: contain; }
  body { padding: 14px 12px 96px; display: flex; flex-direction: column; gap: 12px; user-select: none; -webkit-user-select: none; }

  header { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; }
  .brand { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 18px; color: var(--copper-100); }
  .brand em { color: var(--copper-200); font-style: normal; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-family: 'Courier New', monospace;
    letter-spacing: .14em; text-transform: uppercase; color: var(--text-3); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #7df3a8; box-shadow: 0 0 6px #7df3a8; }
  .dot.off { background: #555; box-shadow: none; }

  /* Slide actual (siempre visible arriba) */
  .slide-card {
    background: linear-gradient(180deg, var(--bg-1), var(--bg-2));
    border: 1px solid rgba(232,181,145,.18);
    border-radius: 14px; padding: 16px 16px;
    min-height: 88px; display: flex; flex-direction: column; justify-content: center;
  }
  .slide-ref { font-family: 'Courier New', monospace; font-size: 10px; color: var(--copper-200);
    letter-spacing: .16em; text-transform: uppercase; margin-bottom: 6px; }
  .slide-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px;
    line-height: 1.3; color: var(--text-1); max-height: 90px; overflow: hidden; }
  .slide-empty { color: var(--text-3); font-style: italic; font-size: 13px; }

  /* Tabs sticky abajo */
  .tabs {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    background: var(--bg-1); border-top: 1px solid var(--line-1, rgba(232,181,145,.10));
    padding: 8px 8px calc(env(safe-area-inset-bottom, 8px) + 8px) 8px; gap: 6px;
    z-index: 20;
  }
  .tab {
    background: transparent; color: var(--text-3); border: 0;
    padding: 10px 4px; border-radius: 10px; font-size: 12px; font-weight: 600;
    letter-spacing: .04em; cursor: pointer;
  }
  .tab.active { background: linear-gradient(180deg, rgba(168,95,51,.20), rgba(128,64,18,.10));
                color: var(--copper-100); }

  /* Vista del Mando: botones gigantes prev/next */
  .nav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .nav button {
    height: 84px; border: 0; border-radius: 14px; font-size: 16px; font-weight: 700;
    letter-spacing: .04em; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: transform .08s, filter .12s;
  }
  .nav button:active { transform: scale(0.97); filter: brightness(0.92); }
  .nav .prev { background: var(--bg-2); color: var(--text-1); border: 1px solid rgba(232,181,145,.18); }
  .nav .next { background: linear-gradient(180deg, var(--copper-200), var(--copper-300)); color: #1a0e08; }
  .nav .arrow { font-size: 22px; line-height: 1; }

  .actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .actions button {
    height: 52px; border: 0; border-radius: 12px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: filter .12s, background .12s;
    background: var(--bg-2); color: var(--text-2); border: 1px solid rgba(232,181,145,.10);
  }
  .actions button:active { filter: brightness(0.85); }
  .actions button.blackout { background: #000; color: var(--text-2); border-color: rgba(255,255,255,0.08); }

  /* Biblia / Canciones: input + lista */
  .search-row { display: flex; gap: 8px; }
  .search-input {
    flex: 1; height: 52px; border: 0; border-radius: 12px; background: var(--bg-2);
    color: var(--text-1); font-size: 16px; padding: 0 16px;
    border: 1px solid rgba(232,181,145,.15);
  }
  .search-input::placeholder { color: var(--text-3); font-size: 14px; }
  .search-input:focus { outline: none; border-color: var(--copper-200); }
  .send-btn {
    height: 52px; padding: 0 18px; border: 0; border-radius: 12px;
    background: linear-gradient(180deg, var(--copper-200), var(--copper-300)); color: #1a0e08;
    font-size: 14px; font-weight: 700; cursor: pointer;
  }
  .send-btn:active { filter: brightness(.92); transform: scale(.97); }
  .send-btn:disabled { opacity: .4; }

  .hint-row { font-size: 11px; color: var(--text-3); padding: 4px 4px 0;
    font-family: 'Courier New', monospace; letter-spacing: .04em; }

  .song-item {
    display: flex; flex-direction: column; gap: 2px;
    padding: 14px 14px; background: var(--bg-2); border-radius: 10px;
    border: 1px solid rgba(232,181,145,.08); margin-bottom: 8px;
    cursor: pointer; transition: filter .1s, transform .08s;
  }
  .song-item:active { filter: brightness(.85); transform: scale(.99); }
  .song-title { font-size: 16px; font-weight: 600; color: var(--text-1); }
  .song-meta { font-size: 11px; color: var(--text-3); font-family: 'Courier New', monospace; }

  .empty-state { padding: 24px 16px; text-align: center; color: var(--text-3); font-size: 13px; }

  /* Suggested-refs (chips de accesos rápidos para Biblia) */
  .quick-refs { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 4px 12px; }
  .chip {
    background: var(--bg-2); color: var(--text-2);
    border: 1px solid rgba(232,181,145,.12); padding: 7px 10px;
    border-radius: 999px; font-size: 12px; cursor: pointer;
  }
  .chip:active { background: var(--bg-3); }

  .hidden { display: none !important; }
</style>
</head>
<body>
  <header>
    <div class="brand">EclesiaPresenter <em>Remote</em></div>
    <div class="status"><span class="dot" id="dot"></span><span id="state">conectando</span></div>
  </header>

  <div class="slide-card">
    <div class="slide-ref" id="ref"></div>
    <div class="slide-text" id="text"><span class="slide-empty">Sin presentación activa…</span></div>
  </div>

  <!-- VISTA: MANDO -->
  <section id="view-mando">
    <div class="nav" style="margin-bottom:8px">
      <button class="prev"  onclick="send('prev')"><span class="arrow">◀</span> Anterior</button>
      <button class="next"  onclick="send('next')">Siguiente <span class="arrow">▶</span></button>
    </div>
    <div class="actions">
      <button class="blank"    onclick="send('blank')">Blanco</button>
      <button class="blackout" onclick="send('black')">Negro</button>
      <button onclick="send('clear')">Limpiar</button>
    </div>
  </section>

  <!-- VISTA: BIBLIA -->
  <section id="view-biblia" class="hidden">
    <div class="search-row">
      <input class="search-input" id="bibleInput"
        placeholder="ej: salmos 22:1 · juan 3 16 · genesis 1"
        autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="send-btn" id="bibleSend">Ir</button>
    </div>
    <div class="hint-row">Acceso rápido</div>
    <div class="quick-refs">
      <button class="chip" onclick="quickBible('juan 3:16')">Juan 3:16</button>
      <button class="chip" onclick="quickBible('salmos 23')">Salmo 23</button>
      <button class="chip" onclick="quickBible('1 corintios 13')">1 Cor 13</button>
      <button class="chip" onclick="quickBible('mateo 5:3')">Mateo 5:3</button>
      <button class="chip" onclick="quickBible('genesis 1:1')">Gn 1:1</button>
      <button class="chip" onclick="quickBible('proverbios 3:5')">Pr 3:5</button>
      <button class="chip" onclick="quickBible('filipenses 4:13')">Fil 4:13</button>
      <button class="chip" onclick="quickBible('romanos 8:28')">Ro 8:28</button>
    </div>
  </section>

  <!-- VISTA: CANCIONES -->
  <section id="view-canciones" class="hidden">
    <input class="search-input" id="songInput"
      placeholder="Buscar canción por título o autor…"
      autocomplete="off" autocapitalize="off" spellcheck="false">
    <div id="songList"></div>
  </section>

  <!-- TABS (deshabilitadas hasta pairing OK) -->
  <nav class="tabs">
    <button class="tab active" data-view="mando"     onclick="setView('mando')">Mando</button>
    <button class="tab"        data-view="biblia"    onclick="setView('biblia')">Biblia</button>
    <button class="tab"        data-view="canciones" onclick="setView('canciones')">Canciones</button>
  </nav>

  <!-- PAIRING OVERLAY (se oculta cuando el token es válido) -->
  <div id="pair-overlay" style="position:fixed; inset:0; background:rgba(12,10,9,0.96); z-index:50;
       display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px; gap:18px;">
    <div style="font-family:'Cormorant Garamond',serif; font-size:24px; font-style:italic; color:var(--copper-100);">
      Eclesia<em style="color:var(--copper-200);font-style:normal;">Remote</em>
    </div>
    <div style="text-align:center; max-width:300px;">
      <div style="font-size:14px; color:var(--text-2); margin-bottom:8px;">Introduce el PIN de 6 dígitos</div>
      <div style="font-size:11px; color:var(--text-3); font-family:'Courier New',monospace; letter-spacing:0.06em;">
        Lo verás en el PC →<br>Transmisión → Control remoto
      </div>
    </div>
    <input id="pin-input" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6"
      placeholder="000000" autocomplete="off"
      style="width:200px; height:64px; text-align:center; font-size:32px; font-family:'Courier New',monospace;
             letter-spacing:0.4em; border:1px solid rgba(232,181,145,.25); border-radius:14px;
             background:var(--bg-2); color:var(--copper-100); padding:0;" />
    <button id="pair-btn"
      style="width:200px; height:52px; border:0; border-radius:14px;
             background:linear-gradient(180deg, var(--copper-200), var(--copper-300));
             color:#1a0e08; font-size:15px; font-weight:700; cursor:pointer;">
      Conectar
    </button>
    <p id="pair-err" style="color:var(--danger); font-size:13px; min-height:18px; margin:0;"></p>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io()
    const dot = document.getElementById('dot')
    const state = document.getElementById('state')

    socket.on('connect',    () => { dot.classList.remove('off'); state.textContent = 'conectado' })
    socket.on('disconnect', () => { dot.classList.add('off');    state.textContent = 'desconectado' })

    function send(cmd) {
      socket.emit('remote:' + cmd)
      if (navigator.vibrate) navigator.vibrate(8)
    }

    function render(d) {
      const ref = d?.reference || ''
      const text = d?.type === 'blackout' ? '— pantalla negra —'
                 : d?.type === 'blank'    ? '— pantalla en blanco —'
                 : (d?.text || '')
      document.getElementById('ref').textContent = ref
      const t = document.getElementById('text')
      t.innerHTML = text ? '' : '<span class="slide-empty">Sin presentación activa…</span>'
      if (text) t.textContent = text
    }
    socket.on('slide:update', render)

    // --- Tabs ---
    function setView(name) {
      ['mando','biblia','canciones'].forEach(v => {
        document.getElementById('view-' + v).classList.toggle('hidden', v !== name)
        document.querySelector('.tab[data-view="' + v + '"]').classList.toggle('active', v === name)
      })
      if (name === 'biblia') setTimeout(() => document.getElementById('bibleInput').focus(), 50)
      if (name === 'canciones') setTimeout(() => document.getElementById('songInput').focus(), 50)
    }

    // --- Biblia ---
    const bibleInput = document.getElementById('bibleInput')
    const bibleSend = document.getElementById('bibleSend')
    function sendBible() {
      const query = bibleInput.value.trim()
      if (!query) return
      socket.emit('remote:bible-ref', { query })
      if (navigator.vibrate) navigator.vibrate(12)
      bibleSend.textContent = '✓'
      setTimeout(() => bibleSend.textContent = 'Ir', 800)
    }
    function quickBible(ref) {
      bibleInput.value = ref
      sendBible()
    }
    bibleSend.onclick = sendBible
    bibleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendBible() } })

    // --- Canciones ---
    let allSongs = []
    const songInput = document.getElementById('songInput')
    const songList = document.getElementById('songList')

    function normalize(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') }

    function renderSongs() {
      const q = normalize(songInput.value)
      const filtered = !q ? allSongs : allSongs.filter(s =>
        normalize(s.title).includes(q) || normalize(s.author).includes(q)
      )
      if (filtered.length === 0) {
        songList.innerHTML = '<div class="empty-state">' +
          (allSongs.length === 0 ? 'No hay canciones cargadas todavía.' : 'No hay coincidencias.') +
          '</div>'
        return
      }
      songList.innerHTML = filtered.slice(0, 80).map(s =>
        '<div class="song-item" onclick="projectSong(' + s.id + ')">'
        + '<span class="song-title">' + escapeHtml(s.title) + '</span>'
        + (s.author ? '<span class="song-meta">' + escapeHtml(s.author) + '</span>' : '')
        + '</div>'
      ).join('')
    }
    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c])
    }
    function projectSong(id) {
      socket.emit('remote:song', { id })
      if (navigator.vibrate) navigator.vibrate(12)
    }
    songInput.addEventListener('input', renderSongs)
    socket.on('songs:list', (songs) => { allSongs = songs || []; renderSongs() })

    // Estado inicial vacío
    renderSongs()

    // --- PAIRING ---
    const pinInput = document.getElementById('pin-input')
    const pairBtn = document.getElementById('pair-btn')
    const pairErr = document.getElementById('pair-err')
    const pairOverlay = document.getElementById('pair-overlay')
    let token = sessionStorage.getItem('ecl-remote-token') || null

    function authWithToken(t) {
      socket.emit('auth:token', t)
    }
    socket.on('auth:ok',      () => { pairOverlay.style.display = 'none' })
    socket.on('auth:fail',    () => { token = null; sessionStorage.removeItem('ecl-remote-token'); pairOverlay.style.display = 'flex' })
    socket.on('auth:required',() => { pairOverlay.style.display = 'flex' })
    socket.on('connect', () => { if (token) authWithToken(token) })

    async function doPair() {
      const pin = (pinInput.value || '').trim()
      if (pin.length !== 6) { pairErr.textContent = 'El PIN tiene 6 dígitos'; return }
      pairBtn.disabled = true; pairBtn.textContent = 'Conectando...'
      try {
        const r = await fetch('/api/pair', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        })
        const data = await r.json()
        if (data.ok && data.token) {
          token = data.token
          sessionStorage.setItem('ecl-remote-token', token)
          authWithToken(token)
          pairErr.textContent = ''
        } else {
          pairErr.textContent = 'PIN incorrecto'
          pinInput.value = ''; pinInput.focus()
        }
      } catch (e) {
        pairErr.textContent = 'Error de red'
      } finally {
        pairBtn.disabled = false; pairBtn.textContent = 'Conectar'
      }
    }
    pairBtn.onclick = doPair
    pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') doPair() })

    // Si ya teníamos token guardado, intentar usarlo
    if (token) {
      // Esperar a que conecte el socket
    } else {
      pairOverlay.style.display = 'flex'
      setTimeout(() => pinInput.focus(), 100)
    }
  </script>
</body>
</html>`

const WELCOME_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EclesiaPresenter — Conexión</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0c0a09; color: #f5ebe0;
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 30px; }
  .card { background: #14100d; border: 1px solid rgba(232,181,145,.18); border-radius: 16px;
    padding: 36px 30px; max-width: 480px; width: 100%; text-align: center; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 32px; margin: 0 0 8px; }
  h1 em { color: #db9f75; font-style: italic; }
  p { color: #c9b29c; margin: 0 0 20px; line-height: 1.55; }
  a.link { display: inline-block; margin-top: 18px; padding: 14px 24px; border-radius: 12px;
    background: linear-gradient(180deg, #db9f75, #a85f33); color: #1a0e08; font-weight: 700;
    text-decoration: none; }
  code { font-family: 'Courier New', monospace; background: #1c1614; padding: 2px 8px; border-radius: 6px; color: #f4e6d7; }
</style>
</head>
<body>
  <div class="card">
    <h1>Eclesia<em>Presenter</em></h1>
    <p>Estás conectado al servidor local de EclesiaPresenter.</p>
    <p>Para controlar la app desde este dispositivo, abre:</p>
    <code>http://\${IP}:\${PORT}/remote</code>
    <br>
    <a class="link" href="/remote">Abrir control remoto →</a>
  </div>
</body>
</html>`

module.exports = { startServer }
