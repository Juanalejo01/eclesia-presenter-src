/**
 * slideTheme.test.js
 *
 * Cobertura de los helpers puros de slideTheme.js. Entorno: node (no
 * necesita DOM porque las funciones devuelven objetos planos de style).
 */
const {
  DEFAULT_THEME,
  mergeTheme,
  deriveBgStyle,
  deriveTextStyle,
  deriveReferenceStyle,
  classifySlide,
} = require('../src/services/slideTheme.js')

describe('mergeTheme', () => {
  test('1. undefined → DEFAULT_THEME completo', () => {
    const merged = mergeTheme(undefined)
    expect(merged).toEqual({ ...DEFAULT_THEME })
    // Y no es el mismo objeto (no muta DEFAULT_THEME)
    expect(merged).not.toBe(DEFAULT_THEME)
  })

  test('2. {} → DEFAULT_THEME completo', () => {
    expect(mergeTheme({})).toEqual({ ...DEFAULT_THEME })
  })

  test('3. partial con una clave → respeta partial y rellena defaults', () => {
    const m = mergeTheme({ fontColor: '#fff' })
    expect(m.fontColor).toBe('#fff')
    expect(m.bgType).toBe(DEFAULT_THEME.bgType)
    expect(m.fontFamily).toBe(DEFAULT_THEME.fontFamily)
  })

  test('4. claves extra → se ignoran (no se filtran al output)', () => {
    const m = mergeTheme({ extraKey: 'foo', another: 42 })
    expect(m).not.toHaveProperty('extraKey')
    expect(m).not.toHaveProperty('another')
  })

  test('5. valor null en partial → ignora y mantiene default', () => {
    const m = mergeTheme({ fontColor: null })
    expect(m.fontColor).toBe(DEFAULT_THEME.fontColor)
  })

  test('5b. valor undefined en partial → ignora y mantiene default', () => {
    const m = mergeTheme({ fontColor: undefined })
    expect(m.fontColor).toBe(DEFAULT_THEME.fontColor)
  })

  test('5c. partial no-objeto (number/string) → DEFAULT_THEME', () => {
    expect(mergeTheme(42)).toEqual({ ...DEFAULT_THEME })
    expect(mergeTheme('foo')).toEqual({ ...DEFAULT_THEME })
    expect(mergeTheme(null)).toEqual({ ...DEFAULT_THEME })
  })
})

describe('deriveBgStyle', () => {
  test('6. bgType solid → background = bgColor', () => {
    expect(deriveBgStyle({ bgType: 'solid', bgColor: '#abc' })).toEqual({
      background: '#abc',
    })
  })

  test('6b. bgType solid sin bgColor → fallback al default', () => {
    expect(deriveBgStyle({ bgType: 'solid', bgColor: null })).toEqual({
      background: DEFAULT_THEME.bgColor,
    })
  })

  test('7. bgType gradient → linear-gradient 135deg con los 2 colores', () => {
    expect(
      deriveBgStyle({ bgType: 'gradient', bgGradient: ['#1', '#2'] }),
    ).toEqual({
      background: 'linear-gradient(135deg, #1 0%, #2 100%)',
    })
  })

  test('7b. gradient con bgGradient inválido → fallback a defaults', () => {
    const r = deriveBgStyle({ bgType: 'gradient', bgGradient: ['solo-uno'] })
    expect(r.background).toContain('linear-gradient(135deg,')
    expect(r.background).toContain(DEFAULT_THEME.bgGradient[0])
    expect(r.background).toContain(DEFAULT_THEME.bgGradient[1])
  })

  test('8. bgType image → fallback al gradient (no descarga media)', () => {
    const r = deriveBgStyle({ bgType: 'image', bgImage: 'http://x.png' })
    expect(r.background).toContain('linear-gradient(135deg,')
  })

  test('8b. bgType video → fallback al gradient', () => {
    const r = deriveBgStyle({ bgType: 'video', bgVideo: 'http://x.mp4' })
    expect(r.background).toContain('linear-gradient(135deg,')
  })

  test('9. bgType transparent → patrón checkerboard', () => {
    const r = deriveBgStyle({ bgType: 'transparent' })
    expect(r.background).toContain('repeating-conic-gradient')
  })

  test('9b. bgType desconocido → default gradient', () => {
    const r = deriveBgStyle({ bgType: 'wat' })
    expect(r.background).toContain('linear-gradient(135deg,')
  })
})

describe('deriveTextStyle', () => {
  test('10. con container 300px → fontSize ≈ 14.0px (64/1920*300*1.4)', () => {
    const s = deriveTextStyle(DEFAULT_THEME, 300)
    // 64/1920*300*1.4 = 14.0
    expect(s.fontSize).toBe('14.0px')
    expect(s.fontFamily).toBe(DEFAULT_THEME.fontFamily)
    expect(s.color).toBe(DEFAULT_THEME.fontColor)
    expect(s.textAlign).toBe('center')
    expect(s.textShadow).toBe('none')
    expect(s.WebkitTextStroke).toBe('none')
  })

  test('10b. sin container (0) → usa fallback 360', () => {
    const s = deriveTextStyle(DEFAULT_THEME, 0)
    // 64/1920 * 360 * 1.4 = 16.8
    expect(s.fontSize).toBe('16.8px')
  })

  test('10c. containerW undefined → usa fallback 360', () => {
    const s = deriveTextStyle(DEFAULT_THEME, undefined)
    expect(s.fontSize).toBe('16.8px')
  })

  test('10d. strokeWidth > 0 → WebkitTextStroke con px escalado', () => {
    const s = deriveTextStyle({ strokeWidth: 4, strokeColor: '#f00' }, 1920)
    // 4/1920 * 1920 * 1.4 = 5.6
    expect(s.WebkitTextStroke).toBe('5.6px #f00')
  })

  test('10e. textShadow=true → shadow CSS', () => {
    const s = deriveTextStyle({ textShadow: true }, 300)
    expect(s.textShadow).toContain('rgba(0,0,0')
  })

  test('10f. paddingLeft/Right = textMargin como % de 1920', () => {
    const s = deriveTextStyle({ textMargin: 192 }, 300)
    // 192/1920 = 10%
    expect(s.paddingLeft).toBe('10.00%')
    expect(s.paddingRight).toBe('10.00%')
  })
})

describe('classifySlide', () => {
  test('11. null → empty', () => {
    expect(classifySlide(null)).toBe('empty')
  })

  test('11b. undefined → empty', () => {
    expect(classifySlide(undefined)).toBe('empty')
  })

  test('12. type=blackout → blackout', () => {
    expect(classifySlide({ type: 'blackout' })).toBe('blackout')
  })

  test('13. type=blank sin texto → blank', () => {
    expect(classifySlide({ type: 'blank' })).toBe('blank')
  })

  test('13b. type=blank con texto → content (caso raro pero respeta texto)', () => {
    expect(classifySlide({ type: 'blank', text: 'algo' })).toBe('content')
  })

  test('14. con texto → content', () => {
    expect(classifySlide({ text: 'hola' })).toBe('content')
  })

  test('14b. solo reference → content', () => {
    expect(classifySlide({ reference: 'Juan 3:16' })).toBe('content')
  })

  test('14c. objeto vacío → empty', () => {
    expect(classifySlide({})).toBe('empty')
  })
})

describe('deriveReferenceStyle', () => {
  test('15. referenceVisible=false → null', () => {
    expect(deriveReferenceStyle({ referenceVisible: false }, 300)).toBeNull()
  })

  test('15b. visible md → fontSize = base * 0.25', () => {
    // base = 64/1920*300*1.4 = 14.0, ratio md = 0.25 → 3.5
    const r = deriveReferenceStyle(DEFAULT_THEME, 300)
    expect(r.fontSize).toBe('3.5px')
    expect(r.color).toBe(DEFAULT_THEME.referenceColor)
    expect(r.textTransform).toBe('uppercase')
  })

  test('15c. referenceSize xl → ratio 0.50', () => {
    // base = 14.0, ratio xl = 0.5 → 7.0
    const r = deriveReferenceStyle({ referenceSize: 'xl' }, 300)
    expect(r.fontSize).toBe('7.0px')
  })

  test('15d. referenceUppercase=false → none', () => {
    const r = deriveReferenceStyle({ referenceUppercase: false }, 300)
    expect(r.textTransform).toBe('none')
  })

  test('15e. referenceSize desconocido → fallback md', () => {
    const r = deriveReferenceStyle({ referenceSize: 'xxxl' }, 300)
    // base 14.0 * 0.25 = 3.5
    expect(r.fontSize).toBe('3.5px')
  })
})
