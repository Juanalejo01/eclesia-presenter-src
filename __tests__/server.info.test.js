/**
 * @jest-environment node
 */
// Tests del endpoint público GET /api/info — discriminador determinista
// que usa el mando móvil para confirmar "esta URL es realmente
// EclesiaPresenter" antes de gastar un intento del rate-limiter de
// /api/pair. Contract test estricto: si alguien renombra la app, cambia
// el shape o quita los headers CORS, el mobile rompe silenciosamente —
// este test lo atrapa antes.
//
// Estrategia (sin supertest; alineado con server.wsRemote.test.js):
//   - startServer({ port: 0 }) → puerto random asignado por el OS
//   - http.get nativo, sin librerías nuevas
//   - cerrar el server al final
//
// Convención del repo: tests del server viven en /__tests__ root (no en
// src/server/__tests__/) porque el jest root está configurado para
// descubrir cualquier archivo *.test.js bajo /__tests__/. Mover este
// archivo bajo src/ obligaría a duplicar la config Jest con un segundo
// "roots" o un "testPathIgnorePatterns" — más coste que beneficio. La
// vecindad simbólica con server.wsRemote.test.js refuerza la lectura.

const http = require('http')
const { startServer } = require('../src/server/server')

function httpGet(port, path, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json
          try { json = JSON.parse(text) } catch { json = null }
          resolve({ status: res.statusCode, headers: res.headers, body: json, text })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

let handle
beforeAll(async () => {
  handle = startServer({ port: 0 })
  // Espera al listen — basta con un tick: startServer no devuelve promise
  // pero httpServer.listen es async; un setImmediate basta para que el
  // address() devuelva el puerto real.
  await new Promise((resolve) => setImmediate(resolve))
  // Doble seguridad: si el port aún no está, hace polling muy corto.
  let tries = 0
  while (!handle.port && tries < 20) {
    await new Promise((r) => setTimeout(r, 10))
    tries++
  }
})

afterAll(async () => {
  if (handle?.close) await handle.close()
})

test('GET /api/info → 200 con shape { ok, app, version, protocol, capabilities }', async () => {
  const r = await httpGet(handle.port, '/api/info')
  expect(r.status).toBe(200)
  expect(r.body).toBeTruthy()
  expect(r.body.ok).toBe(true)
  expect(r.body.app).toBe('EclesiaPresenter')
  expect(typeof r.body.version).toBe('string')
  expect(r.body.version.length).toBeGreaterThan(0)
  expect(r.body.protocol).toBe(1)
  expect(Array.isArray(r.body.capabilities)).toBe(true)
})

test('Content-Type es application/json', async () => {
  const r = await httpGet(handle.port, '/api/info')
  expect(String(r.headers['content-type'] || '')).toMatch(/application\/json/i)
})

test('Headers Access-Control-Allow-Origin: * y Cache-Control: no-store', async () => {
  const r = await httpGet(handle.port, '/api/info')
  expect(r.headers['access-control-allow-origin']).toBe('*')
  expect(String(r.headers['cache-control'] || '')).toMatch(/no-store/i)
})

test('version coincide con package.json', async () => {
  const pkgVersion = require('../package.json').version
  const r = await httpGet(handle.port, '/api/info')
  expect(r.body.version).toBe(pkgVersion)
})

test('NO requiere auth (sin Authorization header da 200)', async () => {
  // Llamada sin ningún header de auth — debe pasar igual.
  const r = await httpGet(handle.port, '/api/info', { headers: {} })
  expect(r.status).toBe(200)
  expect(r.body.app).toBe('EclesiaPresenter')
})
