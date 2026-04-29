// Adaptador para scripture.api.bible
// El usuario debe registrar una key gratuita en https://scripture.api.bible

const BASE = 'https://api.scripture.api.bible/v1'
const KEY_STORAGE = 'apibible.key'
const ENABLED_STORAGE = 'apibible.enabled'   // [{id, name, abbr, language, copyright}]
const CACHE_PREFIX = 'apibible.cache.'

// Mapeo USFM (3 letras) → índice local 0-65
const USFM_TO_INDEX = {
  GEN: 0,  EXO: 1,  LEV: 2,  NUM: 3,  DEU: 4,  JOS: 5,  JDG: 6,  RUT: 7,
  '1SA': 8, '2SA': 9, '1KI': 10, '2KI': 11, '1CH': 12, '2CH': 13,
  EZR: 14, NEH: 15, EST: 16, JOB: 17, PSA: 18, PRO: 19, ECC: 20, SNG: 21,
  ISA: 22, JER: 23, LAM: 24, EZK: 25, DAN: 26, HOS: 27, JOL: 28, AMO: 29,
  OBA: 30, JON: 31, MIC: 32, NAM: 33, HAB: 34, ZEP: 35, HAG: 36, ZEC: 37, MAL: 38,
  MAT: 39, MRK: 40, LUK: 41, JHN: 42, ACT: 43, ROM: 44,
  '1CO': 45, '2CO': 46, GAL: 47, EPH: 48, PHP: 49, COL: 50,
  '1TH': 51, '2TH': 52, '1TI': 53, '2TI': 54, TIT: 55, PHM: 56,
  HEB: 57, JAS: 58, '1PE': 59, '2PE': 60, '1JN': 61, '2JN': 62, '3JN': 63,
  JUD: 64, REV: 65,
}
const INDEX_TO_USFM = Object.fromEntries(Object.entries(USFM_TO_INDEX).map(([k, v]) => [v, k]))

// --------- Key + estado ---------

export function getKey() {
  return localStorage.getItem(KEY_STORAGE) || ''
}

export function setKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim())
  else localStorage.removeItem(KEY_STORAGE)
}

export function getEnabledBibles() {
  try { return JSON.parse(localStorage.getItem(ENABLED_STORAGE) || '[]') }
  catch { return [] }
}

export function setEnabledBibles(list) {
  localStorage.setItem(ENABLED_STORAGE, JSON.stringify(list))
}

// --------- Fetch helper ---------

async function apiFetch(path) {
  const key = getKey()
  if (!key) throw new Error('Falta la API key de api.bible')

  const cacheKey = CACHE_PREFIX + path
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) return JSON.parse(cached)

  const response = await fetch(BASE + path, { headers: { 'api-key': key } })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`api.bible ${response.status}: ${body.slice(0, 120)}`)
  }
  const data = await response.json()
  try { sessionStorage.setItem(cacheKey, JSON.stringify(data)) } catch {}
  return data
}

// --------- API pública ---------

/** Lista todas las Biblias disponibles para la key (filtradas por idioma) */
export async function listAvailableBibles(language = 'spa') {
  const data = await apiFetch(`/bibles?language=${language}`)
  return (data.data || []).map(b => ({
    id: b.id,
    name: b.name,
    nameLocal: b.nameLocal || b.name,
    abbr: b.abbreviation,
    language: b.language?.id || language,
    description: b.description,
    copyright: b.copyright || b.license?.name || '',
  }))
}

/** Lista los libros de una Biblia con sus IDs api.bible */
async function listBooks(bibleId) {
  const data = await apiFetch(`/bibles/${bibleId}/books?include-chapters=true`)
  return data.data || []
}

/** Devuelve los 66 libros mapeados a la estructura local (con metadata, sin texto aún) */
export async function getBookSkeleton(bibleId) {
  const cacheKey = `bibleSkeleton.${bibleId}`
  const cached = localStorage.getItem(cacheKey)
  if (cached) return JSON.parse(cached)

  const apiBooks = await listBooks(bibleId)
  const skeleton = new Array(66).fill(null)

  for (const book of apiBooks) {
    const idx = USFM_TO_INDEX[book.id]
    if (idx === undefined) continue
    skeleton[idx] = {
      index: idx,
      bookId: book.id,
      name: book.nameLong || book.name,
      abbrev: book.abbreviation,
      chapterIds: (book.chapters || [])
        .filter(c => c.number !== 'intro')
        .map(c => c.id),
    }
  }

  // Filtrar nulls (canon no estándar)
  const filtered = skeleton.map((b, i) =>
    b || { index: i, bookId: INDEX_TO_USFM[i], name: '?', abbrev: '?', chapterIds: [] }
  )

  try { localStorage.setItem(cacheKey, JSON.stringify(filtered)) } catch {}
  return filtered
}

/** Obtiene el texto de un capítulo, parseando los versículos */
export async function getChapterText(bibleId, bookIndex, chapterNum) {
  const skeleton = await getBookSkeleton(bibleId)
  const book = skeleton[bookIndex]
  if (!book) return null
  const chapterId = book.chapterIds[chapterNum - 1]
  if (!chapterId) return null

  const data = await apiFetch(
    `/bibles/${bibleId}/chapters/${chapterId}` +
    `?content-type=text&include-verse-numbers=true&include-notes=false&include-titles=false`
  )
  const content = data.data?.content || ''

  // Parsear "[1] texto del versículo. [2] texto..." → array de strings
  const verses = parseVersesFromText(content)
  return verses
}

function parseVersesFromText(content) {
  // Formato: "     [1]En el principio... [2]Y la tierra...  ¶ [3]..."
  const cleaned = content.replace(/¶/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = cleaned.split(/\[(\d+)\]/).slice(1)  // [num1, text1, num2, text2, ...]
  const verses = []
  for (let i = 0; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10)
    const text = (parts[i + 1] || '').trim()
    if (num && text) verses[num - 1] = text
  }
  return verses
}

/** Test rápido de validez de la key */
export async function testKey(key) {
  const tmp = key.trim()
  if (!tmp) return { ok: false, error: 'Key vacía' }
  try {
    const response = await fetch(`${BASE}/bibles?language=spa`, {
      headers: { 'api-key': tmp },
    })
    if (!response.ok) {
      return { ok: false, error: `${response.status}: ${response.statusText}` }
    }
    const data = await response.json()
    return { ok: true, count: data.data?.length || 0 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
