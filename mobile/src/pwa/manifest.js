/**
 * manifest.js
 *
 * Objeto del Web App Manifest compartido entre vite.config.js (que lo pasa
 * a vite-plugin-pwa para generar manifest.webmanifest) y los tests Jest
 * (mobile/__tests__/pwaManifest.test.js). Mantenerlo como módulo JS plano
 * permite testearlo sin parsear el build.
 *
 * Decisiones:
 *   - start_url '.' RELATIVA: resuelve a '/' en el build por defecto
 *     (Capacitor APK / Vercel) y a '/app/' en el build embed servido por el
 *     desktop (vite build --base=/app/). vite-plugin-pwa deriva el scope
 *     del base, así que no hay que duplicar nada por build.
 *   - Iconos con rutas RELATIVAS (sin '/' inicial) para que funcionen bajo
 *     /app/ igual que bajo '/'.
 *   - purpose 'any' y 'maskable' como entradas SEPARADAS: combinarlos en
 *     'any maskable' degrada el render en algunos launchers Android.
 */
export const manifest = {
  name: 'EclesiaPresenter',
  short_name: 'Eclesia',
  description: 'Mando remoto para EclesiaPresenter',
  lang: 'es',
  start_url: '.',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: '#14100d',
  background_color: '#14100d',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

export default manifest
