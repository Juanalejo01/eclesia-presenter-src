/**
 * pairing.test.js
 *
 * Cubre la taxonomía de errores del wrapper `pairWithDesktop()`:
 *   1. URL sin scheme → 'no_alcanzable' antes de tocar fetch
 *   2. PIN no-6-digits → 'pin_incorrecto' antes de fetch
 *   3. Server 401      → 'pin_incorrecto'
 *   4. Server 429      → 'demasiados_intentos' con retryAfterMs
 *   5. Server 200 OK   → resuelve { token, wsUrl, serverVersion }
 *   6. fetch throws    → 'no_alcanzable'
 *   7. Server 200 sin token → 'respuesta_invalida'
 *
 * @capacitor/preferences se redirige al mock via package.json
 * moduleNameMapper, así que getDeviceId() funciona sin Capacitor.
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
})

function mockFetchOnce(response) {
  global.fetch = jest.fn(() => Promise.resolve(response))
}

function makeRes({ status = 200, json = {}, jsonThrows = false } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jsonThrows
      ? () => Promise.reject(new Error('not json'))
      : () => Promise.resolve(json),
  }
}

test('1. URL inválida → PairingError(no_alcanzable) antes de fetch', async () => {
  const spy = jest.fn()
  global.fetch = spy
  await expect(
    pairWithDesktop({ url: 'nope', pin: '123456' }),
  ).rejects.toMatchObject({
    name: 'PairingError',
    code: 'no_alcanzable',
  })
  expect(spy).not.toHaveBeenCalled()
})

test('2. PIN no-6-digits → PairingError(pin_incorrecto) antes de fetch', async () => {
  const spy = jest.fn()
  global.fetch = spy
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '12345' }),
  ).rejects.toMatchObject({
    code: 'pin_incorrecto',
  })
  expect(spy).not.toHaveBeenCalled()

  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: 'abcdef' }),
  ).rejects.toMatchObject({ code: 'pin_incorrecto' })
})

test('3. Server 401 → PairingError(pin_incorrecto)', async () => {
  mockFetchOnce(
    makeRes({ status: 401, json: { ok: false, error: 'pin_incorrecto' } }),
  )
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({ code: 'pin_incorrecto' })
})

test('4. Server 429 → PairingError(demasiados_intentos) con retryAfterMs', async () => {
  mockFetchOnce(
    makeRes({
      status: 429,
      json: {
        ok: false,
        error: 'demasiados_intentos',
        retryAfterMs: 45_000,
      },
    }),
  )
  try {
    await pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' })
    throw new Error('should have thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(PairingError)
    expect(e.code).toBe('demasiados_intentos')
    expect(e.extra).toEqual({ retryAfterMs: 45_000 })
  }
})

test('4b. 429 sin retryAfterMs cae al default 60s', async () => {
  mockFetchOnce(
    makeRes({ status: 429, json: { ok: false, error: 'rate-limit' } }),
  )
  try {
    await pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' })
  } catch (e) {
    expect(e.extra.retryAfterMs).toBe(60_000)
  }
})

test('5. Server 200 OK → retorna { token, wsUrl, serverVersion }', async () => {
  mockFetchOnce(
    makeRes({
      status: 200,
      json: {
        ok: true,
        token: 'abc.def.ghi',
        serverInfo: {
          version: '0.2.12',
          wsUrl: 'ws://192.168.1.5:7777',
        },
      },
    }),
  )
  const out = await pairWithDesktop({
    url: 'http://192.168.1.5:3434',
    pin: '123456',
  })
  expect(out).toEqual({
    token: 'abc.def.ghi',
    wsUrl: 'ws://192.168.1.5:7777',
    serverVersion: '0.2.12',
  })

  // El fetch debe haberse llamado con body que incluye pin y deviceId
  expect(global.fetch).toHaveBeenCalledWith(
    'http://192.168.1.5:3434/api/pair',
    expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }),
  )
  const callArgs = global.fetch.mock.calls[0][1]
  const sentBody = JSON.parse(callArgs.body)
  expect(sentBody.pin).toBe('123456')
  expect(typeof sentBody.deviceId).toBe('string')
  expect(sentBody.deviceId.length).toBeGreaterThan(0)
  expect(typeof sentBody.deviceName).toBe('string')
})

test('5b. Trailing slash en URL se normaliza', async () => {
  mockFetchOnce(
    makeRes({
      status: 200,
      json: {
        ok: true,
        token: 't',
        serverInfo: { version: '1', wsUrl: 'ws://x' },
      },
    }),
  )
  await pairWithDesktop({
    url: 'http://192.168.1.5:3434///',
    pin: '123456',
  })
  expect(global.fetch.mock.calls[0][0]).toBe(
    'http://192.168.1.5:3434/api/pair',
  )
})

test('6. fetch throws → PairingError(no_alcanzable)', async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')))
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({
    code: 'no_alcanzable',
  })
})

test('7. Server 200 sin token → PairingError(respuesta_invalida)', async () => {
  mockFetchOnce(
    makeRes({
      status: 200,
      json: { ok: true, serverInfo: { wsUrl: 'ws://x' } },
    }),
  )
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({ code: 'respuesta_invalida' })
})

test('7b. Server 200 con token pero sin wsUrl → respuesta_invalida', async () => {
  mockFetchOnce(
    makeRes({ status: 200, json: { ok: true, token: 'x', serverInfo: {} } }),
  )
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({ code: 'respuesta_invalida' })
})

test('7c. Respuesta no-JSON → respuesta_invalida', async () => {
  mockFetchOnce(makeRes({ status: 200, jsonThrows: true }))
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({ code: 'respuesta_invalida' })
})

test('8. Status 500 con json → PairingError(unknown)', async () => {
  mockFetchOnce(
    makeRes({ status: 500, json: { ok: false, error: 'boom' } }),
  )
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({ code: 'unknown' })
})

test('9. fetch AbortError (timeout 10s) → PairingError(no_alcanzable)', async () => {
  // Simulamos lo que el browser lanza cuando AbortController.abort() dispara
  // mientras un fetch está pendiente: una DOMException con name='AbortError'.
  global.fetch = jest.fn(() => {
    const err = new Error('The operation was aborted.')
    err.name = 'AbortError'
    return Promise.reject(err)
  })
  await expect(
    pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
  ).rejects.toMatchObject({
    code: 'no_alcanzable',
    message: expect.stringMatching(/demasiado en responder/i),
  })
})

test('9b. fetch recibe AbortSignal (verifica wiring del timeout)', async () => {
  // Garantía estructural: el fetch DEBE recibir un `signal` para que el
  // timeout pueda cancelarlo. Si alguien borra el wiring por accidente,
  // este test falla.
  mockFetchOnce(
    makeRes({
      status: 200,
      json: {
        ok: true,
        token: 't',
        serverInfo: { version: '1', wsUrl: 'ws://x' },
      },
    }),
  )
  await pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' })
  const callArgs = global.fetch.mock.calls[0][1]
  expect(callArgs.signal).toBeDefined()
  expect(typeof callArgs.signal.aborted).toBe('boolean')
})
