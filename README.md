# EclesiaPresenter

Software libre de presentación para iglesias — Biblia, canciones, lista del día,
proyección con tema personalizable y monitor broadcast PGM/PVW.

Construido con **Electron + React + Vite**, con persistencia dual (SQLite cuando
está disponible, `localStorage` como fallback).

---

## Características principales

- **Biblia** — Multi-versión local (RVR 1909, NVI, DHH, LBLA, NTV, PDT, TLA) +
  soporte para versiones remotas vía [api.bible](https://api.bible). Búsqueda por
  texto, navegación libro/capítulo/versículo, selección múltiple estilo Finder
  (click, shift, ctrl).
- **Canciones** — Editor con plantillas de estructura (verso/coro/puente),
  auto-split por longitud, vista previa de presentación. Persistencia en SQLite
  cuando hay Electron.
- **Lista del día** — Programación reordenable con drag & drop. Atajos `←/→` para
  navegar entre elementos en vivo.
- **Proyección** — Ventanas nativas capturables por OBS:
  - **Pantalla completa** — para el proyector físico (1920×1080).
  - **Overlay transparente** — para captura/streaming en OBS.
- **Tema personalizable** — Fondo (sólido, gradiente, imagen, video, transparente),
  tipografía, transiciones (fade, slide, zoom), posición vertical, sombra.
- **Monitor PGM/PVW** — Vista lateral broadcast con tally `ON AIR`, modo Live/Preview
  con botón "Tomar al aire".
- **Atajos globales** — `Ctrl+1..4` para cambiar panel, `←/→` para navegar slides,
  `B` blanco, `.` blackout.

---

## Estructura del proyecto

```
src/
├── main/            # Proceso Electron principal (BrowserWindow, IPC, SQLite)
│   ├── main.js
│   ├── projection.js
│   ├── database.js
│   └── preload.js
├── renderer/        # React app (paneles, servicios, store)
│   ├── components/
│   ├── services/
│   ├── hooks/
│   ├── pages/
│   └── styles/
public/              # Biblias en JSON nativo
scripts/             # Utilidades (convertidor XMM → JSON)
```

---

## Desarrollo

```bash
npm install
npm run dev
```

El comando `dev` levanta Vite en `localhost:5173` y Electron en paralelo.

---

## Build

```bash
npm run build
```

Genera el bundle de Vite y empaqueta con `electron-builder`.

---

## Diseño

Sistema visual cinematográfico con paleta cobre + durazno (broadcast vibe).
Tipografías: Cormorant Garamond (display) + Geist (UI) + Geist Mono (etiquetas).
Tokens y componentes en `src/renderer/styles/eclesia-design.css`.

---

## Documentación adicional

- **[docs/CODE_SIGNING.md](docs/CODE_SIGNING.md)** — Estrategia de firma de
  binarios Windows (SignPath Foundation + Azure Trusted Signing).
- **[docs/SIGNPATH_APPLICATION.md](docs/SIGNPATH_APPLICATION.md)** — Texto
  preparado para aplicar al programa OSS de SignPath Foundation.

## Licencia

[MIT](LICENSE) — uso libre comercial y personal, con atribución.

Las traducciones bíblicas incluidas mantienen sus respectivas licencias:
- **RVR 1909** — Dominio público
- **NVI, DHH, LBLA, NTV, PDT, TLA** — Uso devocional, ver licencias originales
  de Sociedades Bíblicas Unidas, Bíblica Inc., The Lockman Foundation y Tyndale House.
