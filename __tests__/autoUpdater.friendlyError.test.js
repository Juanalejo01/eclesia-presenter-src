// Tests del clasificador de errores del auto-updater (src/main/updaterErrors.js).
// Módulo puro: sin Electron, sin mocks.

const { classifyUpdaterError, firstLine, FRIENDLY } = require('../src/main/updaterErrors')

// Reproducción del HttpError CRUDO real de electron-updater cuando el release
// "latest" de GitHub no tiene latest.yml (caso: release mobile marcado Latest).
const RAW_404 = `HttpError: 404
"method: GET url: https://github.com/Juanalejo01/eclesia-presenter/releases/download/mobile-v0.1.0/latest.yml

Please double check that your authentication token is correct."
Headers: {
  "content-type": "text/plain; charset=utf-8",
  "x-github-request-id": "ABCD:1234"
}
    at createHttpError (C:\\app\\node_modules\\builder-util-runtime\\src\\httpExecutor.ts:asd)
    at newError (C:\\app\\node_modules\\builder-util-runtime\\src\\index.ts:9:1)`

describe('classifyUpdaterError', () => {
  // ---- no_feed: 404 sobre latest.yml / app-update.yml ----
  test('HttpError 404 multilínea sobre latest.yml → no_feed con mensaje amigable', () => {
    const r = classifyUpdaterError(new Error(RAW_404))
    expect(r.code).toBe('no_feed')
    expect(r.friendly).toBe(FRIENDLY.no_feed)
    expect(r.detail).toBe(RAW_404)        // el crudo se conserva para debug
    expect(r.friendly).not.toMatch(/\n/)  // 1 sola línea
    expect(r.friendly).not.toMatch(/newError|httpExecutor/)  // sin stack
  })

  test('"Cannot find latest.yml" (sin 404 explícito) → no_feed', () => {
    const r = classifyUpdaterError(new Error('Cannot find latest.yml in the latest release artifacts'))
    expect(r.code).toBe('no_feed')
    expect(r.friendly).toBe(FRIENDLY.no_feed)
  })

  test('404 sobre app-update.yml → no_feed', () => {
    const r = classifyUpdaterError(new Error('HttpError: 404 url: .../app-update.yml'))
    expect(r.code).toBe('no_feed')
  })

  test('404 SIN mención al feed yml NO es no_feed', () => {
    const r = classifyUpdaterError(new Error('HttpError: 404 url: https://example.com/otracosa'))
    expect(r.code).toBe('unknown')
  })

  // ---- offline: errores de red ----
  test.each([
    'getaddrinfo ENOTFOUND github.com',
    'connect ECONNREFUSED 140.82.121.3:443',
    'request timed out ETIMEDOUT',
    'read ECONNRESET',
    'getaddrinfo EAI_AGAIN github.com',
    'net::ERR_INTERNET_DISCONNECTED',
    'net::ERR_CONNECTION_RESET',
  ])('error de red %p → offline', (msg) => {
    const r = classifyUpdaterError(new Error(msg))
    expect(r.code).toBe('offline')
    expect(r.friendly).toBe(FRIENDLY.offline)
  })

  // ---- rate_limited ----
  test('403 → rate_limited', () => {
    const r = classifyUpdaterError(new Error('HttpError: 403 url: https://api.github.com/...'))
    expect(r.code).toBe('rate_limited')
    expect(r.friendly).toBe(FRIENDLY.rate_limited)
  })

  test('"API rate limit exceeded" → rate_limited', () => {
    const r = classifyUpdaterError(new Error('API rate limit exceeded for 1.2.3.4'))
    expect(r.code).toBe('rate_limited')
  })

  // ---- unknown: fallback genérico, 1 línea, sin stack ----
  test('error desconocido → unknown con detalle breve de 1 línea', () => {
    const raw = 'ZipError: corrupted archive\n    at unzip (C:\\app\\zip.js:1:1)\n    at more (stack.js:2:2)'
    const r = classifyUpdaterError(new Error(raw))
    expect(r.code).toBe('unknown')
    expect(r.friendly).toContain(FRIENDLY.unknown)
    expect(r.friendly).toContain('ZipError: corrupted archive')
    expect(r.friendly).not.toMatch(/\n/)
    expect(r.friendly).not.toContain('at unzip')
  })

  test('detalle del unknown se trunca a ~120 chars', () => {
    const r = classifyUpdaterError(new Error('x'.repeat(500)))
    expect(r.code).toBe('unknown')
    // genérico (~38) + detalle truncado a 120 → nunca un stack de miles de chars
    expect(r.friendly.length).toBeLessThan(180)
    expect(r.friendly).toContain('…')
  })

  // ---- inputs no-Error ----
  test('acepta string directamente', () => {
    expect(classifyUpdaterError('net::ERR_INTERNET_DISCONNECTED').code).toBe('offline')
  })

  test.each([null, undefined, ''])('input vacío %p → unknown con mensaje genérico', (input) => {
    const r = classifyUpdaterError(input)
    expect(r.code).toBe('unknown')
    expect(r.friendly).toBe(FRIENDLY.unknown)
  })
})

describe('firstLine', () => {
  test('saca la primera línea no vacía', () => {
    expect(firstLine('\n\n  hola mundo  \nsegunda')).toBe('hola mundo')
  })
  test('trunca con elipsis al máximo indicado', () => {
    expect(firstLine('abcdef', 4)).toBe('abc…')
  })
  test('devuelve cadena vacía para input vacío', () => {
    expect(firstLine('')).toBe('')
    expect(firstLine(null)).toBe('')
  })
})
