/**
 * @jest-environment node
 *
 * Tests de GET /api/songs/list y /api/songs/:id. Mismo patron que el
 * server.bibleEndpoint.test.js: arranca server con port=0, pide token,
 * inyecta snapshot via pushSongs.
 */
const http = require('http')

const pairing = require('../src/server/pairing')
const songsCatalog = require('../src/server/songsCatalog')
const { startServer } = require('../src/server/server')

function requestJson(port, method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path, method, headers,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, body: json, headers: res.headers })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function postJson(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}), 'utf8')
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': data.length,
        ...headers,
      },
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, body: json, headers: res.headers })
      })
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}

async function obtainToken(handle, deviceId = 'tdev-songs') {
  const pin = handle.getPairingPin()
  const r = await postJson(handle.port, '/api/pair', { pin, deviceId, deviceName: 'Test' })
  if (!r.body?.ok) throw new Error('pair failed: ' + JSON.stringify(r))
  return r.body.token
}

function makeSong(over = {}) {
  return {
    id: over.id ?? 1,
    title: over.title ?? 'Cuán Grande Es Él',
    author: over.author ?? 'Hine',
    tags: over.tags ?? 'Himno',
    sections: over.sections ?? [
      { type: 'verse', label: 'Estrofa 1', text: 'Señor mi Dios al contemplar los cielos' },
      { type: 'chorus', label: 'Coro', text: 'Mi corazón entona la canción' },
    ],
    is_favorite: over.is_favorite ?? 0,
    updated_at: over.updated_at ?? Date.now(),
    cloud_id: 'should-not-leak',
    theme_override: over.theme_override ?? null,
  }
}

let handle
beforeEach(async () => {
  pairing.__resetForTests()
  pairing.__setPinForTests('123456')
  songsCatalog.__resetForTests()
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

describe('GET /api/songs/list', () => {
  test('sin Authorization → 401 token_requerido', async () => {
    const r = await requestJson(handle.port, 'GET', '/api/songs/list')
    expect(r.status).toBe(401)
    expect(r.body?.error).toBe('token_requerido')
  })

  test('token invalido → 401', async () => {
    const r = await requestJson(handle.port, 'GET', '/api/songs/list', {
      authorization: 'Bearer xx',
    })
    expect(r.status).toBe(401)
    expect(r.body?.error).toBe('token_invalido')
  })

  test('catalogo vacio → 200 ok items=[]', async () => {
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/list', {
      authorization: `Bearer ${token}`,
    })
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.items).toEqual([])
    expect(r.body.count).toBe(0)
    expect(r.headers['cache-control']).toBe('no-store')
  })

  test('con catalogo poblado devuelve metadata', async () => {
    handle.pushSongs([makeSong({ id: 5, title: 'Coro Bonito' })])
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/list', {
      authorization: `Bearer ${token}`,
    })
    expect(r.status).toBe(200)
    expect(r.body.items[0].id).toBe(5)
    expect(r.body.items[0].title).toBe('Coro Bonito')
    expect(r.body.items[0]).toHaveProperty('sectionsCount')
    expect(r.body.items[0]).not.toHaveProperty('sections')
    expect(r.body.items[0]).not.toHaveProperty('cloud_id')
    expect(r.body.serverVersion).toBeGreaterThan(0)
  })

  test('q con tilde matchea sin tilde (paridad UX)', async () => {
    handle.pushSongs([makeSong({ id: 1, title: 'Cuán Grande Es Él' })])
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET',
      '/api/songs/list?q=cuan%20grande',
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(200)
    expect(r.body.count).toBe(1)
    expect(r.body.items[0].matchKind).toBe('title')
  })

  test('q matchea letra y devuelve snippet', async () => {
    handle.pushSongs([
      makeSong({ id: 1, title: 'Sin match', author: 'no', tags: 'no',
        sections: [{ text: 'Mi corazón entona la canción' }] }),
    ])
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET',
      '/api/songs/list?q=corazon',
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(200)
    expect(r.body.items[0].matchKind).toBe('lyric')
    expect(r.body.items[0].snippet).toBeDefined()
  })

  test('paginacion limit/offset/hasMore consistente', async () => {
    handle.pushSongs([
      makeSong({ id: 1, title: 'A' }),
      makeSong({ id: 2, title: 'B' }),
      makeSong({ id: 3, title: 'C' }),
    ])
    const token = await obtainToken(handle)
    const r1 = await requestJson(handle.port, 'GET',
      '/api/songs/list?limit=2&offset=0',
      { authorization: `Bearer ${token}` },
    )
    expect(r1.body.items).toHaveLength(2)
    expect(r1.body.hasMore).toBe(true)
    const r2 = await requestJson(handle.port, 'GET',
      '/api/songs/list?limit=2&offset=2',
      { authorization: `Bearer ${token}` },
    )
    expect(r2.body.items).toHaveLength(1)
    expect(r2.body.hasMore).toBe(false)
  })

  test('limit NaN → 400 invalid_limit', async () => {
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET',
      '/api/songs/list?limit=abc',
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('invalid_limit')
  })

  test('offset NaN → 400 invalid_offset', async () => {
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET',
      '/api/songs/list?offset=zzz',
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('invalid_offset')
  })

  test('rate-limit: >RATE_MAX → 429', async () => {
    const token = await obtainToken(handle)
    for (let i = 0; i < songsCatalog.RATE_MAX; i++) {
      const r = await requestJson(handle.port, 'GET', '/api/songs/list',
        { authorization: `Bearer ${token}` })
      expect(r.status).toBe(200)
    }
    const over = await requestJson(handle.port, 'GET', '/api/songs/list',
      { authorization: `Bearer ${token}` })
    expect(over.status).toBe(429)
    expect(over.body.error).toBe('demasiadas_busquedas')
    expect(over.headers['retry-after']).toBeDefined()
  })

  test('q muy largo se trunca server-side', async () => {
    handle.pushSongs([makeSong()])
    const token = await obtainToken(handle)
    const huge = 'a'.repeat(500)
    const r = await requestJson(handle.port, 'GET',
      `/api/songs/list?q=${huge}`,
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(200)
  })
})

describe('GET /api/songs/:id', () => {
  test('sin token → 401', async () => {
    const r = await requestJson(handle.port, 'GET', '/api/songs/1')
    expect(r.status).toBe(401)
  })

  test('id valido → 200 con sections expandidas', async () => {
    handle.pushSongs([makeSong({ id: 42 })])
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/42',
      { authorization: `Bearer ${token}` })
    expect(r.status).toBe(200)
    expect(r.body.song.id).toBe(42)
    expect(r.body.song.sections).toHaveLength(2)
    expect(r.body.song.sections[0].sectionId).toBe('s_0')
    expect(r.body.song.sections[1].sectionId).toBe('s_1')
  })

  test('id no existe → 404 song_not_found', async () => {
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/9999',
      { authorization: `Bearer ${token}` })
    expect(r.status).toBe(404)
    expect(r.body.error).toBe('song_not_found')
  })

  test('id no numerico → 400 invalid_id', async () => {
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/abc',
      { authorization: `Bearer ${token}` })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('invalid_id')
  })

  test('id=0 → 400', async () => {
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/0',
      { authorization: `Bearer ${token}` })
    expect(r.status).toBe(400)
  })

  test('no leak de cloud_id', async () => {
    handle.pushSongs([makeSong({ id: 7 })])
    const token = await obtainToken(handle)
    const r = await requestJson(handle.port, 'GET', '/api/songs/7',
      { authorization: `Bearer ${token}` })
    expect(r.body.song).not.toHaveProperty('cloud_id')
    expect(r.body.song).not.toHaveProperty('cloud_synced_at')
  })
})
