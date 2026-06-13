/**
 * cloudUpsell.js (C4)
 *
 * Lugar canónico ÚNICO del destino y el patrón de apertura del upsell Pro.
 * Antes el literal 'https://eclesia-presenter.vercel.app/pricing' y el
 * helper openExternal() estaban duplicados byte-a-byte en SongsScreen,
 * PlannerListScreen y AccountScreen. C4 los centraliza para que las tres
 * superficies de upsell (Canciones nube, Mis listas, Cuenta) lleven SIEMPRE
 * al mismo sitio y se comporten igual si mañana cambia la URL o se añade un
 * parámetro de tracking.
 *
 * Nota de copy: el TÍTULO y el CUERPO del upsell siguen siendo específicos
 * por superficie (canciones vs listas) — son contextos distintos y un texto
 * genérico perdería claridad. Lo que C4 garantiza idéntico es el CTA
 * ("Hazte Pro" / "Go Pro" / "Seja Pro", vía las keys *.upsellCta) y el
 * DESTINO (esta constante). Los call-sites resuelven el CTA por i18n; el
 * test cloudUpsell.test.js fija que las tres keys de CTA coinciden.
 */

// Destino del upsell — pricing de la web. Sin barra final (la web ya
// normaliza). Cambiar AQUÍ propaga a todas las superficies.
export const PRICING_URL = 'https://eclesia-presenter.vercel.app/pricing'

/**
 * Abre una URL externa en una pestaña nueva de forma segura.
 * WebView de Capacitor sin window.open: no crashea (try/catch).
 */
export function openExternal(url) {
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    // WebView sin window.open: no rompemos el flujo.
  }
}

/** Atajo: abre el pricing Pro. Usado por los CTA "Hazte Pro". */
export function openPricing() {
  openExternal(PRICING_URL)
}
