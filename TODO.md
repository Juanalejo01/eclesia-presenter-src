# 📝 Pendientes para la próxima sesión

> Recordatorio: estos son los 4 items que quedaron sin abordar del audit
> de seguridad/perf hecho con subagente en v0.2.6. Trabajarlos al empezar
> la siguiente sesión, ANTES de tocar features nuevas.
>
> Total estimado: **3-4 horas** de trabajo.

---

## 🟠 Importantes pendientes

### 1. Batch fetch en `/api/songs/sync` (esfuerzo: 1-2 h)

**Problema**: por cada canción del payload (hasta 1000) hace 1-3 round trips
a Supabase. Con 500 canciones = 1500 queries serializadas → timeout 30s de
Vercel garantizado en cuentas grandes.

**Fix**:
- Al inicio: 1 sola query `SELECT * FROM cloud_songs WHERE id IN (...)` con
  todos los `cloud_id` involucrados.
- Construir un Map en memoria.
- Después: `.upsert([...], { onConflict: 'id' })` con un batch de hasta 500.

**Archivo**: `web/app/api/songs/sync/route.js` líneas 105-193

---

### 2. Sync incremental en `getSyncPayload` (esfuerzo: 1 h)

**Problema**: cada `triggerSync` (cada mutación de canción) hace
`SELECT * FROM songs` completo + `SELECT * FROM songs_tombstones`. Con
2000 canciones se transfieren MBs por la red en cada cambio.

**Fix**:
- `getSyncPayload(since)` acepta un timestamp `since` (= `state.lastSyncAt`).
- Query: `SELECT * FROM songs WHERE updated_at > ?`
- Solo envía lo que cambió desde el último sync exitoso.
- Ya tenemos el índice `idx_songs_updated_at` para que sea rápido.

**Archivos**:
- `src/main/database.js` función `getSyncPayload`
- `src/main/cloudSync.js` para pasar `state.lastSyncAt` al llamarla

---

### 3. Listener re-suscribe en SongsPanel + BiblePanel (esfuerzo: 30 min)

**Problema**: `useEffect(..., [songs])` desuscribe y re-suscribe el handler
de `'songs:focus-item'` y `'songs:remote-project'` cada vez que `songs`
cambia. Si llega un evento del remoto justo entre desuscripción y
re-suscripción, se pierde. Mismo patrón en BiblePanel.

**Fix**:
- Usar un `ref` mutable para `songs` (no dependencia del effect).
- `useEffect(..., [])` con cleanup correcto.
- En el handler, usar `songsRef.current` en vez de la variable closure.

**Archivos**:
- `src/renderer/components/SongsPanel.jsx` líneas ~267-309
- `src/renderer/components/BiblePanel.jsx` líneas ~289, ~324

---

### 4. Validar source path en `media:addFiles` (esfuerzo: 30 min)

**Problema**: cualquier paths que el renderer pase se acepta si
`fs.existsSync` y la extensión es válida. Si un XSS en renderer pudiera
invocar `addFiles(['C:/Users/.../passwords.txt'])`, el archivo se copia
a `userData/media` (exfiltración local).

**Fix**:
- Validar que `sourcePath` NO esté en directorios sensibles:
  `C:\Windows`, `%SYSTEMROOT%`, `%PROGRAMDATA%`, `%APPDATA%\Microsoft`, etc.
- En macOS: `/System`, `/Library/Keychains`, `~/.ssh`, etc.
- Whitelist mejor que blacklist: aceptar solo Documents, Pictures,
  Videos, Downloads, Desktop, y rutas que el usuario eligió explícitamente
  vía dialog.

**Archivo**: `src/main/main.js` líneas 267-286 (`media:addFiles` handler)

---

## 🚀 Cuando termines estos 4, hablamos de

- Code signing definitivo (Azure Trusted Signing, ~10 €/mes)
- Auto-sync stats con histograma temporal
- Tests E2E que cubran cada panel para evitar TDZ-style crashes
- Marketing / publicación del proyecto

---

## 📅 Notas para retomar

Última versión publicada: **v0.2.6** (2026-05-31)

El subagente de comprehensive-review:code-reviewer ya identificó los 4 items.
No hace falta re-auditar — directamente al fix.

Para retomar el contexto rápido: abre este archivo (`TODO.md`) y empieza por
el más impactante = **#1 (batch fetch)** que es lo que más frena al sync en
producción cuando crece la cuenta del usuario.

Buen trabajo en v0.2.6 — sprint largo de seguridad bien cerrado. 🛡
