# EclesiaPresenter Mobile

Mando remoto móvil (Android / iOS / PWA) para **EclesiaPresenter** (la app desktop Electron).
Construido con **Capacitor 6 + Vite + React 18 + Tailwind 3**.

> Estado: T1 scaffold. Sin features funcionales todavía — la base para T2-T15.

---

## Quickstart

```bash
cd mobile
npm install
npm run dev
```

Abre <http://localhost:5173>. Verás 4 tabs (Servicio, Biblia, Canciones, Más) con
placeholders cobre. Vite expone también la IP de red (`http://192.168.1.X:5173`)
para previsualizar en el móvil real conectado al mismo WiFi.

## Build

```bash
npm run build     # genera mobile/dist/
npm run preview   # sirve dist/ en localhost
```

## Estructura

```
mobile/
├── capacitor.config.js   # appId, appName, webDir
├── vite.config.js
├── tailwind.config.js    # tokens cobre del desktop
├── src/
│   ├── main.jsx          # React + Router root
│   ├── App.jsx           # Routes + layout
│   ├── components/
│   │   └── BottomNav.jsx
│   └── screens/
│       ├── ServiceScreen.jsx
│       ├── BibleScreen.jsx
│       ├── SongsScreen.jsx
│       └── MoreScreen.jsx
└── public/
    ├── icon-192.svg
    └── manifest.webmanifest
```

## Añadir Android (cuando esté listo)

Requiere **Android Studio** o **Java 17 + Android SDK** instalados.

```bash
npm install                # instala @capacitor/android
npx cap add android        # crea mobile/android/ (gitignored)
npm run cap:sync           # build + cap sync
npm run cap:android        # abre el proyecto en Android Studio
```

Luego cada cambio en el código web:

```bash
npm run cap:sync           # rebuild + sync con android/
```

## Añadir iOS (cuando esté listo)

Requiere **macOS + Xcode**. El paso `npx cap add ios` no funciona en Windows.

## Próximos pasos

- **T2** — Capa de transporte (WebSocket/SSE) hacia el desktop
- **T3** — Pairing via QR (cámara con `@capacitor/camera` + `@capacitor/barcode-scanner`)
- **T4-T6** — Panel de servicio operativo (prev/next, preview PGM)
- **T7-T9** — Lector bíblico móvil
- **T10-T12** — Repertorio de canciones
- **T13-T15** — Ajustes, cuenta, OTA updates

## Convenciones

- JavaScript + JSX (NO TypeScript) por consistencia con el resto del monorepo
- Tailwind 3.x estable, NO 4.x alpha
- Capacitor 6.x
- Paleta cobre brand replicada exacta del desktop (`tailwind.config.js`)
