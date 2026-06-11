/**
 * pwaManifest.test.js
 *
 * Contract test del Web App Manifest (T12). El objeto vive en
 * src/pwa/manifest.js y lo consume vite-plugin-pwa en vite.config.js —
 * si alguien cambia theme_color, rompe los iconos o fusiona purpose
 * 'any maskable' (degrada el render en launchers), este test lo atrapa.
 */
import { manifest } from '../src/pwa/manifest.js'

test('manifest exporta name/short_name/theme_color #14100d/display standalone/orientation portrait', () => {
  expect(manifest.name).toBe('EclesiaPresenter')
  expect(manifest.short_name).toBe('Eclesia')
  expect(manifest.description).toBe('Mando remoto para EclesiaPresenter')
  expect(manifest.lang).toBe('es')
  expect(manifest.theme_color).toBe('#14100d')
  expect(manifest.background_color).toBe('#14100d')
  expect(manifest.display).toBe('standalone')
  expect(manifest.orientation).toBe('portrait')
})

test("start_url '.' relativa — resuelve a '/' en Capacitor/Vercel y '/app/' en el embed", () => {
  expect(manifest.start_url).toBe('.')
})

test('iconos 192+512 purpose any y 512 maskable como entradas SEPARADAS, rutas relativas', () => {
  const icons = manifest.icons
  expect(Array.isArray(icons)).toBe(true)

  const any192 = icons.find((i) => i.sizes === '192x192' && i.purpose === 'any')
  const any512 = icons.find((i) => i.sizes === '512x512' && i.purpose === 'any')
  const maskable512 = icons.find((i) => i.sizes === '512x512' && i.purpose === 'maskable')

  expect(any192).toBeTruthy()
  expect(any512).toBeTruthy()
  expect(maskable512).toBeTruthy()

  // Ninguna entrada combina 'any maskable' (degrada el render del launcher).
  expect(icons.some((i) => /any\s+maskable|maskable\s+any/.test(i.purpose || ''))).toBe(false)

  // Rutas RELATIVAS (sin '/' inicial) para funcionar bajo /app/ y bajo /.
  for (const icon of icons) {
    expect(icon.src.startsWith('/')).toBe(false)
    expect(icon.type).toBe('image/png')
  }
})
