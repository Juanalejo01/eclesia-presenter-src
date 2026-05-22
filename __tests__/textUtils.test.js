// Tests para src/renderer/services/textUtils.js
//
// Por qué importan: normalizeText() es la base de TODAS las búsquedas en
// la app (biblia, canciones, lista del día). Un bug aquí rompe el feature
// más usado del producto. Coverage 100% de funciones puras.

import { normalizeText, matches, toUpper } from '../src/renderer/services/textUtils.js'

describe('normalizeText', () => {
  test('devuelve string vacío para falsy', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText('')).toBe('')
    expect(normalizeText(0)).toBe('')  // 0 es falsy
  })

  test('convierte a minúsculas', () => {
    expect(normalizeText('Génesis')).toBe('genesis')
    expect(normalizeText('SALMOS')).toBe('salmos')
  })

  test('elimina acentos / diacríticos (NFD + strip)', () => {
    expect(normalizeText('canción')).toBe('cancion')
    expect(normalizeText('Éxodo')).toBe('exodo')
    expect(normalizeText('está')).toBe('esta')
    expect(normalizeText('niño')).toBe('nino')  // tilde de ñ se elimina
  })

  test('elimina signos de puntuación', () => {
    expect(normalizeText('¿Cómo?')).toBe('como')
    expect(normalizeText('¡Hola!')).toBe('hola')
    expect(normalizeText('Juan 3:16.')).toBe('juan 316')
  })

  test('colapsa whitespace múltiple', () => {
    expect(normalizeText('hola   mundo')).toBe('hola mundo')
    expect(normalizeText('  espacios  ')).toBe('espacios')
    expect(normalizeText('\ttabs\nlineas')).toBe('tabs lineas')
  })

  test('combinación realista — uso típico para búsqueda', () => {
    // Usuario escribe "como esta" y debe matchear "¿Cómo está?"
    expect(normalizeText('¿Cómo está?')).toBe('como esta')
    // Buscar "salmos 23" debe matchear "Salmos 23:1"
    expect(normalizeText('Salmos 23:1')).toBe('salmos 231')
  })
})

describe('matches', () => {
  test('needle vacío devuelve true (= sin filtro)', () => {
    expect(matches('cualquier cosa', '')).toBe(true)
    expect(matches('algo', null)).toBe(true)
    expect(matches('algo', undefined)).toBe(true)
  })

  test('busca normalizado en ambos lados', () => {
    expect(matches('Génesis 1:1', 'genesis')).toBe(true)
    expect(matches('Génesis 1:1', 'GENESIS')).toBe(true)
    expect(matches('Génesis 1:1', 'génesis')).toBe(true)
  })

  test('no encuentra coincidencias inexistentes', () => {
    expect(matches('Génesis', 'apocalipsis')).toBe(false)
  })

  test('busca substring (no requiere coincidencia completa)', () => {
    expect(matches('Salmos 23:1-6', 'salmos 23')).toBe(true)
    expect(matches('Reina-Valera 1960', 'valera')).toBe(true)
  })
})

describe('toUpper', () => {
  test('convierte a mayúsculas', () => {
    expect(toUpper('hola')).toBe('HOLA')
    expect(toUpper('Sé Tú')).toBe('SÉ TÚ')
  })

  test('maneja valores falsy', () => {
    expect(toUpper(null)).toBe('')
    expect(toUpper(undefined)).toBe('')
    expect(toUpper('')).toBe('')
  })

  test('preserva saltos de línea (no los normaliza)', () => {
    expect(toUpper('linea1\nlinea2')).toBe('LINEA1\nLINEA2')
  })
})
