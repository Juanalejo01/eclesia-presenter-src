/**
 * remoteAbortCleanup.test.js (hardening v0.2.0)
 *
 * Regresión del leak de composeSignals: el listener 'abort' añadido al
 * AbortSignal EXTERNO (el del hook, que sobrevive a cada request) no se
 * removía al completar el fetch — cada búsqueda exitosa dejaba un listener
 * colgado reteniendo su closure. El fix devuelve { signal, cleanup } y
 * llama cleanup() en el finally de cada cliente.
 *
 * Mockeamos el signal externo como objeto plano (composeSignals solo usa
 * .aborted, addEventListener y removeEventListener).
 */
jest.mock('../src/services/transportStorage.js', () => ({
  loadCredentials: jest.fn(async () => ({ url: 'ws://127.0.0.1:3434/ws/remote', token: 'tok-abc' })),
  saveCredentials: jest.fn(async () => true),
  clearCredentials: jest.fn(async () => {}),
}))

const bibleRemote = require('../src/services/bibleRemote.js')
const songsRemote = require('../src/services/songsRemote.js')

const _origFetch = global.fetch

afterEach(() => {
  global.fetch = _origFetch
  jest.clearAllMocks()
})

function makeRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() { return body },
  }
}

function makeMockSignal() {
  return {
    aborted: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }
}

test('bibleRemote.search: removeEventListener("abort") en el signal externo tras fetch exitoso', async () => {
  global.fetch = jest.fn(async () => makeRes(200, { ok: true, mode: 'ref', results: [], count: 0 }))
  const signal = makeMockSignal()

  const r = await bibleRemote.search('Juan 3:16', { signal })

  expect(r.ok).toBe(true)
  expect(signal.addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true })
  const handler = signal.addEventListener.mock.calls[0][1]
  expect(signal.removeEventListener).toHaveBeenCalledWith('abort', handler)
})

test('bibleRemote.search: cleanup también corre cuando el fetch falla', async () => {
  global.fetch = jest.fn(async () => { throw new Error('boom') })
  const signal = makeMockSignal()

  const r = await bibleRemote.search('Juan 3:16', { signal })

  expect(r.error).toBe('offline')
  expect(signal.removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
})

test('songsRemote.list: removeEventListener("abort") en el signal externo tras fetch exitoso', async () => {
  global.fetch = jest.fn(async () => makeRes(200, { ok: true, items: [], count: 0 }))
  const signal = makeMockSignal()

  const r = await songsRemote.list({ q: 'a', signal })

  expect(r.ok).toBe(true)
  const handler = signal.addEventListener.mock.calls[0][1]
  expect(signal.removeEventListener).toHaveBeenCalledWith('abort', handler)
})

test('songsRemote.get: removeEventListener("abort") en el signal externo tras fetch exitoso', async () => {
  global.fetch = jest.fn(async () => makeRes(200, { ok: true, song: { id: 7 } }))
  const signal = makeMockSignal()

  const r = await songsRemote.get(7, { signal })

  expect(r.ok).toBe(true)
  const handler = signal.addEventListener.mock.calls[0][1]
  expect(signal.removeEventListener).toHaveBeenCalledWith('abort', handler)
})

test('sin signal externo no se toca ningún listener (no-op cleanup)', async () => {
  global.fetch = jest.fn(async () => makeRes(200, { ok: true, items: [], count: 0 }))
  const r = await songsRemote.list({})
  expect(r.ok).toBe(true)
})
