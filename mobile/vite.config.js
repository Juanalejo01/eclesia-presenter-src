import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { manifest } from './src/pwa/manifest.js'

// Leemos la version del package.json en build-time para inyectarla como
// constante global (__MOBILE_VERSION__). Asi MoreScreen puede mostrar "Mando
// vX.Y.Z" sin acoplar el bundle al import.meta.env, y los upgrades del paquete
// se reflejan automaticamente en la UI sin tocar codigo.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

export default defineConfig(({ mode }) => {
  // C1: credenciales Supabase como constantes de build (mismo patron que
  // __MOBILE_VERSION__, ver supabaseConfig.js para el porque vs
  // import.meta.env: Jest CJS no parsea import.meta). loadEnv une los
  // .env locales del paquete mobile con process.env (CI exporta
  // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el step de build).
  // Sin valores → null → isSupabaseConfigured() false → la UI de cuenta
  // muestra "no disponible en esta build" (benigno).
  const env = { ...loadEnv(mode, __dirname, 'VITE_'), ...process.env }

  return {
  plugins: [
    react(),
    // PWA (T12). Dos builds comparten esta config:
    //   - `npm run build`      → base '/'    → dist      (Capacitor APK + Vercel)
    //   - `npm run build:app`  → base '/app/' → dist-app  (embed servido por el
    //     server Express del desktop en http://IP:3434/app/)
    // El plugin deriva scope/start_url del base resuelto, así que el build
    // embed emite manifest con scope '/app/' y sw.js en /app/sw.js sin
    // config extra. injectRegister:false es OBLIGATORIO: el registro es
    // manual y gated en src/pwa/registerSW.js (APK Capacitor y LAN http
    // NO deben registrar SW).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'generateSW',
      manifest,
      workbox: {
        // Precache del app shell. skipWaiting + clientsClaim: el SW nuevo
        // activa inmediato y controla la página (evita shell viejo pegado).
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        sourcemap: false,
        // SPA fallback del SW. Denylist para no secuestrar las rutas legacy
        // del server desktop si este dist se sirviera con scope '/'.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//, /^\/socket\.io\//, /^\/remote/, /^\/overlay/],
        runtimeCaching: [
          {
            // Pairing JAMÁS desde cache — tokens/PIN son one-shot. Un token
            // stale rompe el pairing de forma indebugeable.
            urlPattern: /\/api\/pair/,
            handler: 'NetworkOnly',
          },
          {
            // Datos vivos: red primero con timeout corto; el cache es solo
            // amortiguador de 5 min para cortes breves de WiFi.
            urlPattern: /\/api\/(bible|songs)\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-live',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            // /api/info es el discriminador del pairing: nunca stale.
            urlPattern: /\/api\/info/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  define: {
    __MOBILE_VERSION__: JSON.stringify(pkg.version),
    __SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL || null),
    __SUPABASE_ANON_KEY__: JSON.stringify(env.VITE_SUPABASE_ANON_KEY || null),
  },
  server: {
    host: true,        // Expone IP de red para preview en móvil mismo WiFi
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
  }
})
