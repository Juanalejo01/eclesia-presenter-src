// WebSocket raw endpoint para el mobile EclesiaPresenter.
//
// Por qué existe (vs el Socket.IO de /remote):
//   - El mobile (Capacitor + React) usa el WebSocket global del navegador
//     sin librerías. Socket.IO añadiría ~70 KB de bundle innecesarios y
//     un protocolo propietario sobre WS que dificulta el debugging.
//   - El protocolo entre mobile y server es simple JSON {type, payload}
//     en cada frame. WS raw es la herramienta correcta.
//   - El /remote HTML legacy se queda con Socket.IO; conviven en el mismo
//     puerto 3434 gracias al evento 'upgrade' compartido del httpServer:
//       - urls que empiezan por '/ws/remote' → este módulo
//       - el resto (/socket.io/...)         → Socket.IO maneja su upgrade
//
// Auth: el header `Sec-WebSocket-Protocol` debe valer 'bearer.<token>'.
// El cliente lo manda como segundo arg de `new WebSocket(url, protocols)`.
// Si el token no es válido cerramos con código 4001 (auth-error custom);
// el cliente mobile interpreta 4001 como "limpiar token + ir a pair screen".
//
// CRÍTICO sobre el handshake:
//   La librería `ws` (v8+) tiene una sutileza: si el cliente envía un
//   `Sec-WebSocket-Protocol` y el server NO le responde con el protocolo
//   negociado, el cliente CIERRA la conexión inmediatamente. Para devolver
//   ese header durante el handshake, NO sirve añadir headers a handleUpgrade;
//   el camino correcto es la opción `handleProtocols` de WebSocketServer,
//   que recibe los protocolos del cliente y devuelve el que se acepta.
//   Aquí aceptamos siempre el `bearer.<token>` que llega (ya validado en
//   el upgrade listener), reenviándolo como protocolo negociado.

const { WebSocketServer } = require('ws')

// Tipos de comando aceptados desde el cliente → main process.
// Cualquier otro tipo se ignora con warning.
const FORWARDABLE_COMMANDS = new Set([
  'next', 'prev', 'blank', 'black', 'clear',
  'bible-ref', 'bible-project-direct', 'song', 'announce',
  'projection-close', 'list-reorder',
])

/**
 * Envía un 401 Unauthorized HTTP/1.1 bien formado y destruye el socket.
 * Centralizado para que las 3 ramas de rechazo del handshake (sin proto,
 * sin bearer, token inválido) emitan EXACTAMENTE la misma respuesta:
 *   - Content-Length: 0 → cumple HTTP/1.1 (algunos clientes/proxies se
 *     quejan si falta y la respuesta tiene body de longitud 0)
 *   - Connection: close → libera el socket sin keep-alive
 *   - WWW-Authenticate: Bearer realm → hint al cliente del esquema esperado
 */
function send401(socket) {
  socket.write(
    'HTTP/1.1 401 Unauthorized\r\n' +
    'Connection: close\r\n' +
    'Content-Length: 0\r\n' +
    'WWW-Authenticate: Bearer realm="ws/remote"\r\n' +
    '\r\n'
  )
  socket.destroy()
}

/**
 * Monta el endpoint WS raw `/ws/remote` sobre el httpServer pasado.
 * @param {import('http').Server} httpServer
 * @param {{
 *   pairing: import('./pairing'),
 *   getCurrentSlide: () => any,
 *   getCurrentSchedule: () => any[],
 *   getCurrentTheme: () => any,
 *   onRemoteEvent: (type: string, payload?: any) => void,
 *   broadcastChannel: { subscribe(fn): () => void, publish(type, payload): void },
 * }} deps
 * @returns {{ wss: WebSocketServer, close: () => Promise<void> }}
 */
function attachWsRemote(httpServer, deps) {
  const { pairing, getCurrentSlide, getCurrentSchedule, getCurrentTheme,
          onRemoteEvent, broadcastChannel } = deps

  if (!httpServer) throw new Error('attachWsRemote: httpServer requerido')
  if (!pairing) throw new Error('attachWsRemote: pairing requerido')
  if (!broadcastChannel) throw new Error('attachWsRemote: broadcastChannel requerido')

  // noServer=true → manejamos el handshake nosotros desde el upgrade event.
  // handleProtocols → devolvemos el protocolo negociado para que el cliente no
  // cierre la conexión (ver comentario CRÍTICO arriba).
  const wss = new WebSocketServer({
    noServer: true,
    // El primer protocolo (siempre 'bearer.<token>') es el que aceptamos.
    // Si no llega ninguno, devolvemos false y el handshake falla.
    handleProtocols: (protocols /* Set<string> */) => {
      for (const p of protocols) {
        if (typeof p === 'string' && p.startsWith('bearer.')) return p
      }
      return false
    },
  })

  // ---- Upgrade listener compartido ----

  const onUpgrade = (req, socket, head) => {
    // Solo consumimos /ws/remote. Si la URL no coincide, no hacemos nada:
    // Socket.IO (o cualquier otro listener registrado) procesará el upgrade.
    // NO destruir el socket aquí — eso rompería el Socket.IO legacy.
    let pathname
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      return  // URL malformada, dejar pasar a otros listeners
    }
    if (pathname !== '/ws/remote') return

    // A partir de aquí, el path es nuestro: validamos y respondemos.
    const protocolHeader = req.headers['sec-websocket-protocol']
    if (!protocolHeader || typeof protocolHeader !== 'string') {
      send401(socket)
      return
    }

    // El header puede traer múltiples protocolos separados por coma.
    // Buscamos el que empieza por 'bearer.'.
    const protocols = protocolHeader.split(',').map(s => s.trim())
    const bearerProto = protocols.find(p => p.startsWith('bearer.'))
    if (!bearerProto) {
      send401(socket)
      return
    }

    const token = bearerProto.slice('bearer.'.length)
    const result = pairing.validateToken(token)
    if (!result.valid) {
      send401(socket)
      return
    }

    // Token válido → upgrade. Pasamos deviceInfo al handler 'connection'.
    const deviceInfo = {
      token,
      deviceId: result.deviceId,
      deviceName: result.deviceName,
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, deviceInfo)
    })
  }

  httpServer.on('upgrade', onUpgrade)

  // ---- Connection handler ----

  wss.on('connection', (ws, req, deviceInfo) => {
    // Estado inicial al conectar — un solo round-trip de eventos.
    sendEvent(ws, 'pgm-update', safeGetter(getCurrentSlide, { text: '', reference: '', type: 'blank' }))
    // pgm-update-theme: solo se envía en handshake inicial SI hay theme
    // cargado. El cliente NO debe esperarlo en cada connect — es opcional.
    const theme = safeGetter(getCurrentTheme, null)
    if (theme) sendEvent(ws, 'pgm-update-theme', theme)
    sendEvent(ws, 'schedule-update', safeGetter(getCurrentSchedule, []))
    sendEvent(ws, 'connection-state', { status: 'online' })

    // Suscripción al canal de broadcast: cualquier pushSlide / pushSchedule
    // del main process llega aquí y se reenvía al cliente.
    const offBroadcast = broadcastChannel.subscribe((type, payload) => {
      sendEvent(ws, type, payload)
    })

    // Heartbeat server-side: ping nativo WS cada 30s. Si en 35s no llega
    // pong → conexión zombie, cerramos. setInterval.unref para no
    // bloquear el cierre del proceso.
    let pongReceived = true
    const heartbeat = setInterval(() => {
      if (!pongReceived) {
        try { ws.terminate() } catch {}
        return
      }
      pongReceived = false
      try { ws.ping() } catch {}
    }, 30_000)
    if (heartbeat.unref) heartbeat.unref()
    ws.on('pong', () => { pongReceived = true })

    // ---- Mensajes cliente → server ----

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString('utf8'))
      } catch {
        return  // mensaje no-JSON, ignoramos silenciosamente
      }
      if (!msg || typeof msg.type !== 'string') return

      // Token revocado mid-session: si lo borraron desde /api/pair/:token,
      // cerramos con 4001 para que el cliente vuelva a pair screen.
      const v = pairing.validateToken(deviceInfo.token)
      if (!v.valid) {
        sendEvent(ws, 'auth-error', { reason: 'token_revocado' })
        try { ws.close(4001, 'token_revocado') } catch {}
        return
      }
      pairing.touchToken(deviceInfo.token)

      switch (msg.type) {
        case 'ping': {
          // Echo del ts del cliente para que pueda medir RTT.
          const ts = (msg.payload && typeof msg.payload.ts === 'number')
            ? msg.payload.ts
            : Date.now()
          sendEvent(ws, 'pong', { ts })
          break
        }
        case 'next':
        case 'prev':
        case 'blank':
        case 'black':
        case 'clear':
        case 'projection-close':
          safeCall(onRemoteEvent, msg.type)
          break
        case 'bible-ref':
        case 'song':
        case 'announce':
        case 'list-reorder':
          safeCall(onRemoteEvent, msg.type, msg.payload || {})
          break
        case 'bible-project-direct': {
          // T9: el móvil ya resolvió el versículo via /api/bible/search y
          // ahora pide proyectarlo SIN re-buscar. Validamos la shape mínima
          // antes de forward para evitar que un cliente comprometido
          // inyecte un slide gigante que bloquee el renderer.
          const p = msg.payload || {}
          const ref = typeof p.reference === 'string' ? p.reference : ''
          const text = typeof p.text === 'string' ? p.text : ''
          if (!ref || ref.length > 100 || !text || text.length > 5000) {
            sendEvent(ws, 'error', { code: 'invalid_payload', message: 'bible-project-direct shape' })
            break
          }
          safeCall(onRemoteEvent, msg.type, p)
          break
        }
        default:
          if (FORWARDABLE_COMMANDS.has(msg.type)) {
            safeCall(onRemoteEvent, msg.type, msg.payload || {})
          } else {
            console.warn(`[ws-remote] tipo de mensaje desconocido: ${msg.type}`)
          }
      }
    })

    ws.on('close', () => {
      try { offBroadcast() } catch {}
      clearInterval(heartbeat)
      // Log corto sin filtrar PII: omitimos deviceName (puede ser "iPhone
      // de Juan") y solo dejamos tokenTail + 8 chars de deviceId opaco.
      const tokenTail = deviceInfo.token ? deviceInfo.token.slice(-6) : '------'
      const idTail = deviceInfo.deviceId ? deviceInfo.deviceId.slice(0, 8) : '--------'
      console.log(`[ws-remote] device #${tokenTail} disconnected (${idTail})`)
    })

    ws.on('error', (err) => {
      console.warn('[ws-remote] socket error:', err?.message || err)
    })
  })

  // ---- Cierre ordenado ----

  function close() {
    httpServer.off('upgrade', onUpgrade)
    return new Promise((resolve) => {
      // Cerrar todas las conexiones abiertas antes del close del wss.
      for (const client of wss.clients) {
        try { client.terminate() } catch {}
      }
      wss.close(() => resolve())
    })
  }

  return { wss, close }
}

// ---------------- Helpers ----------------

function sendEvent(ws, type, payload) {
  if (!ws || ws.readyState !== ws.OPEN) return
  try {
    ws.send(JSON.stringify({ type, payload }))
  } catch (e) {
    console.warn('[ws-remote] send failed:', e?.message || e)
  }
}

function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return
  try { fn(...args) } catch (e) {
    console.error('[ws-remote] handler error:', e?.message || e)
  }
}

function safeGetter(fn, fallback) {
  if (typeof fn !== 'function') return fallback
  try {
    const v = fn()
    return v === undefined || v === null ? fallback : v
  } catch {
    return fallback
  }
}

module.exports = { attachWsRemote }
