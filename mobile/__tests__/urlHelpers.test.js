/**
 * urlHelpers.test.js
 *
 * Cobertura exhaustiva de normalizeBaseUrl / detectPortIssue /
 * suggestCanonicalUrl. Las URLs son la causa raíz #1 de fallos de
 * pairing reportados por usuarios, así que invertimos en tests densos.
 */

const {
  normalizeBaseUrl,
  detectPortIssue,
  suggestCanonicalUrl,
} = require('../src/services/urlHelpers.js')

describe('normalizeBaseUrl', () => {
  test('vacío → ""', () => {
    expect(normalizeBaseUrl('')).toBe('')
    expect(normalizeBaseUrl('   ')).toBe('')
  })

  test('IP sin scheme ni puerto → http://<ip>:3434', () => {
    expect(normalizeBaseUrl('192.168.0.24')).toBe('http://192.168.0.24:3434')
  })

  test('http://IP sin puerto → añade :3434', () => {
    expect(normalizeBaseUrl('http://192.168.0.24')).toBe('http://192.168.0.24:3434')
  })

  test('IP con puerto :3434 → respeta y limpia trailing slash', () => {
    expect(normalizeBaseUrl('http://192.168.0.24:3434/')).toBe('http://192.168.0.24:3434')
    expect(normalizeBaseUrl('http://192.168.0.24:3434///')).toBe('http://192.168.0.24:3434')
  })

  test('IP con puerto :5173 (Vite) → NO reescribe el puerto', () => {
    expect(normalizeBaseUrl('192.168.0.24:5173')).toBe('http://192.168.0.24:5173')
    expect(normalizeBaseUrl('http://192.168.0.24:5173')).toBe('http://192.168.0.24:5173')
  })

  test('whitespace alrededor → recortado', () => {
    expect(normalizeBaseUrl('  http://x.local:3434  ')).toBe('http://x.local:3434')
  })

  test('hostname sin scheme ni puerto → http://...:3434', () => {
    expect(normalizeBaseUrl('mi-pc.local')).toBe('http://mi-pc.local:3434')
  })

  test('input no-URL imposible → al menos no crashea, devuelve algo string', () => {
    const r = normalizeBaseUrl('no-es-url')
    expect(typeof r).toBe('string')
    expect(r).toContain('http')
  })
})

describe('detectPortIssue', () => {
  test('mismo host:port que el navegador → dev_server', () => {
    const r = detectPortIssue('http://192.168.0.24:5173', 'http://192.168.0.24:5173')
    expect(r.kind).toBe('dev_server')
    expect(r.port).toBe('5173')
  })

  test('puerto !== 3434 (no coincide con browser) → wrong_port', () => {
    const r = detectPortIssue('http://192.168.0.24:8080', 'http://192.168.0.24:5173')
    expect(r.kind).toBe('wrong_port')
    expect(r.port).toBe('8080')
  })

  test('puerto canónico 3434 → ok', () => {
    const r = detectPortIssue('http://192.168.0.24:3434', 'http://192.168.0.24:5173')
    expect(r.kind).toBe('ok')
  })

  test('sin windowOrigin (SSR/tests) → ok sin falsos positivos', () => {
    const r = detectPortIssue('http://192.168.0.24:3434', null)
    expect(r.kind).toBe('ok')
  })

  test('URL inválida → ok (no crashea)', () => {
    const r = detectPortIssue('basura', 'http://x:5173')
    expect(r.kind).toBe('ok')
  })
})

describe('suggestCanonicalUrl', () => {
  test('localhost → null', () => {
    expect(suggestCanonicalUrl('localhost')).toBe(null)
  })

  test('127.0.0.1 → null', () => {
    expect(suggestCanonicalUrl('127.0.0.1')).toBe(null)
  })

  test('IPv6 loopback ::1 → null', () => {
    expect(suggestCanonicalUrl('::1')).toBe(null)
  })

  test('IP LAN → http://<ip>:3434', () => {
    expect(suggestCanonicalUrl('192.168.0.24')).toBe('http://192.168.0.24:3434')
  })

  test('hostname .local → http://<host>:3434', () => {
    expect(suggestCanonicalUrl('eclesia-pc.local')).toBe('http://eclesia-pc.local:3434')
  })

  test('vacío/null → null', () => {
    expect(suggestCanonicalUrl('')).toBe(null)
    expect(suggestCanonicalUrl(null)).toBe(null)
    expect(suggestCanonicalUrl(undefined)).toBe(null)
  })
})
