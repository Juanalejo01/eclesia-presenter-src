/**
 * @jest-environment node
 *
 * Tests del comando WS 'projection-close' (T11).
 *
 * El comando es payload-less: el server no lee msg.payload. Validamos:
 *  - forward limpio sin payload
 *  - payload extra ignorado
 *  - no emite error con payload corrupto
 *  - llamadas consecutivas no acumulan estado raro
 */
const http = require('http')
const WebSocket = require('ws')

const pairing = require('../src/server/pairing')
const { startServer } = require('../src/server/server')

function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length },
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, body: json })
      })
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}

async function obtainToken(handle) {
  const pin = handle.getPairingPin()
  const r = await postJson(handle.port, '/api/pair', { pin, deviceId: 'pclose-test', deviceName: 'Test' })
  if (!r.body?.ok) throw new Error('pair failed')
  return r.body.token
}

function openClient(handle, token) {
  return new WebSocket(`ws://127.0.0.1:${handle.port}/ws/remote`, [`bearer.${token}`])
}

let handle
beforeEach(async () => {
  pairing.__resetForTests()
  pairing.__setPinForTests('123456')
  handle = startServer({ port: 0 })
  await new Promise(resolve => {
    if (handle.httpServer.listening) return resolve()
    handle.httpServer.once('listening', () => resolve())
  })
})
afterEach(async () => {
  if (handle) await handle.close()
  handle = null
})

describe('projection-close WS command', () => {
  test('mensaje sin payload → forward limpio a onRemoteEvent', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    ws.send(JSON.stringify({ type: 'projection-close' }))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        const hit = seen.find(s => s.type === 'projection-close')
        if (hit) { clearInterval(check); clearTimeout(timer); resolve() }
      }, 20)
    })
    const hit = seen.find(s => s.type === 'projection-close')
    expect(hit).toBeDefined()
    // El server NO pasa payload (case junto a next/prev/etc en wsRemote.js).
    // safeCall(onRemoteEvent, msg.type) sin segundo argumento → payload undefined.
    expect(hit.payload).toBeUndefined()
    ws.close()
  })

  test('mensaje con payload extra → forward limpio (server ignora payload)', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    ws.send(JSON.stringify({ type: 'projection-close', payload: { foo: 'bar', big: 'a'.repeat(1000) } }))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        const hit = seen.find(s => s.type === 'projection-close')
        if (hit) { clearInterval(check); clearTimeout(timer); resolve() }
      }, 20)
    })
    const hit = seen.find(s => s.type === 'projection-close')
    expect(hit).toBeDefined()
    // El payload no se pasa al forward — defensa contra payloads enormes.
    expect(hit.payload).toBeUndefined()
    ws.close()
  })

  test('NO emite evento error con payload corrupto', async () => {
    const seenErrors = []
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'))
        if (msg.type === 'error') seenErrors.push(msg)
      } catch {}
    })
    // Payload null y array — el case proyection-close no los toca.
    ws.send(JSON.stringify({ type: 'projection-close', payload: null }))
    ws.send(JSON.stringify({ type: 'projection-close', payload: [] }))
    // Esperar a que el server procese
    await new Promise(r => setTimeout(r, 200))
    expect(seenErrors).toHaveLength(0)
    ws.close()
  })

  test('llamadas consecutivas no acumulan estado — todas se forwardean', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    for (let i = 0; i < 3; i++) {
      ws.send(JSON.stringify({ type: 'projection-close' }))
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        if (seen.filter(s => s.type === 'projection-close').length >= 3) {
          clearInterval(check); clearTimeout(timer); resolve()
        }
      }, 20)
    })
    expect(seen.filter(s => s.type === 'projection-close')).toHaveLength(3)
    ws.close()
  })
})
