# Changelog

Todas las cambios notables se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [Unreleased]

---

## [0.2.18] — 2026-06-12

Primera release publicada con el esquema de 2 repos (código privado en
`eclesia-presenter-src`, binarios públicos en `eclesia-presenter`).

### Added
- 📱 **El desktop sirve el mando móvil** en `http://IP:3434/app/` (build
  PWA empaquetado en `resources/mobile-app`); el QR del panel Transmisión
  apunta ahí — cualquier móvil de la congregación escanea e instala sin APK.
- 🔐 **Persistencia de tokens de pairing** en `userData/pairing_tokens.json`
  (escritura atómica + debounce): los mandos emparejados sobreviven
  reinicios del PC sin volver a teclear el PIN.
- 🌍 Endpoints para el mando: `POST /api/bible/search` y
  `GET /api/songs/list|/:id` (Bearer + rate-limit por dispositivo) +
  comandos WS `announce`, `projection-close`, `bible/song-project-direct`.

### Fixed
- 🩹 **Updater**: mensajes de error amigables (sin stack trace en Ajustes),
  detalles técnicos colapsados y botón "Abrir página de descargas" como
  plan B. El 404 de `latest.yml` causado por releases mobile quedó
  resuelto de raíz (releases mobile = prerelease, nunca Latest).
- 📦 **Biblias en app instalada**: `bibleSearch` resuelve `public/*.json`
  vía `extraResources` (antes apuntaba dentro del asar y el endpoint
  devolvía 503 en producción).
- 🖥️ La página raíz del server no enlaza `/app/` si el build del mando
  no está empaquetado (fallback a `/remote`).

### Changed
- 🔁 **CI publica releases al repo público** `eclesia-presenter` vía
  `RELEASES_TOKEN` (PAT); guard con error accionable si falta el secret.
  Runbook en `docs/RELEASES_MIGRATION.md`.

---

## [Mobile 0.2.0] — 2026-06-12

Release del **mando móvil** (app Android/PWA `@eclesia-presenter/mobile`,
versionada aparte del desktop). El mando pasa de control básico de culto
(T1–T8) a operador completo: Biblia, canciones, anuncios y pánico, con
i18n y modo PWA servido desde el propio PC. Hitos T9–T13 + hardening.

### Added
- 📖 **BibleScreen (T9)** — buscar versículo por referencia ("Juan 3:16")
  o texto libre contra el desktop (`/api/bible/search`, Bearer token,
  rate-limit por dispositivo) y proyectarlo desde el preview bottom-sheet.
- 🎵 **SongsScreen (T10)** — buscar canción por título/autor/letra, sheet
  con secciones tapeables y sync realtime del repertorio (serverVersion +
  cache local); badge EN VIVO de la sección proyectada.
- 📣 **MoreScreen (T11)** — anuncio rápido (título + cuerpo proyectados
  como slide) y **botón de pánico** que cierra todas las ventanas de
  proyección del PC con confirm destructivo.
- 📱 **PWA installable + `/app` desde el desktop (T12)** — manifest +
  service worker; el server Express del PC sirve el build del mando en
  `http://IP:3434/app/` (pairing same-origin trivial vía QR/PIN).
- 🌐 **i18n ES/EN/PT (T13)** — diccionario único con test de paridad de
  keys, LanguageSwitcher en Ajustes y modal de pánico del brand.

### Fixed (hardening pre-release)
- 🧹 Rate-limit de Biblia/canciones: sweep anti-leak de deviceIds rotados
  (las entries con ventana expirada se purgan del Map).
- 👆 Los bottom-sheets bloqueaban el scroll táctil de versículos/secciones
  largas (`touchAction:'none'` en el backdrop) — ahora solo el drag handle
  captura el gesto swipe-down.
- ☁️ `isServedFromDesktop` daba falso positivo en deploys cloud
  `https://dominio/app` — el heurístico de pathname ahora exige `http:`.
- 🔗 La página raíz del server enlazaba `/app/` (404) aunque el build del
  mobile no existiera — fallback a `/remote` como CTA principal.
- 🧠 `composeSignals` dejaba el listener `abort` del signal externo
  colgado tras cada fetch completado — cleanup en el `finally`.
- 💬 Último `window.confirm` nativo (desemparejar) migrado a
  `ConfirmModal` reutilizable del brand (PanicModal ahora es wrapper).

### Infrastructure
- 🔧 Capacitor: `androidScheme: http` + `cleartext` + `allowNavigation`
  LAN — arregla el mixed content del APK contra el server http del PC (T8).
- 🔧 Workflow `release-mobile.yml` (T14) para el APK firmado.

---

## [0.2.17] — 2026-06-07

Fix UX del confirm de cierre — eliminado el doble dialog (custom + nativo
Win11) que aparecía si el usuario tardaba >2 s en decidir.

### Fixed
- 🐛 **Doble diálogo al cerrar la app**: el AppDialog custom aparecía
  primero (correcto), pero a los 2 s también el dialog nativo amarillo
  Win11 (por el timer de seguridad). Causa: el timer media "¿el usuario
  ya respondió?" en vez de "¿el renderer está vivo?".
- Fix: **patrón ACK** — el renderer manda `app:ack-quit-confirm` al main
  inmediatamente al recibir el request, antes de mostrar el modal. El
  main cancela el timer al recibir el ack. Si el ack NO llega en 2 s (el
  renderer está freezed o el listener no se montó), entonces sí cae al
  nativo como fallback de seguridad. Si llega (caso normal), el usuario
  puede tardar todo lo que quiera respondiendo sin que aparezca el
  nativo en paralelo.

---

## [0.2.16] — 2026-06-07

Fix de UX del auto-updater + hardening del CI.

### Changed
- 🔔 **Notificación de actualización más agresiva** — el botón cobre
  "Actualizar EclesiaPresenter vX.X.X" ahora aparece a los **5 segundos**
  del arranque (antes 30 s, que era demasiado tarde — el usuario ya
  estaba operando y no veía el aviso).
- 🔁 **Retry on network error**: si el primer check falla por red, se
  reintenta a los 60 s y luego cada 5 min hasta éxito (cubre cultos con
  WiFi inestable).
- 🔄 **Check periódico cada 4 h** mientras la app está abierta — para
  servicios largos o equipos de sala de control que quedan encendidos
  todo el día. Si el operador no cierra la app, igual se entera de
  nuevas versiones.

### Infrastructure
- 🔧 **CI: Node.js 20 → 22** en el workflow de tests (mata el warning
  "Node.js 20 actions are deprecated").
- 🔧 **CI: retry de `npm install`** con backoff exponencial (10 s, 20 s,
  30 s) para sobrevivir blips `ECONNRESET` del runner de GitHub Actions.

---

## [0.2.15] — 2026-06-07

Patch encima de v0.2.14 para corregir un cleanup incompleto del bglib.

### Fixed
- 🐛 **Sección "Fondos preset" seguía apareciendo en Ajustes** con un
  estado infinito "Cargando catálogo…". El cleanup de `bglib` en v0.2.14
  eliminó la lógica del backend (`backgroundLibrary.js` + IPC handlers +
  bridge del preload) pero un `git checkout HEAD --` accidental en
  Settings.jsx durante el sweep de diálogos revirtió la eliminación
  de la entrada del menú lateral + función `SectionFondos`. Removidas
  ahora: entrada `'fondos'` en `SECTIONS`, dispatcher condicional, y
  bloque entero de `SectionFondos` (~300 líneas). Settings.jsx pasa de
  1664 a 1365 líneas.
- Los vídeos siguen disponibles en
  `eclesia-presenter.vercel.app/recursos` como ya estaba planeado.

---

## [0.2.14] — 2026-06-07

Tanda grande de UX + refactor. Editor reinventado al estilo Canva, botón
de actualización persistente, sistema de diálogos acorde al brand, y
limpieza de la biblioteca interna de fondos (que ahora vive en la web).

### Added
- 🎨 **Panel Edición rediseñado al estilo Canva/Procreate**:
  - Layout 2 columnas: canvas central 16:9 (preview) + property panel
    derecho con secciones plegables (acordeón con estado persistido en
    localStorage).
  - Tabs Pantalla completa / Lower-third en la cinta superior.
  - 5 secciones por tab: FONDO/BANDA · TIPOGRAFÍA · EFECTOS · POSICIÓN ·
    TRANSICIÓN/REFERENCIA. Header con botones Restablecer · Probar · Abrir
    todas / Cerrar todas.
  - Mini-cards de "Estilos predefinidos" con preview visual + label.
  - Sección **"Mis presets"** con botón `＋ Guardar`: el usuario captura
    el estilo actual como preset propio, con renombrar (✎) y eliminar (×)
    al hover. Persistido en localStorage por kind (fullscreen/overlay).
- 🔤 **FontPicker custom con preview en vivo** (sustituye al `<select>`
  nativo que congelaba el navegador con 100+ fuentes):
  - Popover con buscador instantáneo.
  - **Virtual scroll**: solo se renderizan ~12 opciones visibles a la
    vez, cada una con su `fontFamily` aplicada → ves cómo se vería cada
    tipografía sin freeze.
  - A11y completa (role=listbox, aria-haspopup, focus-visible).
- 🔔 **Botón "Actualizar EclesiaPresenter" en la Topbar** (a la izquierda
  de Ajustes), con 4 estados:
  - Update disponible → cobre con pulse sutil + "↑ Actualizar
    EclesiaPresenter vX.X.X"
  - Descargando → barra de progreso interna + "Descargando NN%"
  - Descargado → verde + "↻ Reiniciar e instalar vX.X.X"
  - Error → tooltip con el mensaje + retry al click
  - En modo portable: enlace al GitHub Release
  - El estado se hidrata al abrir la app, así que si la sesión anterior
    detectó la actualización el botón aparece de inmediato.
- 💬 **Sistema de diálogos custom** acorde al brand cobre:
  - Nuevo `dialogService` con API `confirm()` / `alert()` / `prompt()`
    que devuelven Promesa.
  - Componente `<AppDialog>` con backdrop blur, card cobre con fade-in,
    icono según variante (`default` · `danger` · `info`) y animación
    de entrada cinematográfica.
  - A11y: focus trap, Esc cancela, Enter confirma, body-scroll-lock con
    refcount, aria-modal/role=dialog/aria-labelledby.
  - Reemplaza TODAS las llamadas `window.confirm`/`alert`/`prompt`
    nativas del navegador (18 sitios en total) y también el
    `dialog.showMessageBoxSync` nativo de Windows del cierre de app
    (vía flujo IPC main↔renderer con fallback de seguridad por timeout).
- 🌐 **Nueva sección `/recursos` en la web** (`eclesia-presenter.vercel.app/recursos`):
  - Catálogo de vídeos de fondo agrupados por categoría con thumbnails
    + duración + tamaño + botón "Descargar" directo a Pexels.
  - Tarjetas "Próximamente" para Canciones, Tutoriales e Imágenes.
  - Añadido a Navbar, MobileMenu y sitemap.xml.

### Changed
- 🧹 **Eliminada la biblioteca interna de fondos preset**
  (`backgroundLibrary.js` + 7 IPC handlers + 222 líneas de UI en Ajustes):
  los vídeos viven ahora en `/recursos` en la web — el usuario descarga
  lo que quiere y lo carga vía MediaPicker como cualquier archivo.
  Se mantiene el resolver `preset://` mínimo para que los vídeos ya
  descargados en versiones anteriores sigan funcionando.

### Fixed
- 🐛 **Editor: secciones del panel se compactaban** al abrir varias a la
  vez (flex repartía la altura). Añadido `flex-shrink: 0` y el panel se
  ensanchó a 400 px (responsive a 360/320 según viewport).
- 🐛 **Segmented controls truncados** ("Tra..." en lugar de "Transp."):
  añadido `cols={n}` y `small` para distribuir tabs con padding chico.
- 🐛 **Slider de blur cortado horizontalmente** dentro del grid de 2
  columnas: `min-width: 0` y `max-width: 100%` en `.prop-section`.
- 🐛 **Animación de secciones plegables truncaba contenido** con
  `max-height: 2000px` fijo: sustituida por la técnica
  `grid-template-rows: 0fr → 1fr` que anima a la altura real.
- 🐛 **TDZ en `<input>` del prompt**: pulsar Enter para aceptar el
  `defaultValue` devolvía `null` (el ref espejo no se inicializaba). Lee
  ahora `inputRef.current?.value` del DOM.
- 🐛 **Conflictos de Esc/Enter** entre AppDialog y otros listeners en
  capture phase (SongEditor, CommandPalette): `stopImmediatePropagation`
  en el handler global.
- 🐛 **Race del cierre de app**: si el renderer no ha montado aún el
  listener del `app:request-quit-confirm`, fallback al dialog nativo
  tras 2 s en lugar de dejar al usuario atrapado.

### Accessibility
- `:focus-visible` cobre + halo en tabs, headers, presets, reset button,
  selects, sliders, color pickers y checkboxes del editor.
- Tap targets ≥36 px en tabs, headers y reset button.
- Capa oscura debajo del label de los presets → contraste WCAG AA.
- `useId()` para `aria-labelledby` en cada diálogo.
- Focus trap real con Tab/Shift+Tab en AppDialog.

---

## [0.2.13] — 2026-06-07

Tanda centrada en rendimiento para máquinas modestas (Intel HD Graphics,
i3 de generaciones viejas) y en efectos de tipografía. Solución a un bug
crítico de foco que dejaba el teclado inservible en producción.

### Added
- 🎨 **Efectos de texto** completos en proyección y en overlay:
  - **Negrita** y **cursiva** como toggles
  - **Mayús/minús** (Auto / MAYÚS / minús / Capital.)
  - **Espaciado entre letras** (slider de -0.1em a +0.5em)
  - **Grosor del borde** del texto (0-12 px, vía `-webkit-text-stroke`)
  - **Color del borde** (color picker, solo si grosor > 0)
  - **Margen lateral** del texto (slider 0-400 px a 1920 base)
- 🔠 **Tamaño de tipografía ampliado**: pantalla 32-240 px, overlay
  24-200 px (antes 32-120 / 24-96 — se quedaba corto para textos cortos
  con espacio sobrado en pantalla)
- 🐌 **Modo bajo rendimiento** (Ajustes → Video y rendimiento). Cuando
  está activo, se salta el `<video>` de fondo y cae a degradado en su
  lugar. Recomendado para portátiles con gráficos integrados (Intel HD
  Graphics 520, i3 6ª gen y similares) donde el video de fondo a 1080p
  tira del 100% de CPU/GPU. Aplica al proyector, al overlay y al preview.

### Changed
- 📝 **"Proyección" renombrado a "Edición"** (más profesional — refleja
  que el panel es para editar el estilo, no para abrir las ventanas, que
  viven en Transmisión). Icono del sidebar cambiado a un lápiz.
- 🎛 El toggle de "Modo bajo rendimiento" se ha movido del panel de
  Edición a **Ajustes → Video y rendimiento**, donde encaja mejor
  conceptualmente con la calidad/fps de video.

### Fixed
- 🔴 **CRÍTICO: el teclado dejaba de funcionar y había que minimizar
  la app para recuperar el input**. Causa: `returnFocusToMain()` solo
  se llamaba al abrir/cerrar la proyección, pero si por cualquier vía
  (click en la taskbar del proyector, Alt-Tab, hover de Windows) el foco
  volvía a la ventana de proyección, nunca se devolvía. Reportado en
  Acer i3 con HD Graphics 520. Fix: instalo un listener `'focus'`
  permanente en las ventanas de proyección no-interactivas
  (background + overlay; stage SÍ acepta foco porque es la pantalla
  del músico) que rebota el foco al main en cada activación.
- 🧊 **Otro caso del bug de "congelación al cambiar la fuente"** que
  se nos había escapado en el selector de fuente del **overlay**
  (lower-third). Cada `<option>` tenía `style={{fontFamily}}` forzando
  a Chromium a instanciar cada tipografía del sistema al desplegar.
  Quitado.

---

## [0.2.12] — 2026-06-06

Tanda centrada en bugs reportados al usar la app y polish de UX.

### Added
- 🎵 **Canciones: búsqueda por LETRA además de título/autor/etiqueta**.
  El filtro ahora es accent-insensitive ("corazon" encuentra "corazón")
  y si la coincidencia fue en la letra, la card muestra un fragmento
  resaltado debajo del título para que sepas POR QUÉ aparece esa canción.
- 🎵 **Canciones: botón "Ocultar referencia"** en el header. Cuando está
  activo, los slides de canción se proyectan SIN la línea
  "Título · Sección" (solo letra). Persistido en localStorage.
- 📑 **Layout: 3 columnas redimensionables** con divisores arrastrables:
  panel ⟷ monitor (App), biblioteca ⟷ servicio (Canciones), navegación
  ⟷ texto (Biblia). Doble click en el divisor resetea. Anchos persistidos.
- 🎬 **Proyección: botón "Abrir/Cerrar todas" inteligente**. Si ambas
  ventanas (background + overlay) están abiertas, el botón cambia a
  "Cerrar todas" y al pulsarlo cierra ambas. Mismo botón, dos
  comportamientos según estado.
- ⌨️ **Ctrl+F repurposeado**: ya no resetea el panel Biblia. Ahora
  enfoca el buscador del panel actual (libros o texto en Biblia, songs
  search en Canciones). Más cercano al "find" estándar.

### Changed
- 🎵 **Cards de canciones rediseñadas** para portátiles estrechos. El
  título ya no comparte fila con los botones — siempre toma toda la fila,
  y las acciones (favorito, lista, editar, borrar) viven en una fila por
  debajo. Sin ellipsis a mitad del título.

### Fixed
- 📖 **CRÍTICO: Biblia omitía la primera letra** al teclear ("Romanos"
  → "omanos"). Causa: en el handler de letra al cambiar de step, se
  llamaba `setBookSearch(letra)` ANTES de `goToBooks()` que internamente
  llama `setBookSearch('')` — React batchea y la limpieza pisa la letra.
  Fix: invertir el orden.
- 📱 **QR del control remoto se quedaba en "Generando QR…"** al
  refrescar con la misma WiFi. El `useEffect` que generaba el QR
  dependía de `info?.remoteUrl` y como esa URL no cambiaba (misma IP),
  React no re-ejecutaba el effect. Añadido un contador `qrRev` que
  bumpa en cada refresh para forzar la regeneración.
- 🔍 **Preview en modal de zoom: "click fuera para cerrar" no funcionaba**.
  El `e.stopPropagation()` estaba en el wrapper que ocupaba toda la zona,
  bloqueando el cierre por click en el fondo. Movido al recuadro del
  slide únicamente.
- 🔍 **Preview en modal de zoom: botón "✕ Cerrar" solo clicable abajo**.
  Los botones del SO (Windows 11 titleBarOverlay) tienen una capa de
  captura que solapaba la mitad superior del botón. Fix: padding-top
  del modal a 54 px para que el botón quede debajo de la zona del SO.

---

## [0.2.11] — 2026-06-06

Tanda centrada en la Biblia y en un fallo de proyección visto en uso real,
más migración desde Holyrics.

### Added
- 📖 **Importar canciones de Holyrics** (Ajustes → Canciones): admite el JSON
  de su biblioteca/API y texto plano (bloques separados por línea en blanco).
  Mapea cada slide a una sección. Tests unitarios del parser incluidos.
- 🕘 **Historial de la Biblia como botón desplegable** — ya no ocupa espacio fijo.
- ↺ **"Restablecer tema"** en Proyección: vuelve el fondo/fuente/colores al
  valor por defecto en un click (recupera de un tema oscuro/roto).
- 🔎 El monitor en vivo vacío muestra "Sin contenido en vivo" (solo operador).

### Changed
- 📖 **Biblia rediseñada a 2 columnas**: navegación (libro → capítulo →
  versículo) a la izquierda, texto seleccionable a la derecha.

### Fixed
- 🔴 **Proyección/preview en negro**: un theme guardado con fondo casi-negro o
  restos de media huérfana se cargaba en cada arranque. Ahora el cargador
  sanea esos estados (degradados/ sólidos casi-negros, imagen/vídeo sin
  archivo, media huérfana) y existe el botón de restablecer.
- 🧊 **Congelación al cambiar la fuente**: el selector pintaba cada opción con
  su propia tipografía, forzando a cargar cientos de fuentes. Ya no.
- 🧊 **Congelación al entrar a la Biblia**: el parseo del JSON (~4 MB) se
  pre-calienta en segundo plano al arrancar.
- 📐 **Desaparecía el buscador de libros** cuando el historial crecía (alturas
  `calc(100vh - …)` rígidas) — sustituido por layout flex.
- 🌐 **Web**: el plan Free decía "5 canciones" — son ilimitadas en local; el
  límite de la nube (backup) es exclusivo de Pro.

---

## [0.2.7] — 2026-05-31

Fixes de 3 problemas reportados, uno de ellos crítico (visto en uso real).

### Fixed
- 🔴 **CRÍTICO: los inputs dejaban de aceptar texto** durante un servicio
  real (escuela dominical). De repente no se podía escribir en ningún
  campo (Biblia, Canciones, editor) hasta minimizar/cerrar. Causa: la
  ventana de Pantalla completa (proyector) era `focusable: true` y robaba
  el foco del teclado de la ventana principal. Fix: la proyección y el
  overlay ahora son `focusable: false` (nunca reciben teclado) + se
  devuelve el foco a la ventana principal al abrir/cerrar proyecciones.
- 🪟 **Ventanas de proyección huérfanas** al cerrar la app — quedaban
  abiertas en el proyector. Ahora se cierran todas (before-quit +
  window-all-closed + cierre confirmado).
- ✍️ **Editor de canciones perdía todo** al hacer click fuera del modal.
  Ahora detecta cambios sin guardar y pide confirmación antes de
  descartar (backdrop, botón X, Cancelar y Escape).

### Added
- 🛑 **Confirmación al cerrar la app** ("¿Seguro que quieres cerrar?")
  para evitar cierres accidentales en mitad de un servicio.

---

## [0.2.6] — 2026-05-31

Sprint de seguridad + escalabilidad + fixes de UX.

### Fixed
- 🐛 **Crash de pantalla negra** (v0.2.4/v0.2.5) — `ReferenceError: Cannot
  access verseHistory before initialization` (TDZ) en BiblePanel. State
  movido arriba.
- ⏱ **Timer (countdown) se congelaba** al cambiar de panel o minimizar.
  Ahora el slide de countdown lleva `endsAt` y el SlideRenderer cuenta con
  su propio reloj — sigue corriendo aunque Herramientas esté desmontado.
  `backgroundThrottling: false` en la ventana principal para que los
  timers no se ralenticen al minimizar.

### Added
- 🎞 **Crossfade al cambiar tema en vivo** — cambiar fondo o tipografía
  mientras hay algo proyectado ahora hace un fade suave (450ms) en vez de
  un corte en seco. Wrapper aditivo y defensivo sobre SlideRenderer.
- 🎨 **Topbar typography** — 'Presenter' en Cormorant Garamond itálica
  cobre, idéntico al SplashScreen. Versión completa (0.2.6).

### Security (hardening del audit con subagente)
- 🔒 **Path traversal** bloqueado en protocolos `media://`, `preset://` y
  en IPC de biblias importadas (validación de id + safeResolveWithin).
- 🔒 **Brute-force del PIN** del mobile remote: rate-limit 5/min/IP +
  lockout 15 min. Tokens con TTL 24h (antes leak de memoria).
- 🔒 **Race condition** en cloudSync que perdía cambios durante un sync.
- 🔒 **SQL LIKE DoS** mitigado (escape de %_ en búsqueda de canciones).
- 🔒 **Stripe webhook** rate-limited (100 req/min/IP).
- 🔒 **CORS allowlist** estricta en `/api/*` (solo orígenes legítimos).
- 🔒 **CSP** en el renderer de Electron + COOP/CORP en la web.
- 🔒 **Supabase** schema-v4: FORCE RLS, REVOKE anon, WITH CHECK en update.

### Performance
- 🏎 Índices nuevos SQLite (title COLLATE NOCASE, updated_at) y Postgres
  (partial WHERE deleted_at IS NULL, device_id, trgm opcional).

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

[Unreleased]: https://github.com/Juanalejo01/eclesia-presenter/compare/v0.2.7...HEAD
[0.2.7]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.7
[0.2.6]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.6
[0.2.2]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.2
[0.2.1]: https://github.com/Juanalejo01/eclesia-presenter/releases/tag/v0.2.1
[0.2.0]: https://github.com/Juanalejo01/eclesia-presenter/compare/v0.1.0...v0.2.0
