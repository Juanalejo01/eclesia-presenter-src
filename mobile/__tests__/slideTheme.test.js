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
    // Usamos hex válidos (3 dígitos cumplen el regex de _isValidColor).
    expect(
      deriveBgStyle({ bgType: 'gradient', bgGradient: ['#abc', '#def'] }),
    ).toEqual({
      background: 'linear-gradient(135deg, #abc 0%, #def 100%)',
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

describe('mergeTheme — security & coercion', () => {
  test('16. CSS injection en bgColor → rechazado, queda default', () => {
    const m = mergeTheme({ bgColor: 'red; background-image: url(https://evil/) //' })
    expect(m.bgColor).toBe(DEFAULT_THEME.bgColor)
  })

  test('16b. url() solo → rechazado', () => {
    const m = mergeTheme({ bgColor: 'url(https://evil/x.png)' })
    expect(m.bgColor).toBe(DEFAULT_THEME.bgColor)
  })

  test('16c. expression() rechazado', () => {
    const m = mergeTheme({ fontColor: 'expression(alert(1))' })
    expect(m.fontColor).toBe(DEFAULT_THEME.fontColor)
  })

  test('16d. var() rechazado (no aceptamos indirección)', () => {
    const m = mergeTheme({ bgColor: 'var(--evil)' })
    expect(m.bgColor).toBe(DEFAULT_THEME.bgColor)
  })

  test('16e. newline en color rechazado', () => {
    const m = mergeTheme({ bgColor: '#fff\nbackground: red' })
    expect(m.bgColor).toBe(DEFAULT_THEME.bgColor)
  })

  test('17. CSS injection en bgGradient → todo el array rechazado', () => {
    const m = mergeTheme({
      bgGradient: ['red; background-image: url(https://evil/)', '#000'],
    })
    // bgGradient queda igual a defaults (rechazo de TODO el array,
    // no aceptación parcial — la regla es estricta).
    expect(m.bgGradient).toEqual([
      DEFAULT_THEME.bgGradient[0],
      DEFAULT_THEME.bgGradient[1],
    ])
  })

  test('17b. bgGradient array con 1 solo color → rechazado', () => {
    const m = mergeTheme({ bgGradient: ['#fff'] })
    expect(m.bgGradient).toEqual([
      DEFAULT_THEME.bgGradient[0],
      DEFAULT_THEME.bgGradient[1],
    ])
  })

  test('17c. bgGradient válido → copia (no referencia compartida)', () => {
    const input = ['#abcdef', '#123456']
    const m = mergeTheme({ bgGradient: input })
    expect(m.bgGradient).toEqual(input)
    expect(m.bgGradient).not.toBe(input) // copia, no ref
  })

  test('18. CSS injection en fontFamily → rechazado', () => {
    const m = mergeTheme({ fontFamily: 'Arial; expression(alert(1))' })
    expect(m.fontFamily).toBe(DEFAULT_THEME.fontFamily)
  })

  test('18b. fontFamily con url() rechazado', () => {
    const m = mergeTheme({ fontFamily: 'Arial, url(https://evil/x.woff)' })
    expect(m.fontFamily).toBe(DEFAULT_THEME.fontFamily)
  })

  test('18c. fontFamily válido aceptado', () => {
    const m = mergeTheme({ fontFamily: '"Open Sans", sans-serif' })
    expect(m.fontFamily).toBe('"Open Sans", sans-serif')
  })

  test('19. fontSize string no numérico → default (NaN rechazado)', () => {
    const m = mergeTheme({ fontSize: 'evil' })
    expect(m.fontSize).toBe(DEFAULT_THEME.fontSize)
  })

  test('19b. fontSize NaN → default', () => {
    const m = mergeTheme({ fontSize: NaN })
    expect(m.fontSize).toBe(DEFAULT_THEME.fontSize)
  })

  test('19c. fontSize Infinity → default', () => {
    const m = mergeTheme({ fontSize: Infinity })
    expect(m.fontSize).toBe(DEFAULT_THEME.fontSize)
  })

  test('19d. fontSize negativo → clamp al min 8', () => {
    const m = mergeTheme({ fontSize: -10 })
    expect(m.fontSize).toBe(8)
  })

  test('19e. fontSize muy grande → clamp al max 400', () => {
    const m = mergeTheme({ fontSize: 9999 })
    expect(m.fontSize).toBe(400)
  })

  test('19f. fontSize string numérico → coerce + acepta', () => {
    const m = mergeTheme({ fontSize: '72' })
    expect(m.fontSize).toBe(72)
  })

  test('20. textMargin negativo → clamp a 0', () => {
    const m = mergeTheme({ textMargin: -1000 })
    expect(m.textMargin).toBe(0)
  })

  test('20b. strokeWidth negativo → clamp a 0', () => {
    const m = mergeTheme({ strokeWidth: -5 })
    expect(m.strokeWidth).toBe(0)
  })

  test('20c. letterSpacing fuera de rango → clamp', () => {
    expect(mergeTheme({ letterSpacing: -10 }).letterSpacing).toBe(-0.5)
    expect(mergeTheme({ letterSpacing: 50 }).letterSpacing).toBe(2)
  })

  test('20d. fontWeight fuera de rango → clamp', () => {
    expect(mergeTheme({ fontWeight: 50 }).fontWeight).toBe(100)
    expect(mergeTheme({ fontWeight: 1500 }).fontWeight).toBe(900)
  })

  test('21. bgType inválido → default', () => {
    const m = mergeTheme({ bgType: 'evil-injection' })
    expect(m.bgType).toBe(DEFAULT_THEME.bgType)
  })

  test('21b. textAlign inválido → default', () => {
    const m = mergeTheme({ textAlign: 'justify; url(x)' })
    expect(m.textAlign).toBe(DEFAULT_THEME.textAlign)
  })

  test('21c. referenceSize inválido → default', () => {
    const m = mergeTheme({ referenceSize: 'xxl' })
    expect(m.referenceSize).toBe(DEFAULT_THEME.referenceSize)
  })

  test('22. textShadow no-boolean → default', () => {
    const m = mergeTheme({ textShadow: 'true' })
    expect(m.textShadow).toBe(DEFAULT_THEME.textShadow)
  })

  test('22b. referenceVisible no-boolean → default', () => {
    const m = mergeTheme({ referenceVisible: 1 })
    expect(m.referenceVisible).toBe(DEFAULT_THEME.referenceVisible)
  })

  test('23. bgImage URL válida https → aceptada', () => {
    const m = mergeTheme({ bgImage: 'https://cdn.example/x.png' })
    expect(m.bgImage).toBe('https://cdn.example/x.png')
  })

  test('23b. bgImage url() injection rechazada', () => {
    const m = mergeTheme({ bgImage: 'https://x.com/) ; url(evil' })
    expect(m.bgImage).toBe(DEFAULT_THEME.bgImage)
  })

  test('23c. bgImage javascript: rechazada', () => {
    const m = mergeTheme({ bgImage: 'javascript:alert(1)' })
    expect(m.bgImage).toBe(DEFAULT_THEME.bgImage)
  })

  test('24. rgb() válido aceptado', () => {
    const m = mergeTheme({ bgColor: 'rgb(255, 0, 0)' })
    expect(m.bgColor).toBe('rgb(255, 0, 0)')
  })

  test('24b. rgba() válido aceptado', () => {
    const m = mergeTheme({ bgColor: 'rgba(0,0,0,0.5)' })
    expect(m.bgColor).toBe('rgba(0,0,0,0.5)')
  })

  test('24c. rgb con paréntesis sin cerrar → rechazado', () => {
    const m = mergeTheme({ bgColor: 'rgb(255, 0, 0' })
    expect(m.bgColor).toBe(DEFAULT_THEME.bgColor)
  })

  test('25. DEFAULT_THEME.bgGradient es array frozen — mutar lanza', () => {
    expect(() => DEFAULT_THEME.bgGradient.push('#fff')).toThrow(TypeError)
  })

  test('25b. DEFAULT_THEME es frozen — mutar lanza', () => {
    expect(() => { DEFAULT_THEME.fontSize = 99 }).toThrow(TypeError)
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
