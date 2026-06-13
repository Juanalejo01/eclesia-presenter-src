// Tests para src/renderer/services/songCanvas.js
//
// El editor de canciones escribe TODA la letra en un lienzo único:
//   - línea en blanco (doble Enter) = nuevo slide/sección
//   - línea que empieza por "#" = etiqueta de sección (Coro, Estrofa...)
// Este módulo convierte lienzo ⇄ sections[{type, label, text}] (el modelo
// que ya consumen songToSlides, la BD y el mobile) y detecta el contexto
// "#" bajo el caret para el autocompletado.

import {
  parseCanvas, sectionsToCanvas, typeFromLabel, getHashContext,
  SECTION_SUGGESTIONS,
} from '../src/renderer/services/songCanvas.js'

describe('typeFromLabel', () => {
  test('aliases en español resuelven al type canónico', () => {
    expect(typeFromLabel('Estrofa')).toBe('verse')
    expect(typeFromLabel('Coro')).toBe('chorus')
    expect(typeFromLabel('Estribillo')).toBe('chorus')
    expect(typeFromLabel('Puente')).toBe('bridge')
    expect(typeFromLabel('Intro')).toBe('intro')
    expect(typeFromLabel('Final')).toBe('outro')
    expect(typeFromLabel('Tag')).toBe('tag')
  })
  test('case/acentos-insensible y con número final', () => {
    expect(typeFromLabel('CORO')).toBe('chorus')
    expect(typeFromLabel('estrofa 2')).toBe('verse')
    expect(typeFromLabel('Coro 2')).toBe('chorus')
  })
  test('primera palabra como fallback ("Coro final" → chorus)', () => {
    expect(typeFromLabel('Coro final')).toBe('chorus')
  })
  test('desconocido → null', () => {
    expect(typeFromLabel('Especial')).toBeNull()
    expect(typeFromLabel('')).toBeNull()
  })
})

describe('parseCanvas', () => {
  test('vacío → []', () => {
    expect(parseCanvas('')).toEqual([])
    expect(parseCanvas(null)).toEqual([])
    expect(parseCanvas('   \n  \n')).toEqual([])
  })

  test('bloques separados por línea en blanco → secciones verse auto-numeradas', () => {
    const out = parseCanvas('A1\nA2\n\nB1\nB2')
    expect(out).toEqual([
      { type: 'verse', label: 'Estrofa 1', text: 'A1\nA2' },
      { type: 'verse', label: 'Estrofa 2', text: 'B1\nB2' },
    ])
  })

  test('varias líneas en blanco seguidas cuentan como UN separador', () => {
    expect(parseCanvas('A\n\n\n\nB')).toHaveLength(2)
  })

  test('encabezado #Coro etiqueta el bloque siguiente', () => {
    const out = parseCanvas('#Coro\nSanto, santo')
    expect(out).toEqual([{ type: 'chorus', label: 'Coro', text: 'Santo, santo' }])
  })

  test('encabezado en minúsculas se capitaliza, type por alias', () => {
    const out = parseCanvas('#estribillo\nLa la la')
    expect(out).toEqual([{ type: 'chorus', label: 'Estribillo', text: 'La la la' }])
  })

  test('etiqueta desconocida → type verse, label se respeta', () => {
    const out = parseCanvas('#Especial\nTexto')
    expect(out).toEqual([{ type: 'verse', label: 'Especial', text: 'Texto' }])
  })

  test('un encabezado se hereda en bloques siguientes sin "#" (doble enter = otro slide del mismo coro)', () => {
    const out = parseCanvas('#Coro\nParte 1\n\nParte 2')
    expect(out).toEqual([
      { type: 'chorus', label: 'Coro', text: 'Parte 1' },
      { type: 'chorus', label: 'Coro', text: 'Parte 2' },
    ])
  })

  test('encabezado a mitad de bloque cierra la sección anterior', () => {
    const out = parseCanvas('Verso uno\n#Coro\nEl coro')
    expect(out).toEqual([
      { type: 'verse', label: 'Estrofa 1', text: 'Verso uno' },
      { type: 'chorus', label: 'Coro', text: 'El coro' },
    ])
  })

  test('mezcla completa: estrofas auto + coro + puente', () => {
    const out = parseCanvas('A\n\n#Coro\nB\n\n#Puente\nC\n\n#Estrofa 2\nD')
    expect(out.map(s => [s.type, s.label])).toEqual([
      ['verse', 'Estrofa 1'],
      ['chorus', 'Coro'],
      ['bridge', 'Puente'],
      ['verse', 'Estrofa 2'],
    ])
  })

  test('"#" solo (sin etiqueta) no genera basura: el bloque sale como verse auto', () => {
    const out = parseCanvas('#\nTexto')
    expect(out).toEqual([{ type: 'verse', label: 'Estrofa 1', text: 'Texto' }])
  })

  test('normaliza \\r\\n y espacios alrededor del encabezado', () => {
    const out = parseCanvas('  #Coro  \r\nLínea\r\n')
    expect(out).toEqual([{ type: 'chorus', label: 'Coro', text: 'Línea' }])
  })

  test('encabezado sin letra debajo no produce sección vacía', () => {
    const out = parseCanvas('#Coro\n\n#Puente\nAlgo')
    expect(out).toEqual([{ type: 'bridge', label: 'Puente', text: 'Algo' }])
  })
})

describe('sectionsToCanvas', () => {
  test('vacío → ""', () => {
    expect(sectionsToCanvas([])).toBe('')
    expect(sectionsToCanvas(null)).toBe('')
  })

  test('serializa con encabezado por sección y línea en blanco entre bloques', () => {
    const text = sectionsToCanvas([
      { type: 'verse', label: 'Estrofa 1', text: 'A\nB' },
      { type: 'chorus', label: 'Coro', text: 'C' },
    ])
    expect(text).toBe('#Estrofa 1\nA\nB\n\n#Coro\nC')
  })

  test('sección sin label usa el nombre canónico del type', () => {
    expect(sectionsToCanvas([{ type: 'chorus', label: '', text: 'X' }]))
      .toBe('#Coro\nX')
  })

  test('round-trip: parse(serialize(sections)) preserva type/label/text', () => {
    const sections = [
      { type: 'verse', label: 'Estrofa 1', text: 'Línea 1\nLínea 2' },
      { type: 'chorus', label: 'Coro', text: 'El coro' },
      { type: 'bridge', label: 'Puente', text: 'El puente' },
      { type: 'outro', label: 'Final', text: 'Fin' },
    ]
    expect(parseCanvas(sectionsToCanvas(sections))).toEqual(sections)
  })
})

describe('getHashContext', () => {
  test('"#" al inicio del texto abre contexto con query vacía', () => {
    expect(getHashContext('#', 1)).toEqual({ start: 0, query: '' })
  })
  test('"#co" al inicio de línea → query parcial', () => {
    expect(getHashContext('hola\n#co', 8)).toEqual({ start: 5, query: 'co' })
  })
  test('caret a mitad de la query solo toma lo anterior', () => {
    expect(getHashContext('#coro\nx', 3)).toEqual({ start: 0, query: 'co' })
  })
  test('"#" que no inicia línea → null (no es encabezado)', () => {
    expect(getHashContext('la #co', 6)).toBeNull()
  })
  test('admite espacios antes del "#"', () => {
    expect(getHashContext('  #p', 4)).toEqual({ start: 2, query: 'p' })
  })
  test('sin "#" en la línea → null', () => {
    expect(getHashContext('', 0)).toBeNull()
    expect(getHashContext('coro', 4)).toBeNull()
  })
})

describe('SECTION_SUGGESTIONS', () => {
  test('incluye las partes típicas y todas resuelven su propio type', () => {
    const labels = SECTION_SUGGESTIONS.map(s => s.label)
    expect(labels).toEqual(expect.arrayContaining(['Estrofa', 'Coro', 'Estribillo', 'Puente', 'Intro', 'Final']))
    for (const s of SECTION_SUGGESTIONS) {
      expect(typeFromLabel(s.label)).toBe(s.type)
    }
  })
})
