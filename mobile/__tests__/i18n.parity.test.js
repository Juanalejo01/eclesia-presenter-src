/**
 * i18n.parity.test.js (T13) — CRITICO
 *
 * Garantiza que los 3 diccionarios (es/en/pt) tienen EXACTAMENTE las
 * mismas keys, sin valores vacios, y que cada placeholder {param} de un
 * valor ES aparece tambien en los valores EN/PT de la misma key. Si
 * alguien anade una key solo a un idioma, este suite falla nombrando la
 * key exacta.
 */
import { DICT } from '../src/services/i18n.js'

const esKeys = Object.keys(DICT.es).sort()

function diff(a, b) {
  const setB = new Set(b)
  return a.filter((k) => !setB.has(k))
}

test('DICT.en tiene exactamente las mismas keys que DICT.es', () => {
  const enKeys = Object.keys(DICT.en).sort()
  const missing = diff(esKeys, enKeys)
  const extra = diff(enKeys, esKeys)
  if (missing.length || extra.length) {
    throw new Error(
      `EN desincronizado con ES.\n  Faltan en EN: ${JSON.stringify(missing)}\n  Sobran en EN: ${JSON.stringify(extra)}`,
    )
  }
  expect(enKeys).toEqual(esKeys)
})

test('DICT.pt tiene exactamente las mismas keys que DICT.es', () => {
  const ptKeys = Object.keys(DICT.pt).sort()
  const missing = diff(esKeys, ptKeys)
  const extra = diff(ptKeys, esKeys)
  if (missing.length || extra.length) {
    throw new Error(
      `PT desincronizado con ES.\n  Faltan en PT: ${JSON.stringify(missing)}\n  Sobran en PT: ${JSON.stringify(extra)}`,
    )
  }
  expect(ptKeys).toEqual(esKeys)
})

test('ningun idioma tiene valores vacios o no-string', () => {
  for (const lang of Object.keys(DICT)) {
    for (const [key, value] of Object.entries(DICT[lang])) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Valor invalido en DICT.${lang}['${key}']: ${JSON.stringify(value)}`)
      }
    }
  }
})

test('cada placeholder {param} de un valor ES existe en EN y PT de la misma key', () => {
  const problems = []
  for (const key of esKeys) {
    const placeholders = DICT.es[key].match(/\{[a-zA-Z]+\}/g) || []
    for (const ph of placeholders) {
      for (const lang of ['en', 'pt']) {
        const value = DICT[lang][key]
        if (typeof value === 'string' && !value.includes(ph)) {
          problems.push(`DICT.${lang}['${key}'] no contiene ${ph}`)
        }
      }
    }
  }
  if (problems.length) {
    throw new Error('Placeholders desincronizados:\n  ' + problems.join('\n  '))
  }
})

test('sanity: el dict canonico ES tiene un volumen razonable de keys (>=180)', () => {
  expect(esKeys.length).toBeGreaterThanOrEqual(180)
})
