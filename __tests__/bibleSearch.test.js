/**
 * @jest-environment node
 *
 * Tests del módulo bibleSearch (parser + búsqueda + bookmap + rate-limit).
 * Sin red, sin server — directamente sobre el módulo Node.
 */
const path = require('path')
const bs = require('../src/server/bibleSearch')
const { BOOK_ALIASES, normalizeText } = require('../src/server/bibleSearch.bookmap')

beforeEach(() => {
  bs.__resetForTests()
  bs.__resetRateLimitForTests()
  // Apuntar al directorio real (default) — los JSON existen en public/.
  bs.setRootDir(path.join(__dirname, '..', 'public'))
})

describe('parseReference', () => {
  test('"Salmos 22:1" → bookText, chapter, verse', () => {
    expect(bs.parseReference('Salmos 22:1')).toEqual({
      bookText: 'Salmos', chapter: 22, verse: 1, verseEnd: null,
    })
  })
  test('"salmos 22 1" (espacio en vez de :) → chapter+verse', () => {
    expect(bs.parseReference('salmos 22 1')).toEqual({
      bookText: 'salmos', chapter: 22, verse: 1, verseEnd: null,
    })
  })
  test('"salmos 22:1-5" → rango verseEnd', () => {
    expect(bs.parseReference('salmos 22:1-5')).toEqual({
      bookText: 'salmos', chapter: 22, verse: 1, verseEnd: 5,
    })
  })
  test('"1 Juan 3:16" (libro con número)', () => {
    expect(bs.parseReference('1 Juan 3:16')).toEqual({
      bookText: '1 Juan', chapter: 3, verse: 16, verseEnd: null,
    })
  })
  test('"Juan" (solo libro)', () => {
    expect(bs.parseReference('Juan')).toEqual({
      bookText: 'Juan', chapter: null, verse: null, verseEnd: null,
    })
  })
  test('"" → todo null', () => {
    expect(bs.parseReference('')).toEqual({
      bookText: '', chapter: null, verse: null, verseEnd: null,
    })
  })
  test('null/undefined safe', () => {
    expect(bs.parseReference(null).bookText).toBe('')
    expect(bs.parseReference(undefined).bookText).toBe('')
  })
})

describe('bookmap', () => {
  test('alias cortos resuelven al canonical', () => {
    expect(BOOK_ALIASES['sal']).toBe('Salmos')
    expect(BOOK_ALIASES['gn']).toBe('Génesis')
    expect(BOOK_ALIASES['jn']).toBe('Juan')
    expect(BOOK_ALIASES['1co']).toBe('1 Corintios')
    expect(BOOK_ALIASES['flp']).toBe('Filipenses')
    expect(BOOK_ALIASES['ap']).toBe('Apocalipsis')
  })
  test('normalizeText quita tildes', () => {
    expect(normalizeText('Génesis')).toBe('genesis')
    expect(normalizeText('Éxodo')).toBe('exodo')
    expect(normalizeText('  Salmos  ')).toBe('salmos')
  })
})

describe('resolveBookName', () => {
  test('"genesis" → "Génesis"', () => {
    expect(bs.resolveBookName('genesis')).toBe('Génesis')
  })
  test('alias corto "sal" → "Salmos"', () => {
    expect(bs.resolveBookName('sal')).toBe('Salmos')
  })
  test('"xyz" → null', () => {
    expect(bs.resolveBookName('xyz')).toBeNull()
  })
})

describe('search: mode auto', () => {
  test('"Juan 3:16" → mode=ref con 1 resultado', () => {
    const r = bs.search({ q: 'Juan 3:16' })
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('ref')
    expect(r.results).toHaveLength(1)
    expect(r.results[0].reference).toBe('Juan 3:16')
    expect(r.results[0].text).toMatch(/Porque de tal manera/)
  })

  test('"amor" → mode=text con varios resultados', () => {
    const r = bs.search({ q: 'amor' })
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('text')
    expect(r.results.length).toBeGreaterThan(0)
    expect(r.count).toBe(r.results.length)
  })

  test('"Sal 23" alias corto → mode=ref', () => {
    const r = bs.search({ q: 'Sal 23' })
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('ref')
    expect(r.results[0].book).toBe('Salmos')
    expect(r.results[0].chapter).toBe(23)
  })

  test('rango 1-3 → texto combinado', () => {
    const r = bs.search({ q: 'Juan 3:16-17' })
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('ref')
    expect(r.results[0].verseEnd).toBe(17)
    expect(r.results[0].reference).toBe('Juan 3:16-17')
  })

  test('"Juan 99:1" → reference_not_found', () => {
    const r = bs.search({ q: 'Juan 99:1' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('reference_not_found')
  })

  test('q vacío → q_required', () => {
    const r = bs.search({ q: '' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('q_required')
  })

  test('q corto y no ref → q_too_short', () => {
    // "qz" no es alias de ningún libro y no tiene número → cae a fulltext y rebota.
    const r = bs.search({ q: 'qz' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('q_too_short')
  })

  test('limit acota resultados', () => {
    const r = bs.search({ q: 'amor', limit: 3 })
    expect(r.ok).toBe(true)
    expect(r.results.length).toBeLessThanOrEqual(3)
  })

  test('acentos tolerantes: "genesis 1:1" === "Génesis 1:1"', () => {
    const a = bs.search({ q: 'genesis 1:1' })
    const b = bs.search({ q: 'Génesis 1:1' })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(a.results[0].text).toBe(b.results[0].text)
  })
})

describe('loadVersion cache', () => {
  test('dos llamadas devuelven la misma referencia (no re-lee)', () => {
    const a = bs.loadVersion('rvr1960')
    const b = bs.loadVersion('rvr1960')
    expect(a).toBe(b)  // same reference → cache hit
    expect(a).not.toBeNull()
    expect(a.length).toBe(66)
  })

  test('versión desconocida cae al default', () => {
    const a = bs.loadVersion('zzz')
    const b = bs.loadVersion(bs.DEFAULT_VERSION)
    expect(a).toBe(b)
  })

  test('setRootDir inválido → null', () => {
    bs.setRootDir(path.join(__dirname, 'no-such-dir-xyz'))
    bs.__resetForTests()
    const v = bs.loadVersion('rvr1960')
    expect(v).toBeNull()
  })
})

describe('rate-limit', () => {
  test('permite hasta RATE_MAX, después 429', () => {
    bs.__resetRateLimitForTests()
    const id = 'dev-X'
    for (let i = 0; i < bs.RATE_MAX; i++) {
      expect(bs.checkRateLimit(id).allowed).toBe(true)
    }
    const r = bs.checkRateLimit(id)
    expect(r.allowed).toBe(false)
    expect(r.retryAfterMs).toBeGreaterThan(0)
    expect(r.retryAfterMs).toBeLessThanOrEqual(bs.RATE_WINDOW_MS)
  })

  test('devices distintos no se afectan entre sí', () => {
    bs.__resetRateLimitForTests()
    for (let i = 0; i < bs.RATE_MAX; i++) bs.checkRateLimit('A')
    expect(bs.checkRateLimit('A').allowed).toBe(false)
    expect(bs.checkRateLimit('B').allowed).toBe(true)
  })
})
