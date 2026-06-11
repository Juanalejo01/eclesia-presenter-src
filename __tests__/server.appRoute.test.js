/**
 * @jest-environment node
 */
// Tests de la ruta /app (T12): el server Express del desktop sirve el build
// PWA del mando (mobile/dist-app o resources/mobile-app en prod) con
// express.static + SPA fallback para BrowserRouter.
//
// Estrategia (sin supertest; alineado con server.info.test.js):
//   - startServer({ port: 0, mobileAppDir: <fixture> }) → inyección del dir
//   - fixture en os.tmpdir() con index.html + assets/x.js
//   - http.request nativo
//
// resolveMobileAppDir se testea con candidatos inyectados (resourcesPath /
// repoDir) para no depender de que mobile/dist-app esté construido en CI.

const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { startServer, resolveMobileAppDir } = require('../src/server/server')

function httpGet(port, urlPath, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: 'GET', headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function waitForPort(handle) {
  await new Promise((resolve) => setImmediate(resolve))
  let tries = 0
  while (!handle.port && tries < 20) {
    await new Promise((r) => setTimeout(r, 10))
    tries++
  }
}

// ---------- Fixture: build fake del mobile ----------
const INDEX_HTML = '<!doctype html><html><body>app-shell-fixture</body></html>'
let fixtureDir

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclesia-mobile-app-'))
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), INDEX_HTML)
  fs.mkdirSync(path.join(fixtureDir, 'assets'))
  fs.writeFileSync(path.join(fixtureDir, 'assets', 'x.js'), 'console.log("fixture")')
})

afterAll(() => {
  try { fs.rmSync(fixtureDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

// ============================================================
// Con build presente (mobileAppDir inyectado)
// ============================================================
describe('/app con build presente', () => {
  let handle

  beforeAll(async () => {
    handle = startServer({ port: 0, mobileAppDir: fixtureDir })
    await waitForPort(handle)
  })

  afterAll(async () => {
    await handle.close()
  })

  test('GET /app/ sirve index.html (200, text/html)', async () => {
    const res = await httpGet(handle.port, '/app/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toContain('app-shell-fixture')
  })

  test('GET /app/assets/x.js sirve el asset estático con content-type correcto', async () => {
    const res = await httpGet(handle.port, '/app/assets/x.js')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/javascript/)
    expect(res.text).toContain('fixture')
  })

  test('GET /app/service y /app/bible (rutas BrowserRouter) devuelven index.html via SPA fallback', async () => {
    for (const p of ['/app/service', '/app/bible']) {
      const res = await httpGet(handle.port, p)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/html/)
      expect(res.text).toContain('app-shell-fixture')
    }
  })

  test('GET /app redirige a /app/ (comportamiento express.static)', async () => {
    const res = await httpGet(handle.port, '/app')
    expect([301, 302]).toContain(res.status)
    expect(res.headers.location).toMatch(/\/app\/$/)
  })

  test('/app montado no shadow-ea GET /api/info ni GET /remote (siguen 200)', async () => {
    const info = await httpGet(handle.port, '/api/info')
    expect(info.status).toBe(200)
    expect(JSON.parse(info.text).app).toBe('EclesiaPresenter')

    const remote = await httpGet(handle.port, '/remote')
    expect(remote.status).toBe(200)
    expect(remote.text).toContain('EclesiaPresenter')
  })
})

// ============================================================
// Sin build (mobileAppDir null) → 404 accionable, server vivo
// ============================================================
describe('/app sin build', () => {
  let handle

  beforeAll(async () => {
    handle = startServer({ port: 0, mobileAppDir: null })
    await waitForPort(handle)
  })

  afterAll(async () => {
    await handle.close()
  })

  test('GET /app/ → 404 con mensaje "Build del mobile no encontrado"', async () => {
    const res = await httpGet(handle.port, '/app/')
    expect(res.status).toBe(404)
    expect(res.text).toContain('Build del mobile no encontrado')
    expect(res.text).toContain('npm run build:mobile-app')
  })

  test('GET /app (sin slash) y /app/service también 404, y el resto del server sigue vivo', async () => {
    expect((await httpGet(handle.port, '/app')).status).toBe(404)
    expect((await httpGet(handle.port, '/app/service')).status).toBe(404)
    // El server NUNCA crashea por ausencia del build: /remote sigue ok.
    expect((await httpGet(handle.port, '/remote')).status).toBe(200)
  })
})

// ============================================================
// resolveMobileAppDir — orden de candidatos
// ============================================================
describe('resolveMobileAppDir', () => {
  let resourcesRoot
  let repoDir

  beforeEach(() => {
    resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclesia-resources-'))
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclesia-repo-distapp-'))
  })

  afterEach(() => {
    try { fs.rmSync(resourcesRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    try { fs.rmSync(repoDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('prefiere resources/mobile-app cuando existe index.html', () => {
    const packaged = path.join(resourcesRoot, 'mobile-app')
    fs.mkdirSync(packaged)
    fs.writeFileSync(path.join(packaged, 'index.html'), INDEX_HTML)
    // El repoDir también existe — resources gana por orden.
    fs.writeFileSync(path.join(repoDir, 'index.html'), INDEX_HTML)

    expect(resolveMobileAppDir({ resourcesPath: resourcesRoot, repoDir })).toBe(packaged)
  })

  test('cae al path del repo (mobile/dist-app) si resources no tiene index.html', () => {
    // resources/mobile-app no existe (caso dev Electron: resourcesPath apunta
    // a node_modules/electron/dist/resources).
    fs.writeFileSync(path.join(repoDir, 'index.html'), INDEX_HTML)

    expect(resolveMobileAppDir({ resourcesPath: resourcesRoot, repoDir })).toBe(repoDir)
  })

  test('devuelve null si ningún candidato tiene index.html', () => {
    expect(resolveMobileAppDir({ resourcesPath: resourcesRoot, repoDir })).toBeNull()
    // Sin resourcesPath (Jest fuera de Electron) tampoco crashea.
    expect(resolveMobileAppDir({ resourcesPath: null, repoDir })).toBeNull()
  })
})
