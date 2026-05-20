# Roadmap — EclesiaPresenter

Roadmap público del proyecto. Se actualiza con cada release.

> Para el análisis competitivo detallado (vs ProPresenter / EasyWorship)
> ver [`docs/FEATURE_ANALYSIS.md`](docs/FEATURE_ANALYSIS.md).

---

## ✅ Lanzado

### v0.1.x — Cimientos (Q1 2026)
- Biblia multi-versión con persistencia local (JSON)
- Editor de canciones con plantillas verse/chorus/bridge
- Lista del día reordenable (drag & drop)
- Proyección a ventana externa (capturable por OBS)
- Tema personalizable: fondo, tipografía, transiciones básicas
- Monitor PGM/PVW con tally ON AIR
- Atajos globales (`Ctrl+1..4`, `←/→`, `B`, `.`)
- Importación de biblias `.xmm`
- Servidor LAN embebido (mobile remote con PIN)

### v0.2.0 — Broadcast vibe + Cloud (Q1 2026)
- Sistema visual cinematográfico cobre + durazno
- Custom title bar estilo Discord (Win11 themed)
- Brand icon en taskbar y setup
- Stage Display v2 con notas + countdown integrado
- 🌟 **Cloud sync de canciones (Pro)** — Supabase + 2-way merge
- 🌟 **Biblioteca de fondos preset** — 56 videos CC0 curados de Pexels
- Auto-sync trigger al editar canciones (debounced 2s)
- **Auto-updater** con GitHub Releases + checks en startup
- Web pública con landing, pricing, download portal, docs
- Sprint A — Utilidades: Countdown, Cronómetro, Ruleta, Verso aleatorio

---

## 🚧 En desarrollo (v0.3.x — Q2 2026)

### 🌟 Code signing (Authenticode)
- **Phase 1** — SignPath Foundation OSS (aplicación enviada, esperando aprobación)
- **Phase 2** — Migración a Azure Trusted Signing para reputación inmediata
- Eliminará permanentemente los avisos de Windows SmartScreen

### macOS support estable
- Build firmable + notarización Apple (pendiente certificado developer)
- Pruebas con M1/M2/M3
- DMG installer con assets bonitos

### Linux support
- AppImage funcional + `.deb` para Ubuntu/Debian
- Integración con bandeja del sistema

### Polish proyección
- Más transiciones (parallax, dissolve, swipe, cube)
- Picture-in-picture para subtítulos / traducción
- Modo "blackout dramático" con fade-out gradual
- Snap a próximo elemento en transmission live

---

## 🔭 Planificado (v0.4.x — Q3 2026)

### 🌟 Editor visual de temas
- Drag & drop de elementos en lienzo (título, versículo, foto)
- Guardar templates personalizados ("Sermón Domingo", "Anuncio", etc.)
- Importar templates desde la comunidad (futuro market)

### 🌟 Anuncios e imágenes
- Slides simples con título + cuerpo
- Imagen de fondo personalizada por slide
- Carrusel temporizado para anuncios pre-servicio

### Multi-pantalla nativa
- Detección automática de monitores conectados
- Cada panel a su monitor (proyector / preview / stage display)
- Perfiles guardados por configuración de hardware

### Plantillas listas para predicación
- Layouts especiales: título + punto principal + 3 sub-puntos
- Bullets animados aparecen al avanzar
- Switch rápido entre "letra" y "predicación"

---

## 🎯 v1.0 — Estable (Q4 2026)

Criterios para 1.0:
- [x] Cloud sync funcional
- [x] Auto-updater
- [ ] Code signing activo (sin avisos de SmartScreen)
- [ ] Soporte estable Windows + macOS + Linux
- [ ] Cobertura de tests > 60% (actualmente: 0% 😅)
- [ ] Documentación completa en `docs/` + tutoriales en video
- [ ] 100+ instalaciones activas reportadas
- [ ] Sin bugs P0/P1 abiertos en GitHub Issues

---

## 🔮 Posterior a 1.0 (v1.x — 2027)

### Profesional / iglesias grandes
- **NDI output** — vMix, OBS, ATEM capturan sin pantalla compartida
- **WebRTC streaming** — la app emite el slide a CDN
- **Triggers MIDI / OSC** — control desde mesa de audio o pedales
- **API REST pública** — integraciones con CCLI, Planning Center, etc.

### Crecimiento de la comunidad
- **Marketplace de plantillas** — usuarios suben presets, otros los descargan
- **Marketplace de fondos premium** — videos worship pro (1-3 €)
- **Programa de afiliados** — pastores que recomiendan ganan 20% del primer año

---

## 💡 Backlog (sin fecha)

Cosas que queremos hacer pero sin priorizar todavía:

- **Marketplace de canciones** — librería compartida (CCLI-compatible)
- **Soporte i18n** — interfaz en inglés, portugués, francés
- **Plugin system** — API pública para que terceros añadan paneles
- **Modo coro** — varias letras simultáneas (líder + coro)
- **Integración Spotify / YouTube** — buscar y proyectar letras automáticamente
- **Modo escuela dominical** — slides infantiles con animaciones
- **Calendario litúrgico** — versículos sugeridos por fecha
- **Cliente web read-only** — leer la lista del día desde móvil sin app
- **Recordings export** — grabar la proyección a MP4 para subir a YouTube
- **Modo "ensayo"** — slides + cronómetro + checkbox por canción
- **Letras sincronizadas con audio (karaoke)** — importar MP3 + LRC

---

## 🤝 ¿Cómo contribuir?

- **Reporta bugs**: [GitHub Issues](https://github.com/Juanalejo01/eclesia-presenter/issues)
- **Pide features**: usa el template "Feature Request" en Issues
- **Pull Requests**: bienvenidos — abre Issue primero para discutir alcance
- **Vota lo que más te interesa**: reacciona con 👍 a los Issues del roadmap

---

## 📌 Filosofía

EclesiaPresenter sigue 3 principios al decidir qué entra al roadmap:

1. **La iglesia primero** — antes de añadir features para devs, añadimos para pastores no técnicos.
2. **Sin lock-in** — todos los datos exportables, formato abierto (JSON / SQLite).
3. **Free core, Pro sostén** — el núcleo es MIT gratuito; el Pro (cloud sync, futuras IA) financia el desarrollo.

---

*Última actualización: 2026-05-20*
*Versión actual: v0.2.0 — Próxima: v0.2.1*
