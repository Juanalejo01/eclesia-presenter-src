// Tests para src/renderer/services/songSplit.js
//
// Por qué importa: el auto-split de canciones es lo que diferencia
// EclesiaPresenter de PowerPoint. Si un verso de 8 líneas no se parte
// en 2 sub-slides, se proyecta cortado en pantalla. Es el algoritmo
// más crítico del módulo de canciones.

import { splitText, songToSlides } from '../src/renderer/services/songSplit.js'

describe('splitText', () => {
  test('devuelve array vacío para input falsy', () => {
    expect(splitText('')).toEqual([])
    expect(splitText(null)).toEqual([])
    expect(splitText(undefined)).toEqual([])
  })

  test('texto corto cabe en un solo chunk', () => {
    const result = splitText('Linea 1\nLinea 2')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Linea 1\nLinea 2')
  })

  test('parte texto que excede maxLines (4 por defecto)', () => {
    const text = 'L1\nL2\nL3\nL4\nL5\nL6'
    const result = splitText(text)
    expect(result.length).toBeGreaterThanOrEqual(2)
    // El primer chunk debe tener exactamente 4 líneas no vacías
    expect(result[0].split('\n').filter(l => l.length > 0)).toHaveLength(4)
  })

  test('respeta maxLines custom', () => {
    const text = 'A\nB\nC\nD\nE\nF'
    const result = splitText(text, { maxLines: 2 })
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('A\nB')
    expect(result[1]).toBe('C\nD')
    expect(result[2]).toBe('E\nF')
  })

  test('parte por maxChars cuando una línea es muy larga', () => {
    const longLine = 'a'.repeat(250)
    const text = `${longLine}\n${longLine}`
    const result = splitText(text, { maxChars: 220 })
    // 250 char por línea, max 220 → cada línea va en su chunk
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  test('las líneas en blanco no cuentan hacia maxLines (son separadores)', () => {
    // 3 líneas no vacías intercaladas con vacías → entran en un solo chunk
    const text = 'L1\n\nL2\n\nL3'
    const result = splitText(text, { maxLines: 4 })
    expect(result).toHaveLength(1)
  })

  test('trim de espacios al inicio/final de cada línea', () => {
    const text = '  hola  \n  mundo  '
    const result = splitText(text)
    expect(result[0]).toBe('hola\nmundo')
  })
})

describe('songToSlides', () => {
  test('canción sin secciones devuelve array vacío', () => {
    expect(songToSlides(null)).toEqual([])
    expect(songToSlides({})).toEqual([])
    expect(songToSlides({ sections: [] })).toEqual([])
  })

  test('canción con 1 sección corta genera 1 slide', () => {
    const song = {
      title: 'Grande Es Tu Fidelidad',
      sections: [
        { label: 'Verso 1', type: 'verse', text: 'Grande es tu fidelidad' },
      ],
    }
    const slides = songToSlides(song)
    expect(slides).toHaveLength(1)
    expect(slides[0]).toMatchObject({
      text: 'Grande es tu fidelidad',
      reference: 'Grande Es Tu Fidelidad · Verso 1',
      type: 'song',
      sectionIndex: 0,
      partIndex: 0,
      partTotal: 1,
      sectionType: 'verse',
      sectionLabel: 'Verso 1',
    })
  })

  test('sección larga genera múltiples sub-slides con (n/total) en la referencia', () => {
    const longText = Array(8).fill('Linea').join('\n')  // 8 líneas → 2 chunks de 4
    const song = {
      title: 'Test',
      sections: [{ label: 'Verso', type: 'verse', text: longText }],
    }
    const slides = songToSlides(song)
    expect(slides.length).toBeGreaterThanOrEqual(2)
    expect(slides[0].reference).toMatch(/\(1\/\d+\)/)
    expect(slides[0].partTotal).toBe(slides.length)
  })

  test('múltiples secciones generan slides con sectionIndex correcto', () => {
    const song = {
      title: 'X',
      sections: [
        { label: 'V1', type: 'verse', text: 'A' },
        { label: 'Coro', type: 'chorus', text: 'B' },
        { label: 'V2', type: 'verse', text: 'C' },
      ],
    }
    const slides = songToSlides(song)
    expect(slides).toHaveLength(3)
    expect(slides[0].sectionIndex).toBe(0)
    expect(slides[1].sectionIndex).toBe(1)
    expect(slides[2].sectionIndex).toBe(2)
    expect(slides[1].sectionType).toBe('chorus')
  })
})
