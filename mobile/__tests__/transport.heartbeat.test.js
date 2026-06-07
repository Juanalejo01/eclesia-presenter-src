/**
 * transport.heartbeat.test.js
 *
 * Cubre el heartbeat ping/pong:
 *   - Se envía un ping cada HEARTBEAT_INTERVAL_MS tras alcanzar OPEN.
 *   - Si el server no responde en PONG_TIMEOUT_MS, el socket se cierra
 *     con código 4000 y el transport pasa a RECONNECTING / CONNECTING.
 *   - Un pong con `ts` válido actualiza latencyMs en el snapshot.
 *
 * Usa timers falsos para no esperar 25 s reales. El mock de
 * `@capacitor/preferences` viene vía moduleNameMapper del package.json.
 */
const { MockWebSocket } = require('./__mocks__/MockWebSocket.js')

let transport, TransportStatus, ClientCommand, ServerEvent, __resetForTests

beforeEach(() => {
  MockWebSocket.instances = []
  global.WebSocket = MockWebSocket
  jest.useFakeTimers()
  jest.resetModules()
  const mod = require('../src/services/transport.js')
  transport       = mod.transport
  TransportStatus = mod.TransportStatus
  ClientCommand   = mod.ClientCommand
  ServerEvent     = mod.ServerEvent
  __resetForTests = mod.__resetForTests
  __resetForTests()
})

afterEach(() => {
  if (typeof __resetForTests === 'function') __resetForTests()
  jest.useRealTimers()
})

test('sends ping every 25s after OPEN', async () => {
  const p = transport.connect('ws://lan:7777', 'tok')
  MockWebSocket.last()._open()
  await p

  // Avanzar 25 s — debe enviarse el primer ping
  jest.advanceTimersByTime(25_000)
  const sent = MockWebSocket.last().sentJson()
  const pings = sent.filter((m) => m && m.type === ClientCommand.PING)
  expect(pings.length).toBeGreaterThanOrEqual(1)
  expect(typeof pings[0].payload.ts).toBe('number')
  expect(pings[0].payload.ts).toBeGreaterThan(0)
})

test('triggers reconnect if no pong within 10s', async () => {
  const p = transport.connect('ws://lan:7777', 'tok')
  MockWebSocket.last()._open()
  await p
  expect(transport.getState().status).toBe(TransportStatus.OPEN)

  // 25 s → se envía el ping
  jest.advanceTimersByTime(25_000)
  // 10.5 s más sin respuesta → el pong-timer cierra el socket con 4000
  jest.advanceTimersByTime(10_500)

  // Tras el close(4000) entramos en RECONNECTING; el timer de backoff
  // (≥1 s) aún no expiró, así que no debería haber pasado a CONNECTING.
  expect([
    TransportStatus.RECONNECTING,
    TransportStatus.CONNECTING,
  ]).toContain(transport.getState().status)
})

test('pong updates latencyMs', async () => {
  const p = transport.connect('ws://lan:7777', 'tok')
  MockWebSocket.last()._open()
  await p

  jest.advanceTimersByTime(25_000)
  const ws = MockWebSocket.last()
  const ping = ws.sentJson().find((m) => m && m.type === ClientCommand.PING)
  expect(ping).toBeDefined()

  // Simular pong con 42 ms de latencia: el server "responde" con el
  // mismo ts del ping, y nosotros mockeamos Date.now al momento de
  // recibirlo (ping.ts + 42).
  const realNow = Date.now
  Date.now = () => ping.payload.ts + 42
  ws._message({ type: ServerEvent.PONG, payload: { ts: ping.payload.ts } })
  Date.now = realNow

  expect(transport.getState().latencyMs).toBe(42)
})

test('server message with unknown type is ignored silently', async () => {
  const p = transport.connect('ws://lan:7777', 'tok')
  MockWebSocket.last()._open()
  await p
  const before = transport.getState().recvCount
  // No subscribers para 'mystery-type' — debe pasar sin crash y bumpear recvCount.
  MockWebSocket.last()._message({ type: 'mystery-type', payload: {} })
  expect(transport.getState().recvCount).toBe(before + 1)
})

test('invalid JSON from server is ignored', async () => {
  const p = transport.connect('ws://lan:7777', 'tok')
  MockWebSocket.last()._open()
  await p
  const before = transport.getState().recvCount
  // Mandamos texto inválido; el parse falla y no incrementa recvCount.
  MockWebSocket.last()._message('{not json')
  expect(transport.getState().recvCount).toBe(before)
})
