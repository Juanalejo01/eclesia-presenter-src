const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db = null

function getDbPath() {
  return path.join(app.getPath('userData'), 'eclesia.db')
}

function init() {
  if (db) return db

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Esquema: canciones con secciones (JSON array)
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      key_signature TEXT,
      tempo INTEGER,
      tags TEXT,
      sections TEXT NOT NULL DEFAULT '[]',
      max_lines INTEGER DEFAULT 4,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      cloud_id TEXT,                                                 -- uuid en cloud_songs si está sincronizada
      cloud_synced_at INTEGER,                                       -- ms del último sync exitoso
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
    CREATE INDEX IF NOT EXISTS idx_songs_favorite ON songs(is_favorite);

    -- Tabla de tombstones: cuando borramos una canción que ya estaba en cloud,
    -- guardamos el cloud_id para enviarlo al próximo sync (soft delete remoto).
    CREATE TABLE IF NOT EXISTS songs_tombstones (
      cloud_id TEXT PRIMARY KEY,
      deleted_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );`)

  // Migraciones de columnas en songs (para usuarios con DB anterior a v0.5).
  // SQLite no tiene ADD COLUMN IF NOT EXISTS, así que pragma_table_info lo verificamos.
  const songsCols = db.prepare("PRAGMA table_info(songs)").all().map(c => c.name)
  if (!songsCols.includes('cloud_id')) {
    try { db.exec(`ALTER TABLE songs ADD COLUMN cloud_id TEXT`) } catch (e) { console.warn('migration cloud_id:', e.message) }
  }
  if (!songsCols.includes('cloud_synced_at')) {
    try { db.exec(`ALTER TABLE songs ADD COLUMN cloud_synced_at INTEGER`) } catch (e) { console.warn('migration cloud_synced_at:', e.message) }
  }
  if (!songsCols.includes('max_lines')) {
    try { db.exec(`ALTER TABLE songs ADD COLUMN max_lines INTEGER DEFAULT 4`) } catch (e) { console.warn('migration max_lines:', e.message) }
  }
  // theme_override: JSON con fondo/tipografía propios. NULL = usa tema global.
  // Permite que una canción tenga su estilo visual propio (fondo + fuente) que
  // se aplica solo al proyectarla, sin afectar al theme global ni a otras.
  if (!songsCols.includes('theme_override')) {
    try { db.exec(`ALTER TABLE songs ADD COLUMN theme_override TEXT`) } catch (e) { console.warn('migration theme_override:', e.message) }
  }

  // Migración perf v0.2.6: índices adicionales para queries comunes
  // que el optimizer NO podía resolver con los índices anteriores:
  //
  // 1. idx_songs_title_nocase — la query es ORDER BY title COLLATE NOCASE
  //    pero el índice original era sobre title sin collation. SQLite no usa
  //    un índice con collation diferente. Este lo arregla.
  // 2. idx_songs_updated_at — el cloud sync hace WHERE updated_at > since
  //    para incremental. Sin índice, escanea la tabla entera.
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_songs_title_nocase
        ON songs(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_songs_updated_at
        ON songs(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_songs_tombstones_deleted_at
        ON songs_tombstones(deleted_at DESC);
    `)
  } catch (e) { console.warn('migration perf indexes:', e.message) }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_songs_cloud ON songs(cloud_id);

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,             -- 'image' | 'video'
      path TEXT NOT NULL,             -- ruta absoluta (ya copiada al userData)
      mime TEXT,
      size INTEGER,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
    CREATE INDEX IF NOT EXISTS idx_media_added ON media(added_at DESC);
  `)

  seedIfEmpty()
  return db
}

// Seed inicial: solo himnos en dominio público (sin riesgo de copyright).
// Se inserta UNA SOLA VEZ al primer arranque cuando la tabla songs está vacía.
// El usuario puede editar / eliminar / reemplazar libremente.
function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM songs').get()
  if (count > 0) return

  const seedData = [
    {
      title: 'Sublime Gracia',
      author: 'John Newton (1779) · Trad. tradicional',
      tags: 'himno,clásica,dominio público',
      sections: [
        { type: 'verse',  label: 'Estrofa 1', text: 'Sublime gracia del Señor\nque a un infeliz salvó;\nFui ciego, mas hoy veo yo,\nperdido y Él me halló.' },
        { type: 'verse',  label: 'Estrofa 2', text: 'Su gracia me enseñó a temer,\nmis dudas ahuyentó;\n¡Oh, cuán precioso fue a mi ser\ncuando Él me transformó!' },
        { type: 'verse',  label: 'Estrofa 3', text: 'En los peligros o aflicción\nque yo he tenido aquí,\nsu gracia siempre me libró\ny me guiará feliz.' },
        { type: 'verse',  label: 'Estrofa 4', text: 'Y cuando en Sion por siglos mil,\nbrillando esté cual sol,\nyo cantaré por siempre allí\nsu amor que me salvó.' },
      ],
    },
    {
      title: 'Castillo Fuerte es Nuestro Dios',
      author: 'Martín Lutero (1529) · Trad. tradicional',
      tags: 'himno,clásica,dominio público,reforma',
      sections: [
        { type: 'verse',  label: 'Estrofa 1', text: 'Castillo fuerte es nuestro Dios,\ndefensa y buen escudo;\ncon su poder nos librará\nen este trance agudo.' },
        { type: 'verse',  label: 'Estrofa 2', text: 'Con furia y con afán\nacósanos Satán;\npor armas deja ver\nastucia y gran poder;\ncual él no hay en la tierra.' },
        { type: 'verse',  label: 'Estrofa 3', text: 'Nuestro valor es nada aquí,\ncon él todo es perdido;\nmas por nosotros pugnará\nde Dios el Escogido.' },
      ],
    },
    {
      title: 'A Dios Sea la Gloria',
      author: 'Fanny J. Crosby (1875) · Trad. tradicional',
      tags: 'himno,alabanza,dominio público',
      sections: [
        { type: 'verse',  label: 'Estrofa 1', text: 'A Dios sea gloria, grandes cosas Él hizo,\ntanto nos amó que a su Hijo nos dio,\nquien dio su vida nuestro ser redimiendo,\ny las puertas del cielo nos abrió.' },
        { type: 'chorus', label: 'Coro',      text: 'Alabadle, alabadle, oh tierra al Señor;\nAlabadle, alabadle, grande es su amor.\nVenid, oh familias del mundo, venid,\ny por Cristo a nuestro Padre acudid;\npor Él gloria a Dios cantad.' },
      ],
    },
    {
      title: 'Cuán Glorioso es Mi Cristo',
      author: 'Edmond L. Budry (1884) · Trad. tradicional',
      tags: 'himno,resurrección,dominio público',
      sections: [
        { type: 'verse',  label: 'Estrofa 1', text: 'Cuán glorioso es mi Cristo,\nEl Cordero inmaculado,\nQuien por mí fue crucificado;\nMi alma proclamará el amor\ndel Señor y Salvador.' },
        { type: 'chorus', label: 'Coro',      text: '¡Aleluya, aleluya, aleluya!\nEs Jesús el vencedor.\n¡Aleluya, aleluya, aleluya!\nGloria a Cristo el Salvador.' },
      ],
    },
    {
      title: 'Santo, Santo, Santo',
      author: 'Reginald Heber (1826) · Trad. tradicional',
      tags: 'himno,adoración,dominio público,trinidad',
      sections: [
        { type: 'verse',  label: 'Estrofa 1', text: 'Santo, santo, santo, Señor omnipotente,\nsiempre el labio mío loores te dará.\nSanto, santo, santo, te adoro reverente,\nDios en tres personas, bendita Trinidad.' },
        { type: 'verse',  label: 'Estrofa 2', text: 'Santo, santo, santo, en numeroso coro\nsantos escogidos te adoran sin cesar.\nDe alegría llenos, y sus coronas de oro\nrinden ante el trono y el cristalino mar.' },
      ],
    },
  ]

  const insert = db.prepare(`
    INSERT INTO songs (title, author, tags, sections)
    VALUES (@title, @author, @tags, @sections)
  `)

  // Transacción para insertar todas atómicamente
  const insertMany = db.transaction((songs) => {
    for (const song of songs) {
      insert.run({ ...song, sections: JSON.stringify(song.sections) })
    }
  })
  insertMany(seedData)

  console.log(`[db] Seeded ${seedData.length} canciones de inicio (himnos en dominio público)`)
}

// Parsear filas desde SQLite (sections viene como string JSON)
function parseRow(row) {
  if (!row) return null
  let themeOverride = null
  if (row.theme_override) {
    try { themeOverride = JSON.parse(row.theme_override) } catch {}
  }
  return {
    ...row,
    sections: JSON.parse(row.sections || '[]'),
    is_favorite: !!row.is_favorite,
    theme_override: themeOverride,
  }
}

function listSongs({ search = '', onlyFavorites = false } = {}) {
  let sql = 'SELECT * FROM songs WHERE 1=1'
  const params = {}

  if (search) {
    // Escape de wildcards LIKE para prevenir ReDoS-equivalent: un user
    // malicioso podría enviar '%%%%' y forzar escaneo exhaustivo de la
    // tabla. ESCAPE '\' interpreta \% y \_ como literales.
    const safeSearch = String(search).replace(/[\\%_]/g, '\\$&')
    sql += " AND (title LIKE @q ESCAPE '\\' OR author LIKE @q ESCAPE '\\' OR tags LIKE @q ESCAPE '\\')"
    params.q = `%${safeSearch}%`
  }
  if (onlyFavorites) sql += ' AND is_favorite = 1'

  // Orden alfabético estricto (case-insensitive). El "Servicio del día"
  // se gestiona en el renderer con un array de orden persistente, no aquí.
  sql += ' ORDER BY title COLLATE NOCASE ASC'
  return db.prepare(sql).all(params).map(parseRow)
}

function getSong(id) {
  return parseRow(db.prepare('SELECT * FROM songs WHERE id = ?').get(id))
}

// Busca una canción local por su cloud_id (uuid de cloud_songs). Usado al
// importar una lista del día de la nube (C3b): los items 'song' traen el
// cloudSongId y el desktop resuelve la canción local correspondiente.
// Devuelve null si esa canción aún no está sincronizada en este PC.
function getSongByCloudId(cloudId) {
  if (!cloudId) return null
  return parseRow(db.prepare('SELECT * FROM songs WHERE cloud_id = ?').get(cloudId))
}

function createSong(data) {
  const now = Date.now()
  const result = db.prepare(`
    INSERT INTO songs (title, author, key_signature, tempo, tags, sections, max_lines, theme_override, created_at, updated_at)
    VALUES (@title, @author, @key_signature, @tempo, @tags, @sections, @max_lines, @theme_override, @created_at, @updated_at)
  `).run({
    title: data.title,
    author: data.author || null,
    key_signature: data.key_signature || null,
    tempo: data.tempo || null,
    tags: data.tags || null,
    sections: JSON.stringify(data.sections || []),
    max_lines: data.maxLines || 4,
    theme_override: data.theme_override ? JSON.stringify(data.theme_override) : null,
    created_at: now,
    updated_at: now,
  })
  return getSong(result.lastInsertRowid)
}

function updateSong(id, data) {
  db.prepare(`
    UPDATE songs
    SET title = @title, author = @author, key_signature = @key_signature,
        tempo = @tempo, tags = @tags, sections = @sections,
        max_lines = @max_lines, theme_override = @theme_override,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: data.title,
    author: data.author || null,
    key_signature: data.key_signature || null,
    tempo: data.tempo || null,
    tags: data.tags || null,
    sections: JSON.stringify(data.sections || []),
    max_lines: data.maxLines || 4,
    theme_override: data.theme_override ? JSON.stringify(data.theme_override) : null,
    updated_at: Date.now(),
  })
  return getSong(id)
}

function deleteSong(id) {
  // Si la canción estaba en cloud, registrar tombstone para que el próximo
  // sync propague el delete a todos los demás PCs del usuario.
  const row = db.prepare('SELECT cloud_id FROM songs WHERE id = ?').get(id)
  if (row?.cloud_id) {
    db.prepare(`
      INSERT OR REPLACE INTO songs_tombstones (cloud_id, deleted_at)
      VALUES (?, ?)
    `).run(row.cloud_id, Date.now())
  }
  db.prepare('DELETE FROM songs WHERE id = ?').run(id)
  return { deleted: true, id }
}

function toggleFavorite(id) {
  db.prepare('UPDATE songs SET is_favorite = 1 - is_favorite, updated_at = ? WHERE id = ?')
    .run(Date.now(), id)
  return getSong(id)
}

// --------- Cloud sync helpers ---------

/**
 * Devuelve las canciones y tombstones que han cambiado desde `since` (ms).
 *
 * `since = 0` significa "enviar todo" (primer sync o reset).
 * Con el indice idx_songs_updated_at la query es O(log n) en vez de O(n).
 *
 * Por que importa: antes se enviaba la tabla entera en cada mutacion.
 * Con 2000 canciones = varios MB por sync. Ahora solo viajan las filas
 * modificadas desde el ultimo sync exitoso.
 */
function getSyncPayload(since = 0) {
  // Convertir ms a ISO para la comparacion; si since=0 mandamos todo.
  const sinceIso = since > 0 ? new Date(since).toISOString() : '1970-01-01T00:00:00.000Z'

  const songs = db.prepare(`
    SELECT id, cloud_id, title, author, tags, key_signature, tempo, sections,
           max_lines, is_favorite, updated_at
    FROM songs
    WHERE updated_at > ?
  `).all(since).map(s => ({
    local_key: `local-${s.id}`,
    cloud_id: s.cloud_id || null,
    title: s.title,
    author: s.author,
    tags: s.tags,
    key_signature: s.key_signature,
    tempo: s.tempo,
    sections: JSON.parse(s.sections || '[]'),
    max_lines: s.max_lines || 4,
    is_favorite: !!s.is_favorite,
    updated_at: s.updated_at,
    deleted: false,
  }))

  // Tombstones: mandamos todos siempre porque son pocos y no tienen updated_at
  // separado del deleted_at. El servidor los idempotentiza.
  const tombstones = db.prepare(`
    SELECT cloud_id, deleted_at FROM songs_tombstones
  `).all().map(t => ({
    cloud_id: t.cloud_id,
    updated_at: t.deleted_at,
    deleted: true,
  }))

  return [...songs, ...tombstones]
}

/** Aplica el resultado del sync al SQLite local. */
function applySyncResult({ remote, mapping }) {
  const stats = { inserted: 0, updated: 0, deleted: 0 }
  const tx = db.transaction(() => {
    // 1. Aplicar mapping: para cada local song que el server insertó, guardar su cloud_id
    for (const [localKey, cloudId] of Object.entries(mapping || {})) {
      const m = localKey.match(/^local-(\d+)$/)
      if (!m) continue
      db.prepare('UPDATE songs SET cloud_id = ?, cloud_synced_at = ? WHERE id = ?')
        .run(cloudId, Date.now(), parseInt(m[1], 10))
    }

    // 2. Procesar remote: insertar / actualizar / borrar
    for (const r of remote || []) {
      if (r.deleted) {
        // Cloud dice que esta fila está borrada. Borrar localmente si existe.
        const local = db.prepare('SELECT id FROM songs WHERE cloud_id = ?').get(r.cloud_id)
        if (local) {
          db.prepare('DELETE FROM songs WHERE id = ?').run(local.id)
          stats.deleted++
        }
        // Limpiar tombstone si lo teníamos (ya está sincronizado)
        db.prepare('DELETE FROM songs_tombstones WHERE cloud_id = ?').run(r.cloud_id)
        continue
      }

      // ¿Ya tenemos esta canción local?
      const local = db.prepare('SELECT id, updated_at FROM songs WHERE cloud_id = ?').get(r.cloud_id)
      if (local) {
        // Solo actualizar si la versión del cloud es más reciente
        if (r.updated_at > local.updated_at) {
          db.prepare(`
            UPDATE songs SET
              title = @title, author = @author, tags = @tags,
              key_signature = @key_signature, tempo = @tempo,
              sections = @sections, max_lines = @max_lines,
              is_favorite = @is_favorite,
              updated_at = @updated_at,
              cloud_synced_at = @synced
            WHERE id = @id
          `).run({
            id: local.id,
            title: r.title,
            author: r.author || null,
            tags: r.tags || null,
            key_signature: r.key_signature || null,
            tempo: r.tempo || null,
            sections: JSON.stringify(r.sections || []),
            max_lines: r.max_lines || 4,
            is_favorite: r.is_favorite ? 1 : 0,
            updated_at: r.updated_at,
            synced: Date.now(),
          })
          stats.updated++
        }
      } else {
        // Nueva canción de otro PC, insertar
        db.prepare(`
          INSERT INTO songs (
            title, author, tags, key_signature, tempo, sections, max_lines,
            is_favorite, cloud_id, cloud_synced_at, created_at, updated_at
          ) VALUES (
            @title, @author, @tags, @key_signature, @tempo, @sections, @max_lines,
            @is_favorite, @cloud_id, @synced, @created, @updated
          )
        `).run({
          title: r.title,
          author: r.author || null,
          tags: r.tags || null,
          key_signature: r.key_signature || null,
          tempo: r.tempo || null,
          sections: JSON.stringify(r.sections || []),
          max_lines: r.max_lines || 4,
          is_favorite: r.is_favorite ? 1 : 0,
          cloud_id: r.cloud_id,
          synced: Date.now(),
          created: r.updated_at,
          updated: r.updated_at,
        })
        stats.inserted++
      }
    }

    // 3. Limpiar tombstones que el server ya procesó (ahora aparecen en remote con deleted)
    // Esto ya se hizo arriba dentro del loop.
  })
  tx()
  return stats
}

// --------- Media ---------

function listMedia({ type } = {}) {
  let sql = 'SELECT * FROM media'
  const params = {}
  if (type) { sql += ' WHERE type = @type'; params.type = type }
  sql += ' ORDER BY added_at DESC'
  return db.prepare(sql).all(params)
}

function addMedia({ name, type, path, mime, size }) {
  const result = db.prepare(`
    INSERT INTO media (name, type, path, mime, size) VALUES (?, ?, ?, ?, ?)
  `).run(name, type, path, mime || null, size || null)
  return db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid)
}

function deleteMedia(id) {
  const item = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
  if (item) {
    // Borrar el archivo físico también
    try { require('fs').unlinkSync(item.path) } catch {}
  }
  db.prepare('DELETE FROM media WHERE id = ?').run(id)
  return { deleted: true, id }
}

module.exports = {
  init,
  listSongs, getSong, getSongByCloudId, createSong, updateSong, deleteSong, toggleFavorite,
  getSyncPayload, applySyncResult,
  listMedia, addMedia, deleteMedia,
}
