/**
 * pairing.sameOrigin.test.js
 *
 * T12: el guard same-origin de pairWithDesktop (código puerto_dev_server)
 * se RELAJA cuando la app se sirve desde el propio desktop server
 * (isServedFromDesktop: puerto canónico 3434 o pathname /app) — parear
 * contra window.location.origin es exactamente el flujo del QR de
 * Transmisión. El caso Vite :5173 debe seguir bloqueado (regresión).
 *
 * Patrón de mocks alineado con pairing.test.js (skipProbe para aislar el
 * POST; @capacitor/preferences mockeado via moduleNameMapper).
 */

let pairWithDesktop, PairingError

beforeEach(() => {
  jest.resetModules()
  const mod = require('../src/services/pairing.js')
  pairWithDesktop = mod.pairWithDesktop
  PairingError = mod.PairingError
})

afterEach(() => {
  delete global.fetch
  delete globalThis.window
})

function setWindowLocation({ host, port, pathname = '/', protocol = 'http:' }) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: {
        host,
        port,
        pathname,
        protocol,
        origin: `${protocol}//${host}`,
      },
    },
  })
}

function mockPairOk() {
  global.fetch = jest.fn(() => Promise.resolve({
    status: 200,
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({
      ok: true,
      token: 'tok-123',
      serverInfo: { wsUrl: 'ws://192.168.1.10:3434/ws/remote', version: '0.2.17' },
    }),
  }))
}

test('pairWithDesktop NO lanza puerto_dev_server servido desde /app same-origin (:3434)', async () => {
  setWindowLocation({ host: '192.168.1.10:3434', port: '3434', pathname: '/app/' })
  mockPairOk()

  const result = await pairWithDesktop({
    url: 'http://192.168.1.10:3434',
    pin: '123456',
    skipProbe: true,
  })

  expect(result.token).toBe('tok-123')
  expect(result.wsUrl).toBe('ws://192.168.1.10:3434/ws/remote')
  // El POST /api/pair sí se ejecutó (el guard no abortó).
  expect(global.fetch).toHaveBeenCalledWith(
    'http://192.168.1.10:3434/api/pair',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('pairWithDesktop SIGUE lanzando puerto_dev_server desde Vite :5173 (regresión)', async () => {
  setWindowLocation({ host: '192.168.1.10:5173', port: '5173', pathname: '/' })
  global.fetch = jest.fn()

  await expect(
    pairWithDesktop({ url: 'http://192.168.1.10:5173', pin: '123456', skipProbe: true }),
  ).rejects.toMatchObject({ code: 'puerto_dev_server' })

  // El guard aborta ANTES de cualquier fetch.
  expect(global.fetch).not.toHaveBeenCalled()
})
