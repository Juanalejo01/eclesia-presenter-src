# Changelog

Todas las cambios notables se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [Unreleased]

### Added
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) y
  `SECURITY.md` para subir el Community Standards score de GitHub a 100%.
- Templates de Issues (bug, feature, question) y de Pull Requests en
  `.github/`.
- `FUNDING.yml` placeholder para activar el botón Sponsor cuando KYC esté listo.
- `CHANGELOG.md` (este archivo).
- Dependabot config (`.github/dependabot.yml`) para PRs semanales de
  actualizaciones de seguridad.

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

[Unreleased]: https://github.com/Juanalejo01/eclesia-presenter/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.1
[0.2.0]: https://github.com/Juanalejo01/eclesia-presenter/compare/v0.1.0...v0.2.0
