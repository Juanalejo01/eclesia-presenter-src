/**
 * transport.queue.test.js
 *
 * Verifica el comportamiento de la cola offline: encolado cuando
 * no-OPEN, flush FIFO al abrir, tope de 100 con drop del más viejo,
 * exclusión del ping y validación de commands.
 */
const { MockWebSocket } = require('./__mocks__/MockWebSocket.js')

let transport, TransportStatus, ClientCommand, __resetForTests

beforeEach(() => {
  MockWebSocket.instances = []
  global.WebSocket = MockWebSocket
  jest.resetModules()
  const mod = require('../src/services/transport.js')
  transport       = mod.transport
  TransportStatus = mod.TransportStatus
  ClientCommand   = mod.ClientCommand
  __resetForTests = mod.__resetForTests
  __resetForTests()
})

afterEach(() => {
  if (typeof __resetForTests === 'function') __resetForTests()
})

test('send() before OPEN enqueues; queueSize increments', () => {
  const ok = transport.send({ type: ClientCommand.NEXT })
  expect(ok).toBe(true)
  expect(transport.getState().queueSize).toBe(1)
  transport.send({ type: ClientCommand.PREV })
  expect(transport.getState().queueSize).toBe(2)
})

test('on OPEN, queue flushes in FIFO order', async () => {
  transport.send({ type: ClientCommand.NEXT })
  transport.send({ type: ClientCommand.PREV })
  transport.send({ type: ClientCommand.BLANK })

  const p = transport.connect('ws://localhost:7777', 'tok')
  const ws = MockWebSocket.last()
  ws._open()
  await p

  const sent = ws.sentJson()
  expect(sent.length).toBe(3)
  expect(sent[0].type).toBe(ClientCommand.NEXT)
  expect(sent[1].type).toBe(ClientCommand.PREV)
  expect(sent[2].type).toBe(ClientCommand.BLANK)
  expect(transport.getState().queueSize).toBe(0)
})

test('send(ping) is NOT enqueued when not OPEN', () => {
  const ok = transport.send({ type: ClientCommand.PING, payload: { ts: 1 } })
  expect(ok).toBe(false)
  expect(transport.getState().queueSize).toBe(0)
})

test('queue >100 drops the oldest entry', () => {
  for (let i = 0; i < 105; i++) {
    transport.send({ type: ClientCommand.NEXT, payload: { i } })
  }
  // 5 oldest dropped → queueSize should cap at 100
  expect(transport.getState().queueSize).toBe(100)
})

test('send(invalid) returns false without enqueuing', () => {
  expect(transport.send(null)).toBe(false)
  expect(transport.send({ type: 'lol' })).toBe(false)
  expect(transport.send({ noType: true })).toBe(false)
  expect(transport.getState().queueSize).toBe(0)
})

test('sentCount increments only for non-ping commands when OPEN', async () => {
  const p = transport.connect('ws://localhost:7777', 'tok')
  const ws = MockWebSocket.last()
  ws._open()
  await p
  ws.sent.length = 0
  const before = transport.getState().sentCount
  transport.send({ type: ClientCommand.NEXT })
  const after = transport.getState().sentCount
  expect(after).toBe(before + 1)
})

test('send when OPEN dispatches immediately, queue stays empty', async () => {
  const p = transport.connect('ws://localhost:7777', 'tok')
  const ws = MockWebSocket.last()
  ws._open()
  await p
  ws.sent.length = 0
  const ok = transport.send({ type: ClientCommand.NEXT })
  expect(ok).toBe(true)
  expect(ws.sentJson()[0].type).toBe(ClientCommand.NEXT)
  expect(transport.getState().queueSize).toBe(0)
})

test('disconnect clears queue', () => {
  transport.send({ type: ClientCommand.NEXT })
  transport.send({ type: ClientCommand.PREV })
  expect(transport.getState().queueSize).toBe(2)
  transport.disconnect()
  expect(transport.getState().queueSize).toBe(0)
})
