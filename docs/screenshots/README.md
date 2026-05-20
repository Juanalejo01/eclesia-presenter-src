# Capturas y GIFs para el README

Esta carpeta contiene los assets visuales que el `README.md` principal
referencia. Lista de capturas pendientes con especificación exacta:

## 🎯 Hero (PRIORIDAD ALTA)

**Archivo**: `hero.png`
**Tamaño**: 1600×900 px (16:9)
**Qué capturar**:
- App abierta en modo proyección de canción
- Panel de Lista del día visible a la izquierda
- Monitor PGM/PVW a la derecha con tally ON AIR encendido
- Tema con gradiente cobre/durazno aplicado

**Cómo hacerlo**:
1. Abre la app maximizada (que ocupa toda la pantalla)
2. Carga una canción de ejemplo con buen contenido (ej. "Grande es tu fidelidad")
3. Pulsa "Tomar al aire" en la transmisión
4. Win+Shift+S → captura solo la ventana (no la barra de tareas)
5. Edita en cualquier editor para asegurar 1600×900

---

## 📖 Bible Panel

**Archivo**: `bible-panel.png`
**Tamaño**: 1400×800 px
**Qué capturar**:
- Panel de Biblia activo
- Búsqueda visible (ej. "Juan 3:16")
- Selección múltiple de versículos resaltada
- Tema oscuro

---

## 🎵 Songs Editor

**Archivo**: `songs-editor.png`
**Tamaño**: 1400×800 px
**Qué capturar**:
- Editor abierto en una canción con verso + coro + puente
- Sección de plantillas visible
- Vista previa del slide a la derecha (si lo activas)

---

## 📋 Schedule (GIF)

**Archivo**: `schedule.gif`
**Duración**: 5-8 segundos
**Tamaño**: 1200×700 px, 15 fps, < 5 MB
**Qué grabar**:
1. (0-2s) Lista del día con 4-5 elementos
2. (2-4s) Drag de un elemento a otra posición
3. (4-6s) Selección con flechas `←/→`
4. (6-8s) Slide proyectando en monitor secundario

**Cómo grabar**:
- Windows: [ScreenToGif](https://www.screentogif.com/) (gratis)
- macOS: QuickTime + [Gifski](https://gif.ski/) para convertir

---

## 🖥 Projection desde OBS

**Archivo**: `projection-obs.png`
**Tamaño**: 1400×800 px
**Qué capturar**:
- OBS abierto con scene activa
- Source de "Window Capture" apuntando a la ventana overlay
  transparente de EclesiaPresenter
- Verse proyectado superpuesto sobre el fondo de OBS
- Preview de OBS visible

Si no tienes OBS: alternativa → captura del overlay flotando sobre
un wallpaper / fondo de escritorio (menos pro pero suficiente).

---

## 📺 Stage Display (BONUS)

**Archivo**: `stage-display.png`
**Tamaño**: 1400×800 px
**Qué capturar**:
- Ventana de Stage Display abierta
- Slide actual + próximo slide pre-renderizado
- Reloj grande
- Notas del predicador visibles
- Countdown corriendo

---

## ☁ Cloud Sync (GIF)

**Archivo**: `cloud-sync.gif`
**Duración**: 8-10 segundos
**Qué grabar** (lado a lado split-screen):
- PC A: usuario edita una canción
- PC B: la canción aparece auto-actualizada en ~2 segundos

Si solo tienes 1 PC: simula con 2 ventanas Electron locales pointing
to dos bases SQLite distintas, mostrando el sync entre ellas.

---

## 📱 Mobile Remote

**Archivo**: `mobile-remote.png`
**Tamaño**: 1400×800 px (preferible: mockup de iPhone)
**Qué capturar**:
- Móvil conectado a la web del servidor LAN
- Una de las 3 pestañas (Slides, Biblia o Lista)
- App de escritorio visible al fondo (split view o mockup)

---

## Consejos generales

1. **Resolución**: Captura a 1×, no a 2× — los PNG a 2× pesan más sin
   verse mejor en GitHub.
2. **Compresión**: Pasa cada PNG por [tinypng.com](https://tinypng.com/)
   antes de commitear (suele reducir 60-70% sin pérdida visible).
3. **GIFs**: máximo 5 MB. Si pesa más, baja FPS o duración.
4. **Privacidad**: revisa que NO aparezcan nombres reales de personas,
   emails personales, ni canciones con copyright en pantalla.
5. **Consistencia**: usa siempre el mismo tema (cobre/durazno) para que
   se vean uniformes.

---

## Cuándo actualizar

- **Cada major release** (v0.3, v0.4, v1.0): refrescar todas las
  capturas para reflejar la UI actual.
- **Al añadir feature nueva** que valga la pena destacar: añadir
  captura específica + actualizar README.
