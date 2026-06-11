# Mobile PWA (T12) — instalación, serving `/app` y deploy en Vercel

El mando móvil (`mobile/`, Vite + React + Capacitor) es una **PWA instalable**
con triple vía de distribución:

| Vía | Build | Base | Service Worker |
|---|---|---|---|
| APK Capacitor (sideload / release-mobile.yml) | `npm run build` → `dist/` | `/` | **NO** se registra (gate `Capacitor.isNativePlatform()`) |
| LAN desde el desktop: `http://<IP>:3434/app/` | `npm run build:app` → `dist-app/` | `/app/` | NO se registra (insecure context http) — funciona como web normal |
| Cloud Vercel (https) — preparación T15 | `npm run build` → `dist/` | `/` | SÍ se registra (secure context) |

## Arquitectura

- **Manifest**: objeto compartido en `mobile/src/pwa/manifest.js`, consumido por
  `vite-plugin-pwa` en `mobile/vite.config.js` (genera `manifest.webmanifest` e
  inyecta el `<link rel="manifest">`). `start_url: '.'` e iconos con rutas
  relativas → funcionan bajo `/` y bajo `/app/` sin duplicar config.
- **Service worker**: `generateSW` (Workbox), `registerType: 'autoUpdate'`
  (skipWaiting + clientsClaim + cleanupOutdatedCaches). Runtime caching:
  - `/api/pair` y `/api/info` → `NetworkOnly` (tokens/PIN one-shot, jamás stale)
  - `/api/bible/`, `/api/songs/` → `NetworkFirst` timeout 3 s, cache `api-live`
    (50 entradas, 5 min) como amortiguador de cortes breves de WiFi
  - Los WebSockets (`/ws/remote`, `/socket.io`) no pasan por el fetch handler.
- **Registro del SW**: manual y gated en `mobile/src/pwa/registerSW.js`
  (`injectRegister: false`). Solo registra en web + secure context +
  `!Capacitor.isNativePlatform()`. En el APK, registrar el SW serviría bundles
  viejos tras actualizar — por eso el gate tiene tests dedicados.
- **Iconos**: generados con `npm run icon:mobile` (sharp desde el ROOT, fuente
  `build/icon.png`) y **commiteados** en `mobile/public/icons/` (Vercel y CI no
  tienen sharp). `purpose: any` y `maskable` como entradas separadas.

## Serving LAN: `/app` en el server del desktop

`src/server/server.js` → `resolveMobileAppDir()` prueba en orden:

1. `<resources>/mobile-app` (prod empaquetado, via `extraResources`)
2. `mobile/dist-app` (dev, checkout del repo)
3. `null` → `/app` responde 404 con mensaje accionable (el server nunca crashea)

Se sirve con `express.static` + SPA fallback (`/app/service`, `/app/bible`…
devuelven `index.html`; `BrowserRouter` usa `basename` derivado de
`import.meta.env.BASE_URL` en `mobile/src/main.jsx`).

El QR del panel **Transmisión** codifica `http://<IP>:3434/app/`: escanear →
PairScreen detecta same-origin → oculta el campo URL → solo PIN. El mando
clásico `/remote` sigue disponible como enlace secundario.

### Pipeline de empaquetado (IMPORTANTE)

`package.json` (root) → `build.extraResources` incluye
`{ from: "mobile/dist-app", to: "mobile-app" }`. **Si `mobile/dist-app` no
existe, electron-builder FALLA.** Por eso:

- Los scripts `pack`, `dist`, `dist:installer`, `dist:all`, `dist:mac` y
  `dist:linux` encadenan `npm run build:mobile-app` automáticamente.
- El workflow `release.yml` ejecuta `npm ci --prefix mobile && npm run
  build:mobile-app` antes de electron-builder.
- Si invocas `electron-builder` a mano, ejecuta antes:
  `npm run build:mobile-app` (o `cd mobile && npm run build:app`).

## Deploy en Vercel (manual, una vez)

El proyecto Vercel es **separado** del de `web/` (monorepo plano sin
workspaces; cada subproyecto se instala independiente).

1. [vercel.com/new](https://vercel.com/new) → Import del repo GitHub →
   **Root Directory: `mobile`** → framework **Vite** auto-detectado → Deploy
   (sin env vars). `mobile/vercel.json` ya define build/output/rewrites.
2. Settings → Domains → añadir `m.eclesia-presenter.<dominio>` con CNAME
   `cname.vercel-dns.com`.
3. Verificar: Lighthouse → PWA **installable**; `sw.js` registrado (https =
   secure context); manifest con iconos 192/512 + maskable.
4. Alternativa CLI (nunca CI — requiere login interactivo):
   `cd mobile && npx vercel --prod`.

### **Limitación esperada: la PWA https NO puede parear con un PC en LAN**

Desde `https://` el navegador **bloquea** los fetch `http://` a la red local
(mixed content). No es un bug y no tiene workaround sin relay:

- La vía LAN es el **QR del panel Transmisión** (abre `http://<IP>:3434/app/`).
- PairScreen muestra un banner informativo persistente en https, y
  `pairing.js` ya mapea el bloqueo a `mixed_content_o_shields`.
- El deploy https quedará plenamente funcional con el **cloud relay de T15**.
  Hoy es distribución/instalabilidad + plataforma lista.

## Installability por vía

- **Vercel https**: prompt de instalación completo + offline shell (SW activo).
- **LAN http `:3434/app`**: el SW no registra (insecure context) → no hay
  prompt automático en Android Chrome; sigue siendo usable como web app y se
  puede añadir a la pantalla de inicio manualmente (A2HS). No perseguir como
  bug: es plataforma.
- **APK**: la instalación ES el APK; el SW queda deliberadamente desactivado.

## Verificación manual

- Lighthouse (Chrome DevTools → Lighthouse → PWA) sobre el deploy https.
- Maskable: `chrome://flags` → preview de iconos maskable, o
  [maskable.app](https://maskable.app) con `icon-512-maskable.png`.
- LAN: `npm run build:mobile-app` → arrancar la app desktop →
  `http://<IP>:3434/app/` desde el móvil → parear solo con PIN.
- Doble build sano: `mobile/dist/` (base `/`) sigue siendo el webDir de
  Capacitor; `mobile/dist-app/` (base `/app/`) es solo para el embed.
