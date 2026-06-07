/**
 * transport.state.test.js
 *
 * Verifica las transiciones de la máquina de estados del transport y
 * el patrón observer (subscribeState, AUTH_ERROR emit).
 *
 * @capacitor/preferences se redirige al mock via package.json
 * moduleNameMapper, así que no hace falta jest.mock() inline.
 */
const { MockWebSocket } = require('./__mocks__/MockWebSocket.js')

let transport, TransportStatus, ServerEvent, __resetForTests

beforeEach(() => {
  MockWebSocket.instances = []
  global.WebSocket = MockWebSocket
  jest.resetModules()
  const mod = require('../src/services/transport.js')
  transport       = mod.transport
  TransportStatus = mod.TransportStatus
  ServerEvent     = mod.ServerEvent
  __resetForTests = mod.__resetForTests
  __resetForTests()
})

afterEach(() => {
  if (typeof __resetForTests === 'function') __resetForTests()
  jest.useRealTimers()
})

test('initial state is IDLE', () => {
  const s = transport.getState()
  expect(s.status).toBe(TransportStatus.IDLE)
  expect(s.queueSize).toBe(0)
  expect(s.latencyMs).toBeNull()
})

test('connect() goes CONNECTING then OPEN on onopen', async () => {
  const p = transport.connect('ws://localhost:7777', 'tok')
  expect(transport.getState().status).toBe(TransportStatus.CONNECTING)
  const ws = MockWebSocket.last()
  expect(ws).toBeTruthy()
  ws._open()
  await p
  expect(transport.getState().status).toBe(TransportStatus.OPEN)
})

test('connect() schedules reconnect when socket closes abnormally', async () => {
  const p = transport.connect('ws://localhost:7777', 'tok').catch(() => {})
  const ws = MockWebSocket.last()
  ws._open()
  await p
  expect(transport.getState().status).toBe(TransportStatus.OPEN)
  // Simular caída de red: close con código no-normal
  ws._close(1006, 'lost')
  expect(transport.getState().status).toBe(TransportStatus.RECONNECTING)
})

test('disconnect() from OPEN goes CLOSED', async () => {
  const p = transport.connect('ws://localhost:7777', 'tok')
  MockWebSocket.last()._open()
  await p
  transport.disconnect()
  expect(transport.getState().status).toBe(TransportStatus.CLOSED)
})

test('onclose(4001) goes ERROR and emits AUTH_ERROR event', async () => {
  const p = transport.connect('ws://localhost:7777', 'tok').catch(() => {})
  const ws = MockWebSocket.last()
  ws._open()
  await p
  const handler = jest.fn()
  transport.subscribe(ServerEvent.AUTH_ERROR, handler)
  ws._close(4001, 'unauthorized')
  expect(transport.getState().status).toBe(TransportStatus.ERROR)
  expect(handler).toHaveBeenCalledTimes(1)
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ code: 4001 }))
})

test('subscribeState(cb) receives snapshot on every change', async () => {
  const snapshots = []
  const unsub = transport.subscribeState((s) => snapshots.push(s.status))
  const p = transport.connect('ws://localhost:7777', 'tok')
  MockWebSocket.last()._open()
  await p
  unsub()
  expect(snapshots).toContain(TransportStatus.CONNECTING)
  expect(snapshots).toContain(TransportStatus.OPEN)
})

test('subscribeState unsubscribe is idempotent', () => {
  const cb = jest.fn()
  const unsub = transport.subscribeState(cb)
  unsub()
  unsub()
  // si no lanza, pass
  expect(true).toBe(true)
})

test('connect(B) supersedes connect(A) when called in a row', async () => {
  const pA = transport.connect('ws://a:7777', 'tA').catch(() => {})
  const wsA = MockWebSocket.last()
  const pB = transport.connect('ws://b:7777', 'tB')
  const wsB = MockWebSocket.last()
  expect(wsA).not.toBe(wsB)
  // Disparar open en wsA NO debe afectar (es generación vieja)
  wsA._open()
  wsB._open()
  await pB
  await pA
  expect(transport.getState().status).toBe(TransportStatus.OPEN)
  expect(transport.getState().url).toBe('ws://b:7777')
})

test('state subscriber throwing does not crash the dispatcher', async () => {
  const bad = jest.fn(() => { throw new Error('boom') })
  const good = jest.fn()
  transport.subscribeState(bad)
  transport.subscribeState(good)
  const p = transport.connect('ws://localhost:7777', 'tok')
  MockWebSocket.last()._open()
  await p
  expect(bad).toHaveBeenCalled()
  expect(good).toHaveBeenCalled()
})

test('invalid URL rejects connect()', async () => {
  await expect(transport.connect('http://nope', 'tok')).rejects.toThrow(/invalid url/)
})

test('invalid token rejects connect()', async () => {
  await expect(transport.connect('ws://localhost:7777', '')).rejects.toThrow(/invalid token/)
})
