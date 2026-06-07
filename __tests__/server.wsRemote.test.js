/**
 * @jest-environment node
 */
// Tests del endpoint WebSocket raw /ws/remote.
//
// Estrategia:
//   - Arrancar el server real en puerto 0 (random) por cada test
//   - Hacer POST /api/pair para obtener un token válido
//   - Conectar con `ws` como cliente, validar protocolo
//   - Cerrar server al final
//
// Smoke test manual completo (no automatizable desde aquí):
//   const { startServer } = require('./src/server/server')
//   const handle = startServer()
//   // En otro proceso/REPL:
//   //   const res = await fetch('http://localhost:3434/api/pair', {
//   //     method: 'POST',
//   //     headers: { 'content-type': 'application/json' },
//   //     body: JSON.stringify({ pin: handle.getPairingPin(), deviceId: 'test', deviceName: 'Test' })
//   //   })
//   //   const { token } = await res.json()
//   //   const ws = new WebSocket(`ws://localhost:3434/ws/remote`, [`bearer.${token}`])
//   //   ws.on('open', () => ws.send(JSON.stringify({ type: 'ping', payload: { ts: 1 } })))
//   //   ws.on('message', (d) => console.log(JSON.parse(d)))

const http = require('http')
const WebSocket = require('ws')

const pairing = require('../src/server/pairing')
const { startServer } = require('../src/server/server')

// ---- Helpers ----

/** Hace POST JSON contra el server local. */
function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': data.length,
      },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, body: json, text })
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

/** Promesa que se resuelve con el primer mensaje recibido del WS de un tipo dado. */
function waitFor(ws, predicate, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMsg)
      reject(new Error('waitFor timeout'))
    }, timeout)
    function onMsg(raw) {
      let msg
      try { msg = JSON.parse(raw.toString('utf8')) } catch { return }
      if (predicate(msg)) {
        clearTimeout(timer)
        ws.removeListener('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
  })
}

function waitForClose(ws, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('close timeout')), timeout)
    ws.once('close', (code, reason) => {
      clearTimeout(timer)
      resolve({ code, reason: reason?.toString() || '' })
    })
    ws.once('unexpected-response', (_req, res) => {
      clearTimeout(timer)
      // ws emite esto cuando el server responde con !=101
      resolve({ code: res.statusCode || 0, reason: 'unexpected-response' })
    })
    ws.once('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 0, reason: err?.message || 'error' })
    })
  })
}

/** Pide un token válido haciendo POST /api/pair con el PIN del handle. */
async function obtainToken(handle, deviceId = 'test-device', deviceName = 'Test Device') {
  const pin = handle.getPairingPin()
  const res = await postJson(handle.port, '/api/pair', { pin, deviceId, deviceName })
  if (!res.body || !res.body.ok) {
    throw new Error('pair failed: ' + JSON.stringify(res))
  }
  return res.body.token
}

/** Abre un cliente WS con el protocolo bearer.<token>. */
function openClient(handle, token) {
  return new WebSocket(
    `ws://127.0.0.1:${handle.port}/ws/remote`,
    [`bearer.${token}`],
  )
}

// ---- Setup/teardown ----

let handle

beforeEach(async () => {
  pairing.__resetForTests()
  pairing.__setPinForTests('123456')
  handle = startServer({ port: 0 })
  // Esperar a que el server esté listening
  await new Promise((resolve) => {
    if (handle.httpServer.listening) return resolve()
    handle.httpServer.once('listening', () => resolve())
  })
})

afterEach(async () => {
  if (handle) await handle.close()
  handle = null
})

// ---- Tests ----

describe('POST /api/pair', () => {
  test('emite token cuando el PIN es correcto + acepta deviceId/Name', async () => {
    const res = await postJson(handle.port, '/api/pair', {
      pin: '123456',
      deviceId: 'phone-abc',
      deviceName: 'iPhone Juan',
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token.length).toBe(48)  // 24 bytes hex
    expect(res.body.serverInfo).toBeDefined()
    expect(res.body.serverInfo.wsUrl).toMatch(/^ws:\/\/.+\/ws\/remote$/)
    // Verificar que el dispositivo quedó registrado
    const devices = pairing.listDevices()
    const d = devices.find(x => x.token === res.body.token)
    expect(d).toBeDefined()
    expect(d.deviceId).toBe('phone-abc')
    expect(d.deviceName).toBe('iPhone Juan')
  })

  test('rechaza PIN incorrecto con 401', async () => {
    const res = await postJson(handle.port, '/api/pair', { pin: '000000' })
    expect(res.status).toBe(401)
    expect(res.body.ok).toBe(false)
  })
})

describe('WS raw /ws/remote — auth', () => {
  test('rechaza conexión sin Sec-WebSocket-Protocol header', async () => {
    // El truco: `new WebSocket(url)` SIN protocolos → no envía el header.
    // El server debe responder 401 → el cliente emite 'unexpected-response'.
    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws/remote`)
    const result = await waitForClose(ws)
    expect([401, 0, 1006]).toContain(result.code)  // 401 unexpected o close abrupt
  })

  test('rechaza conexión con token inválido', async () => {
    const ws = openClient(handle, 'token-que-no-existe-en-absoluto-1234')
    const result = await waitForClose(ws)
    expect([401, 0, 1006]).toContain(result.code)
  })

  test('acepta conexión con token válido y emite estado inicial', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    const got = []
    // CRÍTICO: registrar listener antes que ws.open puede sucederse — los
    // mensajes pueden llegar inmediatamente tras el handshake. ws bufferea
    // si no hay listener pero registramos aquí para estar seguros.
    ws.on('message', (raw) => {
      try { got.push(JSON.parse(raw.toString('utf8')).type) } catch {}
    })
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    // Esperar a recibir los 3 eventos esperados.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout esperando estado inicial: ' + got.join(','))), 1500)
      const check = setInterval(() => {
        if (got.includes('pgm-update') && got.includes('schedule-update')
            && got.includes('connection-state')) {
          clearInterval(check); clearTimeout(timer); resolve()
        }
      }, 20)
    })
    expect(got).toEqual(expect.arrayContaining([
      'pgm-update', 'schedule-update', 'connection-state',
    ]))
    ws.close()
  })
})

describe('WS raw /ws/remote — mensajes', () => {
  test('ping responde con pong reflejando el ts', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((resolve) => ws.once('open', resolve))
    // Esperamos que el ping sea procesado independientemente del estado inicial.
    ws.send(JSON.stringify({ type: 'ping', payload: { ts: 1234567 } }))
    const pong = await waitFor(ws, (m) => m.type === 'pong')
    expect(pong.payload).toEqual({ ts: 1234567 })
    ws.close()
  })

  test('reenvía next/prev/blank/black/clear a onRemoteEvent', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((resolve) => ws.once('open', resolve))
    // Pequeña espera para asegurar que el estado inicial está ya enviado.
    await new Promise(r => setTimeout(r, 50))
    for (const t of ['next', 'prev', 'blank', 'black', 'clear']) {
      ws.send(JSON.stringify({ type: t }))
    }
    // Esperamos a que lleguen los 5 callbacks
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout esperando callbacks')), 1500)
      const check = setInterval(() => {
        if (seen.length >= 5) {
          clearInterval(check); clearTimeout(timer); resolve()
        }
      }, 20)
    })
    const types = seen.map(s => s.type)
    expect(types).toEqual(expect.arrayContaining(['next', 'prev', 'blank', 'black', 'clear']))
    ws.close()
  })

  test('reenvía bible-ref con payload completo', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((resolve) => ws.once('open', resolve))
    await new Promise(r => setTimeout(r, 50))
    ws.send(JSON.stringify({ type: 'bible-ref', payload: { query: 'juan 3:16' } }))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        const hit = seen.find(s => s.type === 'bible-ref')
        if (hit) { clearInterval(check); clearTimeout(timer); resolve() }
      }, 20)
    })
    const hit = seen.find(s => s.type === 'bible-ref')
    expect(hit.payload).toEqual({ query: 'juan 3:16' })
    ws.close()
  })

  test('pushSlide difunde pgm-update a todos los clientes conectados', async () => {
    const tokenA = await obtainToken(handle, 'phone-a', 'Phone A')
    const tokenB = await obtainToken(handle, 'phone-b', 'Phone B')
    const wsA = openClient(handle, tokenA)
    const wsB = openClient(handle, tokenB)
    await Promise.all([
      new Promise((r) => wsA.once('open', r)),
      new Promise((r) => wsB.once('open', r)),
    ])
    // Consumir los estados iniciales (queremos el SEGUNDO pgm-update)
    await new Promise(r => setTimeout(r, 100))
    let receivedA = null, receivedB = null
    const promA = waitFor(wsA, (m) => {
      if (m.type === 'pgm-update' && m.payload?.text === 'Hola mundo') {
        receivedA = m; return true
      }
      return false
    })
    const promB = waitFor(wsB, (m) => {
      if (m.type === 'pgm-update' && m.payload?.text === 'Hola mundo') {
        receivedB = m; return true
      }
      return false
    })
    handle.pushSlide({ text: 'Hola mundo', reference: 'Test', type: 'text' })
    await Promise.all([promA, promB])
    expect(receivedA.payload.text).toBe('Hola mundo')
    expect(receivedB.payload.text).toBe('Hola mundo')
    wsA.close(); wsB.close()
  })

  test('cierra con 4001 si el token se revoca mid-session', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((resolve) => ws.once('open', resolve))
    await new Promise(r => setTimeout(r, 50))
    // Revocar el token desde fuera
    pairing.revokeToken(token)
    // Enviar un mensaje cualquiera para forzar la re-validación
    ws.send(JSON.stringify({ type: 'next' }))
    const closeResult = await waitForClose(ws, 2000)
    expect(closeResult.code).toBe(4001)
  })

  test('ignora silenciosamente JSON inválido y tipos desconocidos', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((resolve) => ws.once('open', resolve))
    await new Promise(r => setTimeout(r, 50))
    ws.send('esto no es json {{{')
    ws.send(JSON.stringify({ type: 'tipo-no-existente' }))
    ws.send(JSON.stringify({ type: 'next' }))  // este sí debe llegar
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        if (seen.find(s => s.type === 'next')) {
          clearInterval(check); clearTimeout(timer); resolve()
        }
      }, 20)
    })
    expect(seen.find(s => s.type === 'tipo-no-existente')).toBeUndefined()
    expect(seen.find(s => s.type === 'next')).toBeDefined()
    ws.close()
  })
})

describe('Socket.IO legacy sigue funcionando', () => {
  test('el endpoint /api/pair acepta body sin deviceId (compat)', async () => {
    const res = await postJson(handle.port, '/api/pair', { pin: '123456' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.token).toBe('string')
  })

  test('el WS raw NO interfiere con upgrades de Socket.IO', async () => {
    // Verificamos que el path /socket.io/... NO devuelve 401 (es decir,
    // el listener del WS raw no se está comiendo upgrades ajenos).
    // Hacemos un GET a /socket.io/?EIO=4&transport=polling que es el
    // handshake inicial de Socket.IO; debe responder con 200 + JSON.
    const data = await new Promise((resolve, reject) => {
      http.get({
        host: '127.0.0.1', port: handle.port,
        path: '/socket.io/?EIO=4&transport=polling',
      }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }))
      }).on('error', reject)
    })
    expect(data.status).toBe(200)
    // El payload empieza con una char que indica el tipo de paquete (0 = open)
    expect(data.body).toMatch(/^0\{/)
  })
})
