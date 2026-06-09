/**
 * songsRemote.test.js (T10)
 *
 * Tests del cliente HTTP de canciones. Mockeamos loadCredentials y fetch.
 */
jest.mock('../src/services/transportStorage.js', () => ({
  loadCredentials: jest.fn(async () => ({ url: 'ws://127.0.0.1:3434/ws/remote', token: 'tok-abc' })),
  saveCredentials: jest.fn(async () => true),
  clearCredentials: jest.fn(async () => {}),
}))

const { loadCredentials } = require('../src/services/transportStorage.js')
const songsRemote = require('../src/services/songsRemote.js')

const _origFetch = global.fetch

function mockFetch(impl) {
  global.fetch = jest.fn(impl)
}

afterEach(() => {
  global.fetch = _origFetch
  jest.clearAllMocks()
})

function makeRes(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(k) { return headers[k.toLowerCase()] || null },
    },
    async json() { return body },
  }
}

describe('list', () => {
  test('200 OK mapea items/count/hasMore/serverVersion', async () => {
    mockFetch(async (url) => {
      expect(url).toContain('/api/songs/list')
      return makeRes(200, { ok: true, items: [{ id: 1, title: 'A' }], count: 1, hasMore: false, serverVersion: 12345 })
    })
    const r = await songsRemote.list({ q: 'a' })
    expect(r.ok).toBe(true)
    expect(r.items).toEqual([{ id: 1, title: 'A' }])
    expect(r.count).toBe(1)
    expect(r.serverVersion).toBe(12345)
  })

  test('Authorization Bearer presente', async () => {
    let capturedHeaders
    mockFetch(async (_url, opts) => {
      capturedHeaders = opts.headers
      return makeRes(200, { ok: true, items: [] })
    })
    await songsRemote.list({})
    expect(capturedHeaders.Authorization).toBe('Bearer tok-abc')
  })

  test('url derivada de ws://host:port', async () => {
    let capturedUrl
    mockFetch(async (url) => {
      capturedUrl = url
      return makeRes(200, { ok: true, items: [] })
    })
    await songsRemote.list({})
    expect(capturedUrl.startsWith('http://127.0.0.1:3434/')).toBe(true)
  })

  test('sanitiza q en query string', async () => {
    let capturedUrl
    mockFetch(async (url) => {
      capturedUrl = url
      return makeRes(200, { ok: true, items: [] })
    })
    await songsRemote.list({ q: '   hola   mundo   ' })
    expect(capturedUrl).toContain('q=hola+mundo')
  })

  test('401 → auth_error', async () => {
    mockFetch(async () => makeRes(401, { ok: false, error: 'token_invalido' }))
    const r = await songsRemote.list({})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('auth_error')
  })

  test('429 → rate_limited con retryAfterMs', async () => {
    mockFetch(async () => makeRes(429, { ok: false, retryAfterMs: 30000 }, { 'retry-after': '30' }))
    const r = await songsRemote.list({})
    expect(r.error).toBe('rate_limited')
    expect(r.retryAfterMs).toBe(30000)
  })

  test('network error → offline', async () => {
    mockFetch(async () => { throw new Error('boom') })
    const r = await songsRemote.list({})
    expect(r.error).toBe('offline')
  })

  test('AbortError → aborted', async () => {
    mockFetch(async () => {
      const e = new Error('aborted'); e.name = 'AbortError'; throw e
    })
    const r = await songsRemote.list({})
    expect(r.error).toBe('aborted')
  })

  test('credenciales ausentes → no_credentials', async () => {
    loadCredentials.mockResolvedValueOnce(null)
    const r = await songsRemote.list({})
    expect(r.error).toBe('no_credentials')
  })
})

describe('get', () => {
  test('200 OK mapea song', async () => {
    mockFetch(async (url) => {
      expect(url).toMatch(/\/api\/songs\/42$/)
      return makeRes(200, { ok: true, song: { id: 42, title: 'X' } })
    })
    const r = await songsRemote.get(42)
    expect(r.ok).toBe(true)
    expect(r.song.id).toBe(42)
  })

  test('404 → not_found', async () => {
    mockFetch(async () => makeRes(404, { ok: false, error: 'song_not_found' }))
    const r = await songsRemote.get(99)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('song_not_found')
  })

  test('id invalido (NaN) → invalid_id sin fetch', async () => {
    let called = false
    mockFetch(async () => { called = true; return makeRes(200, { ok: true }) })
    const r = await songsRemote.get('abc')
    expect(r.error).toBe('invalid_id')
    expect(called).toBe(false)
  })

  test('id <= 0 → invalid_id', async () => {
    const r = await songsRemote.get(-1)
    expect(r.error).toBe('invalid_id')
  })
})
