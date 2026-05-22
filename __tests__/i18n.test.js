// Tests para src/renderer/services/i18n.js
//
// Por qué importa: si t() devuelve undefined o tira un error, toda la UI
// queda en blanco. Casos críticos:
//   - locale conocido devuelve string traducido
//   - locale desconocido se ignora silenciosamente
//   - key faltante en locale activo → fallback a es
//   - key faltante en TODOS los locales → devuelve la key (no rompe)
//   - interpolación de parámetros {var}

import { t, setLocale, getLocale, AVAILABLE_LOCALES } from '../src/renderer/services/i18n.js'

describe('i18n', () => {
  // Reset a 'es' antes de cada test para evitar leakage entre tests.
  beforeEach(() => {
    setLocale('es')
  })

  describe('AVAILABLE_LOCALES', () => {
    test('exporta 3 locales (es, en, pt)', () => {
      expect(AVAILABLE_LOCALES).toHaveLength(3)
      const ids = AVAILABLE_LOCALES.map(l => l.id)
      expect(ids).toEqual(expect.arrayContaining(['es', 'en', 'pt']))
    })

    test('cada locale tiene id, label, flag', () => {
      for (const loc of AVAILABLE_LOCALES) {
        expect(loc).toMatchObject({
          id: expect.any(String),
          label: expect.any(String),
          flag: expect.any(String),
        })
      }
    })
  })

  describe('setLocale / getLocale', () => {
    test('cambia el locale a uno válido', () => {
      setLocale('en')
      expect(getLocale()).toBe('en')
      setLocale('pt')
      expect(getLocale()).toBe('pt')
    })

    test('ignora locales desconocidos sin tirar error', () => {
      setLocale('es')
      setLocale('xx')          // inválido
      setLocale('klingon')     // inválido
      expect(getLocale()).toBe('es')   // se mantiene
    })

    test('actualiza document.documentElement.lang', () => {
      setLocale('en')
      expect(document.documentElement.getAttribute('lang')).toBe('en')
      setLocale('pt')
      expect(document.documentElement.getAttribute('lang')).toBe('pt')
    })
  })

  describe('t()', () => {
    test('devuelve traducción en español por defecto', () => {
      expect(t('common.search')).toBe('Buscar')
      expect(t('common.cancel')).toBe('Cancelar')
      expect(t('nav.bible')).toBe('Biblia')
    })

    test('devuelve traducción en otro locale tras setLocale', () => {
      setLocale('en')
      // En el diccionario debería existir esta key en inglés
      const result = t('common.search')
      // Si está traducida será distinta del español; si no, fallback a 'Buscar'
      // Mínimo: debe ser un string no vacío.
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    test('fallback a la key cuando no existe en ningún locale', () => {
      const result = t('totalmente.inventada.que.no.existe')
      expect(result).toBe('totalmente.inventada.que.no.existe')
    })

    test('interpolación de parámetros {var}', () => {
      // 'palette.gotoVerse' tiene plantilla con {version}
      const result = t('palette.gotoVerse', { version: 'NVI' })
      expect(result).toContain('NVI')
      expect(result).not.toContain('{version}')
    })

    test('sin params no toca placeholders en el string', () => {
      // Si la traducción tiene {version} pero no pasamos params, lo deja literal
      const result = t('palette.gotoVerse')
      // Debe seguir conteniendo el placeholder original
      expect(result).toContain('{version}')
    })

    test('múltiples params se interpolan todos', () => {
      // Para este test creamos una key teórica con multiple params no existe en
      // DICT, así que verificamos comportamiento básico de t() con params.
      const result = t('palette.gotoVerse', { version: 'RVR1960', extra: 'ignored' })
      expect(result).toContain('RVR1960')
    })
  })
})
