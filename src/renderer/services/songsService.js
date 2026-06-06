// Servicio dual: usa IPC de Electron (SQLite real) si está disponible,
// sino cae a localStorage para poder previsualizar en navegador.

import { normalizeText } from './textUtils.js'

const hasElectron = typeof window !== 'undefined' && !!window.electron?.songs
const LS_KEY = 'eclesia.songs'
let nextId = 1

function readLS() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    nextId = Math.max(nextId, ...data.map(s => s.id), 0) + 1
    return data
  } catch { return [] }
}

function writeLS(songs) {
  localStorage.setItem(LS_KEY, JSON.stringify(songs))
}

function seedLSIfEmpty() {
  const existing = readLS()
  if (existing.length > 0) return existing
  const seed = [
    {
      id: nextId++, title: 'Cuán Grande Es Él', author: 'Stuart K. Hine',
      tags: 'adoración,clásica', is_favorite: false,
      sections: [
        { type: 'verse',  label: 'Estrofa 1', text: 'Señor mi Dios, al contemplar los cielos,\nEl firmamento y las estrellas mil' },
        { type: 'chorus', label: 'Coro',      text: 'Mi corazón entona la canción:\n¡Cuán grande es Él! ¡Cuán grande es Él!' },
      ],
    },
    {
      id: nextId++, title: 'Grande y Eterno', author: 'Marcos Witt',
      tags: 'alabanza', is_favorite: false,
      sections: [
        { type: 'verse', label: 'Estrofa', text: 'Grande y eterno es nuestro Dios,\nDigno de toda honra y gloria' },
      ],
    },
  ]
  writeLS(seed)
  return seed
}

// --------- Helpers ---------

/**
 * Comprueba si una canción coincide con la query normalizada.
 * Busca en: título, autor, etiquetas, y el texto de todas las secciones.
 *
 * Exportada para que el SongsPanel use exactamente la misma lógica que el
 * service y el comportamiento sea consistente — incluido el matching sin
 * tildes (importante para letras en español: "corazon" debe encontrar
 * "corazón", "cancion" → "canción", etc).
 */
export function songMatchesQuery(song, q) {
  if (normalizeText(song.title).includes(q)) return true
  if (normalizeText(song.author || '').includes(q)) return true
  if (normalizeText(song.tags || '').includes(q)) return true
  // Buscar en el texto de cada sección
  const sections = Array.isArray(song.sections) ? song.sections : []
  return sections.some(sec => normalizeText(sec.text || '').includes(q))
}

/**
 * Devuelve un fragmento del texto de la primera sección que coincide con q,
 * con la query resaltada. Útil para mostrar al usuario por qué una canción
 * matcheó por LETRA (no por título), p. ej. cuando busca "yo te alabaré".
 * Devuelve null si el match no fue en la letra (fue por título/autor/tag).
 */
export function findLyricSnippet(song, q, around = 30) {
  const sections = Array.isArray(song.sections) ? song.sections : []
  for (const sec of sections) {
    const txt = sec.text || ''
    const idx = normalizeText(txt).indexOf(q)
    if (idx >= 0) {
      const start = Math.max(0, idx - around)
      const end = Math.min(txt.length, idx + q.length + around)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < txt.length ? '…' : ''
      return { label: sec.label, snippet: prefix + txt.slice(start, end).trim() + suffix }
    }
  }
  return null
}

// --------- API pública ---------

export async function listSongs({ search = '', onlyFavorites = false } = {}) {
  if (hasElectron) {
    let songs = await window.electron.songs.list({ search: '', onlyFavorites })
    if (search) {
      const q = normalizeText(search)
      songs = songs.filter(s => songMatchesQuery(s, q))
    }
    return songs
  }

  let songs = seedLSIfEmpty()
  if (search) {
    const q = normalizeText(search)
    songs = songs.filter(s => songMatchesQuery(s, q))
  }
  if (onlyFavorites) songs = songs.filter(s => s.is_favorite)

  // Orden alfabético estricto. El "Servicio del día" se gestiona
  // con un orden separado en localStorage en el componente.
  return songs.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }))
}

export async function createSong(data) {
  if (hasElectron) return window.electron.songs.create(data)

  const songs = readLS()
  const song = {
    id: nextId++, is_favorite: false,
    created_at: Date.now(), updated_at: Date.now(),
    ...data,
  }
  writeLS([...songs, song])
  return song
}

export async function updateSong(id, data) {
  if (hasElectron) return window.electron.songs.update(id, data)

  const songs = readLS()
  const next = songs.map(s => s.id === id ? { ...s, ...data, updated_at: Date.now() } : s)
  writeLS(next)
  return next.find(s => s.id === id)
}

export async function deleteSong(id) {
  if (hasElectron) return window.electron.songs.delete(id)

  const songs = readLS().filter(s => s.id !== id)
  writeLS(songs)
  return { deleted: true, id }
}

export async function toggleFavorite(id) {
  if (hasElectron) return window.electron.songs.favorite(id)

  const songs = readLS()
  const next = songs.map(s => s.id === id ? { ...s, is_favorite: !s.is_favorite } : s)
  writeLS(next)
  return next.find(s => s.id === id)
}

export function isUsingSQLite() {
  return hasElectron
}
