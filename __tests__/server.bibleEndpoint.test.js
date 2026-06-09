/**
 * @jest-environment node
 *
 * Tests del endpoint POST /api/bible/search del server.
 * Arranca el server real en puerto 0, obtiene un token vía /api/pair,
 * y prueba todos los códigos de respuesta + el rate-limit per-device.
 */
const http = require('http')

const pairing = require('../src/server/pairing')
const bibleSearch = require('../src/server/bibleSearch')
const { startServer } = require('../src/server/server')

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

async function obtainToken(handle, deviceId = 't-dev') {
  const pin = handle.getPairingPin()
  const r = await postJson(handle.port, '/api/pair', { pin, deviceId, deviceName: 'Test' })
  if (!r.body?.ok) throw new Error('pair failed: ' + JSON.stringify(r))
  return r.body.token
}

let handle
beforeEach(async () => {
  pairing.__resetForTests()
  pairing.__setPinForTests('123456')
  bibleSearch.__resetForTests()
  bibleSearch.__resetRateLimitForTests()
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

describe('POST /api/bible/search', () => {
  test('sin Authorization → 401 token_requerido', async () => {
    const r = await postJson(handle.port, '/api/bible/search', { q: 'Juan 3:16' })
    expect(r.status).toBe(401)
    expect(r.body?.error).toBe('token_requerido')
  })

  test('token inválido → 401 token_invalido', async () => {
    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'Juan 3:16' },
      { authorization: 'Bearer invalido' },
    )
    expect(r.status).toBe(401)
    expect(r.body?.error).toBe('token_invalido')
  })

  test('q ausente → 400 q_required', async () => {
    const token = await obtainToken(handle)
    const r = await postJson(handle.port, '/api/bible/search',
      {},
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(400)
    expect(r.body?.error).toBe('q_required')
  })

  test('q="Juan 3:16" → 200 mode=ref', async () => {
    const token = await obtainToken(handle)
    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'Juan 3:16' },
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(200)
    expect(r.body?.ok).toBe(true)
    expect(r.body.mode).toBe('ref')
    expect(r.body.results).toHaveLength(1)
    expect(r.body.results[0].reference).toBe('Juan 3:16')
    expect(r.body.results[0].text).toMatch(/Porque de tal manera/)
    expect(r.headers['cache-control']).toBe('no-store')
  })

  test('q="Juan 99:1" → 404 reference_not_found', async () => {
    const token = await obtainToken(handle)
    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'Juan 99:1' },
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(404)
    expect(r.body?.error).toBe('reference_not_found')
  })

  test('q="xyz 1:1" mode=auto → fallback fulltext con 0 resultados', async () => {
    const token = await obtainToken(handle)
    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'xyz 1:1' },
      { authorization: `Bearer ${token}` },
    )
    // auto mode: si la búsqueda como referencia falla (book_not_found),
    // cae a fulltext; "xyz" no aparece en ningún versículo → 200 vacío.
    expect(r.status).toBe(200)
    expect(r.body?.mode).toBe('text')
    expect(r.body?.count).toBe(0)
  })

  test('q="xyz 1:1" mode=ref → 404 book_not_found (sin fallback)', async () => {
    const token = await obtainToken(handle)
    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'xyz 1:1', mode: 'ref' },
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(404)
    expect(r.body?.error).toBe('book_not_found')
  })

  test('q="amor" → 200 mode=text', async () => {
    const token = await obtainToken(handle)
    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'amor', limit: 5 },
      { authorization: `Bearer ${token}` },
    )
    expect(r.status).toBe(200)
    expect(r.body?.mode).toBe('text')
    expect(r.body.results.length).toBeGreaterThan(0)
    expect(r.body.results.length).toBeLessThanOrEqual(5)
  })

  test('rate-limit: >30 req → 429 con Retry-After', async () => {
    const token = await obtainToken(handle)
    // Hacer RATE_MAX requests OK; la siguiente debe ser 429.
    for (let i = 0; i < bibleSearch.RATE_MAX; i++) {
      const r = await postJson(handle.port, '/api/bible/search',
        { q: 'Juan 3:16' },
        { authorization: `Bearer ${token}` },
      )
      expect(r.status).toBe(200)
    }
    const over = await postJson(handle.port, '/api/bible/search',
      { q: 'Juan 3:16' },
      { authorization: `Bearer ${token}` },
    )
    expect(over.status).toBe(429)
    expect(over.body?.error).toBe('demasiadas_busquedas')
    expect(over.headers['retry-after']).toBeDefined()
  })

  test('q demasiado largo se trunca, no rompe', async () => {
    const token = await obtainToken(handle)
    const big = 'a'.repeat(500)
    const r = await postJson(handle.port, '/api/bible/search',
      { q: big },
      { authorization: `Bearer ${token}` },
    )
    // 200 (text mode con sin resultados) o 400/empty — pero NUNCA 500.
    expect([200, 400, 404]).toContain(r.status)
  })
})
