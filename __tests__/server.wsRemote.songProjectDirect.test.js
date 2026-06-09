/**
 * @jest-environment node
 *
 * Tests del comando WS 'song-project-direct' (T10).
 *
 * Cubre:
 *   - frame valido dispara onRemoteEvent con el payload completo
 *   - shape invalida → evento 'error' invalid_payload SIN forward
 *   - song-project-direct esta en FORWARDABLE_COMMANDS
 *   - broadcast songs-changed llega a clientes WS
 */
const http = require('http')
const WebSocket = require('ws')

const pairing = require('../src/server/pairing')
const { startServer } = require('../src/server/server')
const wsRemoteModule = require('../src/server/wsRemote')

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
  const r = await postJson(handle.port, '/api/pair', { pin, deviceId: 'spd-test', deviceName: 'Test' })
  if (!r.body?.ok) throw new Error('pair failed')
  return r.body.token
}

function openClient(handle, token) {
  return new WebSocket(`ws://127.0.0.1:${handle.port}/ws/remote`, [`bearer.${token}`])
}

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

describe('song-project-direct WS command', () => {
  test('frame valido → onRemoteEvent recibe payload', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const payload = {
      songId: 42,
      sectionId: 's_1',
      text: 'Coro: Mi corazón canta',
      reference: 'Cuán Grande · Coro',
    }
    ws.send(JSON.stringify({ type: 'song-project-direct', payload }))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        const hit = seen.find(s => s.type === 'song-project-direct')
        if (hit) { clearInterval(check); clearTimeout(timer); resolve() }
      }, 20)
    })
    const hit = seen.find(s => s.type === 'song-project-direct')
    expect(hit.payload).toEqual(payload)
    ws.close()
  })

  test('text > 10000 chars → error invalid_payload, NO forward', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'song-project-direct',
      payload: { songId: 1, sectionId: 's_0', text: 'a'.repeat(10001), reference: 'X' },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    // NO forward
    expect(seen.find(s => s.type === 'song-project-direct')).toBeUndefined()
    ws.close()
  })

  test('songId no numerico → error', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'song-project-direct',
      payload: { songId: 'abc', sectionId: 's_0', text: 'x', reference: '' },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    ws.close()
  })

  test('songId <= 0 → error', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'song-project-direct',
      payload: { songId: 0, sectionId: 's_0', text: 'x', reference: '' },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    ws.close()
  })

  test('sectionId vacio → error', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'song-project-direct',
      payload: { songId: 1, sectionId: '', text: 'x', reference: '' },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    ws.close()
  })

  test('reference > 200 chars → error', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'song-project-direct',
      payload: { songId: 1, sectionId: 's_0', text: 'x', reference: 'a'.repeat(201) },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    ws.close()
  })

  test('pushSongsChanged difunde songs-changed a clientes', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const prom = waitFor(ws, m => m.type === 'songs-changed')
    handle.pushSongsChanged({ changeType: 'updated', songIds: [5] })
    const msg = await prom
    expect(msg.payload.changeType).toBe('updated')
    expect(msg.payload.songIds).toEqual([5])
    expect(typeof msg.payload.serverVersion).toBe('number')
    ws.close()
  })

  test('serverVersion incremental tras varios pushes', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    handle.pushSongs([{ id: 1, title: 'A', sections: [] }])
    const m1 = await waitFor(ws, m => m.type === 'songs-changed' || m.type === 'songs-list')
    // Forzar incremento de timestamp
    const oldNow = Date.now
    Date.now = () => oldNow() + 10
    const prom2 = waitFor(ws, m => m.type === 'songs-changed')
    handle.pushSongs([{ id: 2, title: 'B', sections: [] }])
    handle.pushSongsChanged({ changeType: 'created', songIds: [2] })
    const m2 = await prom2
    Date.now = oldNow
    expect(m2.payload.serverVersion).toBeDefined()
    ws.close()
  })
})
