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
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
    CREATE INDEX IF NOT EXISTS idx_songs_favorite ON songs(is_favorite);

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

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM songs').get()
  if (count > 0) return

  const seedData = [
    {
      title: 'Cuán Grande Es Él',
      author: 'Stuart K. Hine',
      tags: 'adoración,clásica',
      sections: [
        { type: 'verse', label: 'Estrofa 1', text: 'Señor mi Dios, al contemplar los cielos,\nEl firmamento y las estrellas mil' },
        { type: 'chorus', label: 'Coro', text: 'Mi corazón entona la canción:\n¡Cuán grande es Él! ¡Cuán grande es Él!' },
      ],
    },
    {
      title: 'Grande y Eterno',
      author: 'Marcos Witt',
      tags: 'alabanza',
      sections: [
        { type: 'verse', label: 'Estrofa', text: 'Grande y eterno es nuestro Dios,\nDigno de toda honra y gloria' },
      ],
    },
  ]

  const insert = db.prepare(`
    INSERT INTO songs (title, author, tags, sections)
    VALUES (@title, @author, @tags, @sections)
  `)

  for (const song of seedData) {
    insert.run({ ...song, sections: JSON.stringify(song.sections) })
  }
}

// Parsear filas desde SQLite (sections viene como string JSON)
function parseRow(row) {
  if (!row) return null
  return {
    ...row,
    sections: JSON.parse(row.sections || '[]'),
    is_favorite: !!row.is_favorite,
  }
}

function listSongs({ search = '', onlyFavorites = false } = {}) {
  let sql = 'SELECT * FROM songs WHERE 1=1'
  const params = {}

  if (search) {
    sql += ' AND (title LIKE @q OR author LIKE @q OR tags LIKE @q)'
    params.q = `%${search}%`
  }
  if (onlyFavorites) sql += ' AND is_favorite = 1'

  sql += ' ORDER BY is_favorite DESC, title ASC'
  return db.prepare(sql).all(params).map(parseRow)
}

function getSong(id) {
  return parseRow(db.prepare('SELECT * FROM songs WHERE id = ?').get(id))
}

function createSong(data) {
  const now = Date.now()
  const result = db.prepare(`
    INSERT INTO songs (title, author, key_signature, tempo, tags, sections, created_at, updated_at)
    VALUES (@title, @author, @key_signature, @tempo, @tags, @sections, @created_at, @updated_at)
  `).run({
    title: data.title,
    author: data.author || null,
    key_signature: data.key_signature || null,
    tempo: data.tempo || null,
    tags: data.tags || null,
    sections: JSON.stringify(data.sections || []),
    created_at: now,
    updated_at: now,
  })
  return getSong(result.lastInsertRowid)
}

function updateSong(id, data) {
  db.prepare(`
    UPDATE songs
    SET title = @title, author = @author, key_signature = @key_signature,
        tempo = @tempo, tags = @tags, sections = @sections, updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: data.title,
    author: data.author || null,
    key_signature: data.key_signature || null,
    tempo: data.tempo || null,
    tags: data.tags || null,
    sections: JSON.stringify(data.sections || []),
    updated_at: Date.now(),
  })
  return getSong(id)
}

function deleteSong(id) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(id)
  return { deleted: true, id }
}

function toggleFavorite(id) {
  db.prepare('UPDATE songs SET is_favorite = 1 - is_favorite WHERE id = ?').run(id)
  return getSong(id)
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
  listSongs, getSong, createSong, updateSong, deleteSong, toggleFavorite,
  listMedia, addMedia, deleteMedia,
}
