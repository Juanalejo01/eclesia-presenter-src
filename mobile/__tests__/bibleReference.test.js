/**
 * Tests del parser local de referencias.
 */
const { parseReference, normalizeText, looksLikeReference } = require('../src/services/bibleReference.js')

describe('parseReference', () => {
  test('"Salmos 22:1"', () => {
    expect(parseReference('Salmos 22:1')).toEqual({
      bookText: 'Salmos', chapter: 22, verse: 1, verseEnd: null,
    })
  })
  test('"salmos 22 1" (espacio)', () => {
    expect(parseReference('salmos 22 1').verse).toBe(1)
    expect(parseReference('salmos 22 1').chapter).toBe(22)
  })
  test('"salmos 22:1-5" (rango)', () => {
    expect(parseReference('salmos 22:1-5').verseEnd).toBe(5)
  })
  test('"1 Juan 3:16"', () => {
    expect(parseReference('1 Juan 3:16').bookText).toBe('1 Juan')
  })
  test('"Juan" sin números', () => {
    expect(parseReference('Juan').chapter).toBeNull()
  })
  test('vacío', () => {
    expect(parseReference('')).toEqual({
      bookText: '', chapter: null, verse: null, verseEnd: null,
    })
  })
  test('null safe', () => {
    expect(parseReference(null).bookText).toBe('')
    expect(parseReference(undefined).bookText).toBe('')
  })
})

describe('normalizeText', () => {
  test('quita tildes y baja a minúsculas', () => {
    expect(normalizeText('Génesis')).toBe('genesis')
    expect(normalizeText('ÉXODO')).toBe('exodo')
  })
  test('null safe', () => {
    expect(normalizeText(null)).toBe('')
  })
})

describe('looksLikeReference', () => {
  test('"Juan 3:16" → true', () => {
    expect(looksLikeReference('Juan 3:16')).toBe(true)
  })
  test('"amor de dios" → false (sin número final)', () => {
    expect(looksLikeReference('amor de dios')).toBe(false)
  })
  test('"" → false', () => {
    expect(looksLikeReference('')).toBe(false)
  })
})
