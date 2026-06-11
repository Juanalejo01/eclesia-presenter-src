/**
 * @jest-environment jsdom
 */
/**
 * i18n.test.js (T13)
 *
 * Servicio i18n: deteccion (Preferences > mirror > navigator.language >
 * 'es'), persistencia (solo eleccion explicita), fallback chain,
 * interpolacion multi-ocurrencia, listeners y test-safety (default 'es'
 * sin initLocale).
 *
 * jsdom docblock: el project "node" de Jest matchea *.test.js, pero este
 * suite necesita document/localStorage — el docblock per-file overridea
 * el testEnvironment del project.
 */
import { Preferences } from '@capacitor/preferences'
import {
  DICT,
  t,
  setLocale,
  getLocale,
  initLocale,
  subscribeLocale,
  AVAILABLE_LOCALES,
} from '../src/services/i18n.js'
import { loadLocale, saveLocale, clearLocale } from '../src/services/localeStorage.js'

const LOCALE_KEY = 'eclesia.locale'

function setNavigatorLanguage(value) {
  Object.defineProperty(window.navigator, 'language', {
    value,
    configurable: true,
  })
}

async function flushAsync() {
  // saveLocale es fire-and-forget — un macrotask basta para drenarlo.
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(async () => {
  await Preferences.clear()
  window.localStorage.clear()
  setNavigatorLanguage('en-US') // default de jsdom, explicitado
})

afterEach(async () => {
  setLocale('es', { persist: false })
  await Preferences.clear()
  window.localStorage.clear()
  jest.restoreAllMocks()
})

// ─── Test-safety: default del modulo ───────────────────────────────────────

test('default del modulo es "es" sin initLocale() (jsdom navigator=en-US)', () => {
  jest.resetModules()
  // eslint-disable-next-line global-require
  const fresh = require('../src/services/i18n.js')
  expect(fresh.getLocale()).toBe('es')
})

test('AVAILABLE_LOCALES expone los 3 idiomas con labels nativos', () => {
  expect(AVAILABLE_LOCALES.map((l) => l.id)).toEqual(['es', 'en', 'pt'])
  expect(AVAILABLE_LOCALES.map((l) => l.label)).toEqual(['Español', 'English', 'Português'])
})

// ─── Deteccion ─────────────────────────────────────────────────────────────

test('initLocale: el valor de Preferences gana sobre navigator.language', async () => {
  await Preferences.set({ key: LOCALE_KEY, value: 'pt' })
  setNavigatorLanguage('en-US')
  const applied = await initLocale()
  expect(applied).toBe('pt')
  expect(getLocale()).toBe('pt')
})

test('initLocale: sin pref → navigator pt-BR → pt', async () => {
  setNavigatorLanguage('pt-BR')
  await initLocale()
  expect(getLocale()).toBe('pt')
})

test('initLocale: sin pref → navigator en-US → en', async () => {
  setNavigatorLanguage('en-US')
  await initLocale()
  expect(getLocale()).toBe('en')
})

test('initLocale: sin pref → navigator fr-FR → fallback es', async () => {
  setNavigatorLanguage('fr-FR')
  await initLocale()
  expect(getLocale()).toBe('es')
})

test('initLocale: el espejo localStorage gana sobre navigator si no hay Preferences', async () => {
  window.localStorage.setItem(LOCALE_KEY, 'pt')
  setNavigatorLanguage('en-US')
  await initLocale()
  expect(getLocale()).toBe('pt')
})

test('initLocale: locale detectado NO se persiste; setLocale explicito SI', async () => {
  setNavigatorLanguage('en-US')
  await initLocale()
  await flushAsync()
  expect((await Preferences.get({ key: LOCALE_KEY })).value).toBeNull()
  expect(window.localStorage.getItem(LOCALE_KEY)).toBeNull()

  setLocale('en') // eleccion explicita
  await flushAsync()
  expect((await Preferences.get({ key: LOCALE_KEY })).value).toBe('en')
  expect(window.localStorage.getItem(LOCALE_KEY)).toBe('en')
})

// ─── Fallback chain ────────────────────────────────────────────────────────

test('fallback: key en es pero ausente en en → string en espanol', () => {
  const saved = DICT.en['common.cancel']
  delete DICT.en['common.cancel']
  try {
    setLocale('en', { persist: false })
    expect(t('common.cancel')).toBe('Cancelar')
  } finally {
    DICT.en['common.cancel'] = saved
  }
})

test('fallback: key inexistente en todos → devuelve la key, nunca lanza', () => {
  expect(t('no.existe.esta.key')).toBe('no.existe.esta.key')
  setLocale('en', { persist: false })
  expect(t('tampoco.esta')).toBe('tampoco.esta')
})

// ─── Interpolacion ─────────────────────────────────────────────────────────

test('interpolacion: {sec} se sustituye', () => {
  setLocale('es', { persist: false })
  expect(t('bible.errMsg.rate_limited', { sec: 30 }))
    .toBe('Demasiadas búsquedas. Espera 30s e inténtalo de nuevo.')
})

test('interpolacion: placeholder repetido se sustituye en TODAS las ocurrencias', () => {
  DICT.es['__test.repeat'] = '{n} más {n} son {n}'
  try {
    expect(t('__test.repeat', { n: 2 })).toBe('2 más 2 son 2')
  } finally {
    delete DICT.es['__test.repeat']
  }
})

test('interpolacion: param ausente deja el placeholder intacto', () => {
  setLocale('es', { persist: false })
  expect(t('bible.errMsg.rate_limited', { otra: 1 })).toContain('{sec}')
})

// ─── setLocale ─────────────────────────────────────────────────────────────

test('setLocale: locale invalido se ignora (no-op)', () => {
  setLocale('es', { persist: false })
  const cb = jest.fn()
  const off = subscribeLocale(cb)
  setLocale('xx')
  expect(getLocale()).toBe('es')
  expect(cb).not.toHaveBeenCalled()
  off()
})

test('setLocale: valido setea document.documentElement.lang y notifica una vez', () => {
  const cb = jest.fn()
  const off = subscribeLocale(cb)
  setLocale('en', { persist: false })
  expect(document.documentElement.getAttribute('lang')).toBe('en')
  expect(cb).toHaveBeenCalledTimes(1)
  expect(cb).toHaveBeenCalledWith('en')
  off()
})

// ─── Persistencia ──────────────────────────────────────────────────────────

test('setLocale persiste en Preferences Y en el espejo localStorage', async () => {
  setLocale('pt')
  await flushAsync()
  expect((await Preferences.get({ key: LOCALE_KEY })).value).toBe('pt')
  expect(window.localStorage.getItem(LOCALE_KEY)).toBe('pt')
})

test('localeStorage.loadLocale devuelve null si Preferences lanza (nunca propaga)', async () => {
  jest.spyOn(Preferences, 'get').mockRejectedValueOnce(new Error('storage roto'))
  await expect(loadLocale()).resolves.toBeNull()
})

test('localeStorage.loadLocale devuelve null para valores no validos', async () => {
  await Preferences.set({ key: LOCALE_KEY, value: 'klingon' })
  await expect(loadLocale()).resolves.toBeNull()
})

test('localeStorage.saveLocale devuelve boolean y rechaza locales invalidos', async () => {
  await expect(saveLocale('en')).resolves.toBe(true)
  await expect(saveLocale('xx')).resolves.toBe(false)
  jest.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('boom'))
  await expect(saveLocale('es')).resolves.toBe(false)
})

test('localeStorage.clearLocale es idempotente y no lanza', async () => {
  await saveLocale('en')
  await clearLocale()
  await expect(loadLocale()).resolves.toBeNull()
  await expect(clearLocale()).resolves.toBeUndefined()
})
