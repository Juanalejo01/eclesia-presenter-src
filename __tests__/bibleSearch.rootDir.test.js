/**
 * @jest-environment node
 *
 * Regresión: resolución del directorio de biblias en builds empaquetados.
 *
 * Antes _rootDir se fijaba con __dirname relativo a public/ — en prod eso
 * apunta a app.asar/public, que NO existe (public/ no va en `files` de
 * electron-builder), y /api/bible/search devolvía 503 bible_unavailable
 * siempre. Ahora bibleSearch.resolveBibleDir() prueba candidatos en orden
 * (resources/bibles → public/ del repo), mismo patrón que
 * resolveMobileAppDir en server.js (T12).
 *
 * Patrón http nativo sin supertest, alineado con server.appRoute.test.js.
 */
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const pairing = require('../src/server/pairing')
const bibleSearch = require('../src/server/bibleSearch')
const { startServer } = require('../src/server/server')

// Biblia mínima válida para loadVersion: array de { name, chapters[][] }.
const MINI_BIBLE = [
  { name: 'Génesis', chapters: [['En el principio fixture.']] },
  { name: 'Juan', chapters: [['Texto fixture Juan 1:1.']] },
]

// El marker de validez de un candidato es el JSON de la versión default.
const DEFAULT_FILE = 'rvr1960.json'

function makeBibleDir(parent, sub) {
  const dir = sub ? path.join(parent, sub) : parent
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, DEFAULT_FILE), JSON.stringify(MINI_BIBLE))
  return dir
}

function postJson(port, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}), 'utf8')
    const req = http.request({
      host: '127.0.0.1', port, path: urlPath, method: 'POST',
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

// ============================================================
// resolveBibleDir — orden de candidatos (inyectados, como en
// el describe resolveMobileAppDir de server.appRoute.test.js)
// ============================================================
describe('resolveBibleDir', () => {
  let resourcesRoot
  let repoDir

  beforeEach(() => {
    resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclesia-resources-'))
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclesia-repo-public-'))
  })

  afterEach(() => {
    try { fs.rmSync(resourcesRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    try { fs.rmSync(repoDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('prefiere resources/bibles cuando contiene el JSON default', () => {
    const packaged = makeBibleDir(resourcesRoot, 'bibles')
    // El repo también tiene biblias — resources gana por orden.
    makeBibleDir(repoDir)

    expect(bibleSearch.resolveBibleDir({ resourcesPath: resourcesRoot, repoDir })).toBe(packaged)
  })

  test('cae a public/ del repo si resources no tiene biblias (dev Electron)', () => {
    // resources/bibles no existe (resourcesPath apunta a
    // node_modules/electron/dist/resources en dev).
    makeBibleDir(repoDir)

    expect(bibleSearch.resolveBibleDir({ resourcesPath: resourcesRoot, repoDir })).toBe(repoDir)
  })

  test('devuelve null si ningún candidato tiene el JSON default', () => {
    expect(bibleSearch.resolveBibleDir({ resourcesPath: resourcesRoot, repoDir })).toBeNull()
    // Sin resourcesPath (Jest fuera de Electron) tampoco crashea.
    expect(bibleSearch.resolveBibleDir({ resourcesPath: null, repoDir })).toBeNull()
  })

  test('default sin candidatos inyectados resuelve a public/ del repo (entorno dev/test)', () => {
    expect(bibleSearch.resolveBibleDir()).toBe(path.join(__dirname, '..', 'public'))
  })
})

// ============================================================
// Boot sin biblias en ningún candidato → loadVersion null (503),
// nunca un throw por path.join(null, ...)
// ============================================================
describe('boot sin biblias disponibles', () => {
  test('loadVersion devuelve null (el endpoint mapea a 503 bible_unavailable)', () => {
    jest.isolateModules(() => {
      const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(false)
      let fresh
      try {
        fresh = require('../src/server/bibleSearch')
      } finally {
        spy.mockRestore()
      }
      expect(fresh.loadVersion('rvr1960')).toBeNull()
    })
  })
})

// ============================================================
// Regresión end-to-end: layout empaquetado (biblias SOLO en
// resources/bibles, sin public/) → /api/bible/search funciona
// ============================================================
describe('/api/bible/search con biblias solo en resources/bibles (layout prod)', () => {
  let handle
  let resourcesRoot

  beforeAll(async () => {
    resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclesia-resources-'))
    makeBibleDir(resourcesRoot, 'bibles')

    pairing.__resetForTests()
    pairing.__setPinForTests('123456')
    bibleSearch.__resetForTests()
    bibleSearch.__resetRateLimitForTests()
    // Simula el boot empaquetado: el public/ del repo NO es candidato.
    bibleSearch.setRootDir(
      bibleSearch.resolveBibleDir({ resourcesPath: resourcesRoot, repoDir: null }),
    )

    handle = startServer({ port: 0 })
    await new Promise(resolve => {
      if (handle.httpServer.listening) return resolve()
      handle.httpServer.once('listening', () => resolve())
    })
  })

  afterAll(async () => {
    if (handle) await handle.close()
    // Restaurar el default para no contaminar otros tests del mismo archivo.
    bibleSearch.setRootDir(path.join(__dirname, '..', 'public'))
    try { fs.rmSync(resourcesRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('POST "Juan 1:1" → 200 con texto del fixture (no 503 bible_unavailable)', async () => {
    const pin = handle.getPairingPin()
    const pair = await postJson(handle.port, '/api/pair', { pin, deviceId: 'rootdir-test' })
    expect(pair.body?.ok).toBe(true)

    const r = await postJson(handle.port, '/api/bible/search',
      { q: 'Juan 1:1' },
      { authorization: `Bearer ${pair.body.token}` },
    )
    expect(r.status).toBe(200)
    expect(r.body?.ok).toBe(true)
    expect(r.body.results[0].text).toBe('Texto fixture Juan 1:1.')
    expect(r.body.results[0].reference).toBe('Juan 1:1')
  })
})
