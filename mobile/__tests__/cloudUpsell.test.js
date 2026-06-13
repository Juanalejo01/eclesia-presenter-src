/**
 * cloudUpsell.test.js (C4)
 *
 * El upsell Pro debe ser CONSISTENTE en todas sus superficies (Canciones ·
 * Mi nube, Mis listas, Cuenta):
 *   - mismo DESTINO (PRICING_URL canónico)
 *   - mismo CTA traducido en los 3 idiomas (las keys *.upsellCta coinciden
 *     entre cloudSongs / planner / account por idioma)
 *   - openExternal/openPricing abren con (url, '_blank', 'noopener') y no
 *     crashean si window.open no existe (WebView).
 *
 * Si alguien diverge el texto del CTA o el destino, este suite falla.
 */
import { PRICING_URL, openExternal, openPricing } from '../src/services/cloudUpsell.js'
import { DICT } from '../src/services/i18n.js'

describe('PRICING_URL canónico', () => {
  test('apunta al pricing de la web sin barra final', () => {
    expect(PRICING_URL).toBe('https://eclesia-presenter.vercel.app/pricing')
  })
})

describe('CTA "Hazte Pro" idéntico entre superficies por idioma', () => {
  for (const lang of ['es', 'en', 'pt']) {
    test(`[${lang}] cloudSongs.upsellCta === planner.upsellCta === account.upsell`, () => {
      const songs = DICT[lang]['cloudSongs.upsellCta']
      const planner = DICT[lang]['planner.upsellCta']
      const account = DICT[lang]['account.upsell']
      expect(songs).toBeTruthy()
      expect(planner).toBe(songs)
      expect(account).toBe(songs)
    })
    test(`[${lang}] el aria del CTA Pro coincide entre cloudSongs y planner`, () => {
      expect(DICT[lang]['planner.upsellAria']).toBe(DICT[lang]['cloudSongs.upsellAria'])
    })
  }
})

describe('openExternal', () => {
  const realOpen = global.window
  afterEach(() => {
    global.window = realOpen
  })

  test('llama window.open con (url, _blank, noopener)', () => {
    const open = jest.fn()
    global.window = { open }
    openExternal('https://x.test/path')
    expect(open).toHaveBeenCalledWith('https://x.test/path', '_blank', 'noopener')
  })

  test('openPricing abre la URL canónica', () => {
    const open = jest.fn()
    global.window = { open }
    openPricing()
    expect(open).toHaveBeenCalledWith(PRICING_URL, '_blank', 'noopener')
  })

  test('no crashea si window.open lanza (WebView sin soporte)', () => {
    global.window = { open: () => { throw new Error('no open') } }
    expect(() => openExternal(PRICING_URL)).not.toThrow()
  })
})
