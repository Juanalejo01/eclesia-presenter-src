const { sanitizeTheme, isNearBlack } = require('../src/main/themeSanitize')

// Default "bueno" (coincide con defaultTheme() de projection.js)
const DEFAULTS = {
  bgType: 'gradient', bgColor: '#0a1620', bgGradient: ['#0a1620', '#1e3a5f'],
  fontColor: '#ffffff', fontSize: 64,
}

// Theme REAL del usuario que daba "pantalla negra" (leído de su disco):
//   degradado casi-negro + bgColor negro + vídeo huérfano + Impact 115.
const USER_BAD_THEME = {
  bgType: 'gradient', bgColor: '#000000', bgGradient: ['#122324', '#804012'],
  bgImage: null, bgVideo: 'preset://loop-33975185.mp4',
  fontFamily: 'Impact', fontSize: 115, fontColor: '#ffffff',
}

describe('isNearBlack', () => {
  test('detecta negros y casi-negros, no colores oscuros con tono', () => {
    expect(isNearBlack('#000000')).toBe(true)
    expect(isNearBlack('#050505')).toBe(true)
    expect(isNearBlack('#122324')).toBe(false) // teal oscuro (suma 89) -> no negro
    expect(isNearBlack('#804012')).toBe(false) // marrón
    expect(isNearBlack('#ffffff')).toBe(false)
    expect(isNearBlack(null)).toBe(false)
    expect(isNearBlack('rgba(0,0,0,1)')).toBe(false) // no es #hex de 6
  })
})

describe('sanitizeTheme — theme real del usuario', () => {
  test('limpia el vídeo huérfano y respeta su degradado (con tono marrón)', () => {
    const out = sanitizeTheme(USER_BAD_THEME, DEFAULTS)
    expect(out.bgVideo).toBeNull()                  // huérfano (bgType gradient) -> limpiado
    expect(out.bgType).toBe('gradient')
    expect(out.bgGradient).toEqual(['#122324', '#804012'])
    expect(out.fontColor).toBe('#ffffff')
    expect(out.fontSize).toBe(115)                  // elección del usuario respetada
  })
})

describe('sanitizeTheme — recuperación de fondos negros/rotos', () => {
  test('degradado AMBOS-negros -> default', () => {
    const out = sanitizeTheme({ bgType: 'gradient', bgGradient: ['#000000', '#050505'] }, DEFAULTS)
    expect(out.bgGradient).toEqual(['#0a1620', '#1e3a5f'])
  })
  test('sólido casi-negro -> degradado por defecto', () => {
    expect(sanitizeTheme({ bgType: 'solid', bgColor: '#000000' }, DEFAULTS).bgType).toBe('gradient')
    expect(sanitizeTheme({ bgType: 'solid', bgColor: '#050402' }, DEFAULTS).bgType).toBe('gradient')
  })
  test('imagen/vídeo sin archivo -> default', () => {
    expect(sanitizeTheme({ bgType: 'image', bgImage: null }, DEFAULTS).bgType).toBe('gradient')
    expect(sanitizeTheme({ bgType: 'video', bgVideo: null }, DEFAULTS).bgType).toBe('gradient')
  })
  test('repara fontColor/fontSize ausentes', () => {
    const out = sanitizeTheme({ bgType: 'gradient', bgGradient: ['#0a1620', '#1e3a5f'] }, DEFAULTS)
    expect(out.fontColor).toBe('#ffffff')
    expect(out.fontSize).toBe(64)
  })
})

describe('sanitizeTheme — respeta elecciones válidas', () => {
  test('sólido gris con texto blanco se mantiene', () => {
    const out = sanitizeTheme({ bgType: 'solid', bgColor: '#333333', fontColor: '#ffffff', fontSize: 64 }, DEFAULTS)
    expect(out.bgType).toBe('solid')
    expect(out.bgColor).toBe('#333333')
  })
  test('imagen/vídeo válidos se mantienen (y se limpia la media del otro tipo)', () => {
    const img = sanitizeTheme({ bgType: 'image', bgImage: 'media://x.jpg', bgVideo: 'preset://y.mp4', fontColor: '#fff', fontSize: 64 }, DEFAULTS)
    expect(img.bgType).toBe('image')
    expect(img.bgImage).toBe('media://x.jpg')
    expect(img.bgVideo).toBeNull()
  })
})
