/**
 * pairing.test.js
 *
 * Cubre la taxonomía de errores del wrapper `pairWithDesktop()` y la
 * función auxiliar `checkServer()` añadida en el hardening T3.
 *
 * Los tests originales pasan `skipProbe: true` para aislar el POST
 * /api/pair del GET /api/info — eso simplifica los mocks y mantiene la
 * regresión sobre el comportamiento histórico. Los tests nuevos cubren
 * el probe end-to-end.
 *
 * @capacitor/preferences se redirige al mock via package.json
 * moduleNameMapper, así que getDeviceId() funciona sin Capacitor.
 */

let pairWithDesktop, checkServer, PairingError

beforeEach(() => {
  jest.resetModules()
  const mod = require('../src/services/pairing.js')
  pairWithDesktop = mod.pairWithDesktop
  checkServer = mod.checkServer
  PairingError = mod.PairingError
})

afterEach(() => {
  delete global.fetch
  // Limpia cualquier mock de window que algún test haya puesto.
  if (typeof globalThis.window !== 'undefined' && globalThis.__pairingTestWindow) {
    delete globalThis.window
    delete globalThis.__pairingTestWindow
  }
})

function mockFetchOnce(response) {
  global.fetch = jest.fn(() => Promise.resolve(response))
}

function makeRes({ status = 200, json = {}, jsonThrows = false, contentType = 'application/json' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null),
    },
    json: jsonThrows
      ? () => Promise.reject(new Error('not json'))
      : () => Promise.resolve(json),
  }
}

// Helper para los nuevos tests del probe: un GET ok + un POST con el body que se quiera.
function makeOkProbe() {
  return makeRes({
    status: 200,
    json: { ok: true, app: 'EclesiaPresenter', version: '1.2.3', protocol: 1 },
  })
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
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
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
    await pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    })
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
    await pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    })
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
    skipProbe: true,
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
    skipProbe: true,
  })
  expect(global.fetch.mock.calls[0][0]).toBe(
    'http://192.168.1.5:3434/api/pair',
  )
})

test('6. fetch throws → PairingError(no_alcanzable)', async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')))
  await expect(
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
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
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
  ).rejects.toMatchObject({ code: 'respuesta_invalida' })
})

test('7b. Server 200 con token pero sin wsUrl → respuesta_invalida', async () => {
  mockFetchOnce(
    makeRes({ status: 200, json: { ok: true, token: 'x', serverInfo: {} } }),
  )
  await expect(
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
  ).rejects.toMatchObject({ code: 'respuesta_invalida' })
})

test('7c. Respuesta no-JSON → respuesta_invalida', async () => {
  mockFetchOnce(makeRes({ status: 200, jsonThrows: true }))
  await expect(
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
  ).rejects.toMatchObject({ code: 'respuesta_invalida' })
})

test('8. Status 500 con json → PairingError(unknown)', async () => {
  mockFetchOnce(
    makeRes({ status: 500, json: { ok: false, error: 'boom' } }),
  )
  await expect(
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
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
    pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
      skipProbe: true,
    }),
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
  await pairWithDesktop({
    url: 'http://1.2.3.4:3434',
    pin: '123456',
    skipProbe: true,
  })
  const callArgs = global.fetch.mock.calls[0][1]
  expect(callArgs.signal).toBeDefined()
  expect(typeof callArgs.signal.aborted).toBe('boolean')
})

// ---------------------------------------------------------------------------
// T3 hardening: checkServer() y probe-before-pair
// ---------------------------------------------------------------------------

describe('checkServer()', () => {
  test('URL sin scheme → no_alcanzable, sin fetch', async () => {
    const spy = jest.fn()
    global.fetch = spy
    const r = await checkServer('nope')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('no_alcanzable')
    expect(spy).not.toHaveBeenCalled()
  })

  test('GET /api/info OK con app correcta → { ok: true, app, version, protocol }', async () => {
    mockFetchOnce(
      makeRes({
        status: 200,
        json: { ok: true, app: 'EclesiaPresenter', version: '9.9.9', protocol: 1 },
      }),
    )
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(true)
    expect(r.app).toBe('EclesiaPresenter')
    expect(r.version).toBe('9.9.9')
    expect(r.protocol).toBe(1)
    // Verifica que hizo GET a /api/info, no a /api/pair.
    expect(global.fetch).toHaveBeenCalledWith(
      'http://1.2.3.4:3434/api/info',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  test('respuesta HTML (Content-Type text/html) → puerto_incorrecto', async () => {
    mockFetchOnce(
      makeRes({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        json: {},
      }),
    )
    const r = await checkServer('http://1.2.3.4:5173')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('puerto_incorrecto')
  })

  test('JSON con app distinto → puerto_incorrecto', async () => {
    mockFetchOnce(
      makeRes({
        status: 200,
        json: { ok: true, app: 'OtraApp', version: '1' },
      }),
    )
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('puerto_incorrecto')
  })

  test('TypeError "Failed to fetch" → servidor_caido', async () => {
    global.fetch = jest.fn(() => {
      const e = new TypeError('Failed to fetch')
      return Promise.reject(e)
    })
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('servidor_caido')
  })

  test('ECONNREFUSED → servidor_caido', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('connect ECONNREFUSED 1.2.3.4:3434')))
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('servidor_caido')
  })

  test('AbortError tras timeout → no_alcanzable', async () => {
    global.fetch = jest.fn(() => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      return Promise.reject(err)
    })
    const r = await checkServer('http://1.2.3.4:3434', { timeoutMs: 10 })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('no_alcanzable')
  })

  test('TypeError "blocked by client" → mixed_content_o_shields', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('NetworkError: blocked by client (Brave Shields)')))
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('mixed_content_o_shields')
  })

  test('JSON con app correcta pero protocol distinto → version_incompatible', async () => {
    mockFetchOnce(
      makeRes({
        status: 200,
        json: { ok: true, app: 'EclesiaPresenter', version: '2.0', protocol: 2 },
      }),
    )
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('version_incompatible')
  })

  test('Status 200 con JSON inválido (parser tira) → puerto_incorrecto', async () => {
    mockFetchOnce(makeRes({ status: 200, jsonThrows: true }))
    const r = await checkServer('http://1.2.3.4:3434')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('puerto_incorrecto')
  })
})

describe('pairWithDesktop() probe-before-pair', () => {
  test('probe OK → POST /api/pair se llama; resultado se devuelve', async () => {
    let call = 0
    global.fetch = jest.fn((url) => {
      call++
      if (call === 1) {
        // primera llamada: GET /api/info
        expect(url).toBe('http://1.2.3.4:3434/api/info')
        return Promise.resolve(makeOkProbe())
      }
      // segunda: POST /api/pair
      expect(url).toBe('http://1.2.3.4:3434/api/pair')
      return Promise.resolve(
        makeRes({
          status: 200,
          json: {
            ok: true,
            token: 'tok',
            serverInfo: { version: '1.2.3', wsUrl: 'ws://1.2.3.4:3434/ws/remote' },
          },
        }),
      )
    })
    const out = await pairWithDesktop({
      url: 'http://1.2.3.4:3434',
      pin: '123456',
    })
    expect(out.token).toBe('tok')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('probe fail (puerto_incorrecto) → POST NUNCA se llama', async () => {
    global.fetch = jest.fn((url) => {
      expect(url).toBe('http://1.2.3.4:5173/api/info')
      return Promise.resolve(
        makeRes({
          status: 200,
          contentType: 'text/html',
          json: {},
        }),
      )
    })
    await expect(
      pairWithDesktop({ url: 'http://1.2.3.4:5173', pin: '123456' }),
    ).rejects.toMatchObject({ code: 'puerto_incorrecto' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('baseUrl === window.location.host → puerto_incorrecto SIN ningún fetch', async () => {
    const spy = jest.fn()
    global.fetch = spy
    // Mock mínimo de window.location.
    globalThis.window = { location: { host: '192.168.0.24:5173', protocol: 'http:' } }
    globalThis.__pairingTestWindow = true
    try {
      await expect(
        pairWithDesktop({ url: 'http://192.168.0.24:5173', pin: '123456' }),
      ).rejects.toMatchObject({ code: 'puerto_incorrecto' })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      delete globalThis.window
      delete globalThis.__pairingTestWindow
    }
  })

  test('probe servidor_caido → POST NUNCA se llama', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(
      pairWithDesktop({ url: 'http://1.2.3.4:3434', pin: '123456' }),
    ).rejects.toMatchObject({ code: 'servidor_caido' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
