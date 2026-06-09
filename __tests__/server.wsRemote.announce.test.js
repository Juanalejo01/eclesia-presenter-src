/**
 * @jest-environment node
 *
 * Tests del comando WS 'announce' (T11).
 *
 * Cubre:
 *  - payload valido → onRemoteEvent recibe { title, body, durationMs:null }
 *  - title vacio / >80 → error invalid_payload, NO forward
 *  - body vacio / >500 → error invalid_payload, NO forward
 *  - durationMs invalido → error
 *  - durationMs valido → forward con durationMs preservado
 *  - payload no-objeto → error (defensa)
 *  - announce esta en FORWARDABLE_COMMANDS / case dedicado
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
  const r = await postJson(handle.port, '/api/pair', { pin, deviceId: 'ann-test', deviceName: 'Test' })
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

describe('announce WS command', () => {
  test('payload valido sin durationMs → onRemoteEvent recibe payload trimmed', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    ws.send(JSON.stringify({
      type: 'announce',
      payload: { title: '  AVISO  ', body: '  Hola mundo  ' },
    }))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        const hit = seen.find(s => s.type === 'announce')
        if (hit) { clearInterval(check); clearTimeout(timer); resolve() }
      }, 20)
    })
    const hit = seen.find(s => s.type === 'announce')
    expect(hit.payload).toEqual({ title: 'AVISO', body: 'Hola mundo', durationMs: null })
    ws.close()
  })

  test('payload valido con durationMs → preserva durationMs', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    ws.send(JSON.stringify({
      type: 'announce',
      payload: { title: 'Aviso', body: 'Hola', durationMs: 5000 },
    }))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1500)
      const check = setInterval(() => {
        const hit = seen.find(s => s.type === 'announce')
        if (hit) { clearInterval(check); clearTimeout(timer); resolve() }
      }, 20)
    })
    const hit = seen.find(s => s.type === 'announce')
    expect(hit.payload).toEqual({ title: 'Aviso', body: 'Hola', durationMs: 5000 })
    ws.close()
  })

  test('title vacio → error invalid_payload, NO forward', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({ type: 'announce', payload: { title: '', body: 'Hola' } }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    expect(seen.find(s => s.type === 'announce')).toBeUndefined()
    ws.close()
  })

  test('title > 80 chars → error', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'announce',
      payload: { title: 'a'.repeat(81), body: 'Hola' },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    expect(seen.find(s => s.type === 'announce')).toBeUndefined()
    ws.close()
  })

  test('body vacio → error', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({ type: 'announce', payload: { title: 'Aviso', body: '   ' } }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    expect(seen.find(s => s.type === 'announce')).toBeUndefined()
    ws.close()
  })

  test('body > 500 chars → error', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'announce',
      payload: { title: 'Aviso', body: 'a'.repeat(501) },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    expect(seen.find(s => s.type === 'announce')).toBeUndefined()
    ws.close()
  })

  test('durationMs > 60000 → error', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'announce',
      payload: { title: 'Aviso', body: 'Hola', durationMs: 70000 },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    ws.close()
  })

  test('durationMs < 1000 → error', async () => {
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({
      type: 'announce',
      payload: { title: 'Aviso', body: 'Hola', durationMs: 500 },
    }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    ws.close()
  })

  test('payload no-objeto (null) → error sin throw', async () => {
    const seen = []
    handle.onRemoteEvent((type, payload) => seen.push({ type, payload }))
    const token = await obtainToken(handle)
    const ws = openClient(handle, token)
    await new Promise((r) => ws.once('open', r))
    await new Promise(r => setTimeout(r, 50))
    const errProm = waitFor(ws, m => m.type === 'error')
    ws.send(JSON.stringify({ type: 'announce', payload: null }))
    const err = await errProm
    expect(err.payload?.code).toBe('invalid_payload')
    expect(seen.find(s => s.type === 'announce')).toBeUndefined()
    ws.close()
  })
})
