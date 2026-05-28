# Changelog

Todas las cambios notables se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [Unreleased]

---

## [0.2.2] — 2026-05-23

Release de iteración rápida basada en feedback de uso real. **Primera
release que prueba el auto-updater desde una versión anterior instalada
(v0.2.1 → v0.2.2)**.

### Added — Biblia
- 🔄 **Re-trigger de búsqueda** desde cualquier vista — escribir letras
  estando en capítulos/versículos vuelve a la lista de libros con esa
  letra como filtro.
- 🔢 **Navegación numérica directa** — en step capítulos/versículos,
  teclear "12" + Enter entra al cap/vers 12 directo. Buffer multi-dígito
  con auto-commit a 900 ms.
- ⌨️ **Ctrl/Cmd + F** vuelve a la selección de libros con buscador
  enfocado.
- 🎨 **Botones de libros rediseñados** — cards cuadrados-rectangulares
  color-coded por testamento (AT en cobre, NT en dorado).
- 📜 **Historial de versículos** — chips horizontales con los últimos
  24 versículos proyectados. Click → restaura.

### Added — Canciones
- 🔤 **Orden alfabético** estricto (`title COLLATE NOCASE ASC`).
- 🎵 **Layout 2 columnas**: Biblioteca (alfabético, fijo) +
  Servicio del día (drag&drop reordenable). Orden persistido en
  `localStorage`.
- ✂️ **Auto-split al pegar** — pegar una canción larga se divide en
  secciones según `maxLines`. Detección por líneas vacías.
- ↩️ **Auto-overflow a nueva sección** — pulsar Enter en línea N+1
  con maxLines=N crea una sección nueva con la línea sobrante.
- 📌 **Barra de ajustes sticky** — `AA MAYÚS / aa minús / + Sección`
  fija arriba al hacer scroll por secciones largas.
- 📥 **Botón Importar / Exportar** → abre Ajustes → Canciones (antes
  era un botón fake sin lógica).

### Added — Proyección
- 📏 **Tamaño configurable de la referencia** bíblica — 4 niveles
  (Pequeño 1/5, Medio 1/4, Grande 1/3, Muy grande 1/2). Nunca supera
  el tamaño del texto principal.

### Added — Transmisión
- 🔄 **Botón Refrescar** en el bloque del QR — re-detecta IP local y
  regenera el QR (útil al cambiar de WiFi a LAN).

### Changed
- **QR del remoto** generado LOCALMENTE con `qrcode` (npm) en vez de la
  API externa `api.qrserver.com`. Colores negro/blanco puro para máxima
  compatibilidad con cámaras móviles.
- Email de contacto unificado a `juanlpz.dev@gmail.com` en toda la web
  (antes había `hola@eclesiapresenter.com` placeholder).
- Web `/contacto` rediseñada con email + WhatsApp deep link como
  canales primarios.

### Removed
- ❌ **Watermark "Esperando contenido…"** en proyección vacía — los
  operadores dejan pantalla vacía intencionalmente durante el servicio
  y el texto fantasma rompía la atmósfera.

### Fixed
- 🐛 Thumbnails 404 de Pexels: UI ahora muestra placeholder con gradiente
  por categoría + icono + título (52 de 56 videos del catálogo se ven
  ahora con un fallback elegante en vez de un div gris vacío).

### CI / Infrastructure
- 🧪 **Suite de tests automatizados** — Jest (35 unit tests, 89%
  coverage en módulos cubiertos) + Playwright (19 E2E tests). Workflow
  CI `test.yml` independiente de release.
- 📋 **Community Standards 100%** — `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`,
  templates de Issues (bug, feature, question) y PRs, `FUNDING.yml`,
  `dependabot.yml`.

### Notes
- ⚠️ **SignPath**: aún esperando aprobación del programa OSS. Los
  binarios v0.2.2 siguen sin firmar — SmartScreen seguirá avisando.
- 💰 **Azure Trusted Signing**: planeado para próxima sprint cuando
  llegue el salario del maintainer (~10€/mes).

---

## [0.2.1] — 2026-05-20

Primera release con cloud sync, biblioteca de fondos preset, auto-updater y
suite de tests automatizados.

### Added
- ☁️ **Cloud sync de canciones (Pro)** — sincronización 2-way entre PCs
  vía Supabase con last-write-wins + tombstones para soft-delete. Tabla
  `cloud_songs` con Row Level Security gateada por `license_key`.
- 📺 **Stage Display v2** — monitor para el predicador con slide actual,
  próximo slide pre-renderizado, notas privadas y countdown integrado.
- 🎨 **Biblioteca de 56 fondos worship CC0** curados de Pexels en 4
  categorías (partículas, cielo, naturaleza, loops). Descarga bajo
  demanda — no inflan el .exe. Placeholder de gradiente por categoría
  cuando un thumbnail falla.
- 🔄 **Auto-updater** con `electron-updater` + GitHub Releases. Check
  silencioso 30s tras startup, descarga opt-in del usuario, install al
  reiniciar. Detecta portable vs NSIS y muestra UX adecuada.
- 🧰 **Panel de Herramientas** — countdown, cronómetro, verso aleatorio,
  ruleta personalizable. Features no presentes en ProPresenter ni
  EasyWorship.
- 🖥 **Custom title bar estilo Discord** — `titleBarStyle: hidden` +
  `titleBarOverlay` Win11 themed con paleta cobre/durazno.
- 🖼 **Brand icon** en taskbar, setup NSIS y favicon web. Build de 3 fases
  (electron-builder --dir → rcedit → --prepackaged) para evitar corrupción
  del self-extracting .exe.
- 🚀 **Ventana maximizada al arrancar** (`mainWindow.maximize()` tras show).
- 📊 **Stats bidireccionales de cloud sync** — la UI muestra PUSH (↑) y
  PULL (↓) en vez de solo PULL.
- ⚡ **Auto-sync trigger** debounced 2s al mutar canciones (create / update
  / delete / favorite).
- 🌐 **Web `/casos-de-uso`** con empty state honesto y 5 escenarios
  diseñados por tamaño de iglesia.
- 📞 **Web `/contacto`** rediseñada con 2 canales (email + WhatsApp deep
  link).
- 🔐 **Workflow de release.yml** preparado para code signing con SignPath
  Foundation (gateado por `vars.SIGNPATH_ENABLED`).
- 📚 **Roadmap público** en `ROADMAP.md` con plan hasta v1.0.
- 🧪 **Suite de tests automatizados** — Jest (35 unit tests, 89% coverage
  en módulos cubiertos) + Playwright (19 E2E tests). CI workflow en
  `.github/workflows/test.yml`.
- 📸 **README profesional** con badges, hero screenshot, diagrama de
  arquitectura, comparativa vs ProPresenter / EasyWorship.

### Changed
- Email de contacto unificado a `juanlpz.dev@gmail.com` (antes
  `hola@eclesiapresenter.com` placeholder no real).
- Versión visible en navbar pasa a `v 0.2.1` en footer / download / settings.

### Fixed
- 🐛 **Mobile menu en la web** mostraba cuerpo vacío — refactor a `display:
  grid` + `gridTemplateRows: 'auto 1fr auto'` + `height: 100dvh`.
- 🐛 **Navbar colapsaba** entre 770-1023px — breakpoint elevado de `md`
  (768) a `lg` (1024).
- 🐛 **Hero.png corrupta** en GitHub — reemplazada con captura nueva
  optimizada via sharp + palette PNG (989 KB vs 3.1 MB original).
- 🐛 **Thumbnails 404 de Pexels** (52 de 56 videos) — UI ahora muestra
  placeholder con gradiente por categoría + icono + título, mucho mejor
  UX que el div gris vacío anterior.
- 🐛 **Workflow de CI fallaba** en macOS por `Broken pipe` en `ls | head
  -25` — añadido `set +o pipefail` + `|| true`.
- 🐛 **Workflow de CI fallaba** en Windows por `icon.ico` no encontrado —
  los iconos estaban en `.gitignore` por error; ahora versionados.
- 🐛 **Stage Display tenía minHeight duplicado** que warneaba esbuild/vite.

### Security
- 🔒 Upstash Redis rate limiter en endpoints de activación de licencia.
- 🔒 Turnstile captcha en formularios públicos.
- 🔒 Sentry logging en main process (PII filtering activo).
- 🔒 RLS policies en Supabase para `cloud_songs` (read/write/delete own).
- 🔒 10 fixes de hardening en `web/` (CSRF, SSRF, headers de seguridad).

---

## [0.2.0] — 2026-04-XX

Versión "Broadcast vibe" — primera release con sistema visual completo,
licencias funcionales y mobile remote.

### Added
- Sistema visual cinematográfico (paleta cobre + durazno).
- Monitor PGM/PVW con tally `ON AIR` y "Tomar al aire".
- Atajos globales (`Ctrl+1..4`, `←/→`, `B`, `.`).
- Importación de biblias `.xmm`.
- Servidor LAN embebido con socket.io para mobile remote (web con PIN,
  sin app nativa).
- Plan Free (3 biblias) + Pro (10 biblias) + Lifetime.
- Stripe Checkout + Customer Portal funcionales.
- Web pública (landing, pricing, download, docs, cuenta).

---

## [0.1.x] — Q1 2026

Cimientos iniciales (pre-beta).

### Added
- Biblia multi-versión con persistencia local JSON (RVR 1909).
- Editor de canciones con plantillas verso/coro/puente.
- Lista del día reordenable (drag & drop).
- Proyección a ventana externa capturable por OBS.
- Tema personalizable básico (fondo + tipografía + transiciones simples).

---

## Sobre este formato

- **Added**: features nuevas
- **Changed**: cambios en funcionalidad existente
- **Deprecated**: features que serán eliminadas pronto
- **Removed**: features eliminadas en esta versión
- **Fixed**: bug fixes
- **Security**: cambios relacionados con seguridad

[Unreleased]: https://github.com/Juanalejo01/eclesia-presenter/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.2
[0.2.1]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.1
[0.2.0]: https://github.com/Juanalejo01/eclesia-presenter/compare/v0.1.0...v0.2.0
