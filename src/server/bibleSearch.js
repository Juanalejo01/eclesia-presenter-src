// src/server/bibleSearch.js
//
// Módulo Node-side de búsqueda bíblica para el endpoint /api/bible/search.
// Carga los JSON de public/ en memoria al boot (lazy por versionId), expone
// parseReference, searchByReference, searchByText y buildResult.
//
// Por qué un módulo aparte del bibleService del renderer: el renderer usa
// fetch() del browser (import.meta.env.BASE_URL) y vive en un contexto con
// window/electron. Aquí estamos en main-side: fs sync + path.join. Las
// regexs del parser sí son las mismas (extraídas de BiblePanel) para que
// las referencias se interpreten igual desde el desktop y desde el mobile.
//
// Cache: Map<versionId, books[]>. Una vez cargado un JSON, vive en memoria
// hasta el cierre del proceso. ~66 libros × ~50 capítulos × ~30 versículos
// × ~120 chars ≈ 12 MB por versión — aceptable para 10 versiones máximas.
//
// Rate-limit: NO vive aquí — el endpoint en server.js lo aplica antes de
// llamarnos. Este módulo es puro: dadas las dependencias inyectadas
// (rootDir), todas las funciones son síncronas y testeables sin red.

const fs = require('fs')
const path = require('path')
const { BOOK_ALIASES, normalizeText } = require('./bibleSearch.bookmap')

// ---------------- Versiones disponibles ----------------
//
// Mismo set que renderer/services/bibleService.js → LOCAL_VERSIONS, pero
// sin metadata de UI (license, short...). Aquí solo nos importa el
// nombre del JSON. El campo `file` se resuelve relativo a rootDir, que
// por defecto apunta a <repo>/public.

const VERSIONS = {
  rvr1909: 'rvr60.json',
  rvr1960: 'rvr1960.json',
  rv2020:  'rv2020.json',
  nbv:     'nbv.json',
  nvi:     'nvi.json',
  dhh:     'dhh.json',
  lbla:    'lbla.json',
  ntv:     'ntv.json',
  pdt:     'pdt.json',
  tla:     'tla.json',
}

const DEFAULT_VERSION = 'rvr1960'
const VERSION_IDS = Object.freeze(Object.keys(VERSIONS))

// Cache: versionId → books[]. Cada book: { index, name, chapters[][] }.
const _cache = new Map()

// rootDir resuelto al boot. Permite override en tests (mock dir).
let _rootDir = path.join(__dirname, '..', '..', 'public')

/**
 * Override del directorio raíz donde viven los JSON. Útil en tests.
 * En producción se llama una vez (o nunca) al boot del server.
 */
function setRootDir(dir) {
  if (typeof dir === 'string' && dir.length > 0) {
    _rootDir = dir
    _cache.clear()
  }
}

/**
 * Carga (o devuelve cacheada) la versión.
 * Devuelve null si el archivo no existe o no es parseable — el endpoint
 * mapea esto a 503 'bible_unavailable' sin exponer paths.
 *
 * @param {string} versionId
 * @returns {Array<{index, name, chapters: string[][]}> | null}
 */
function loadVersion(versionId) {
  const id = VERSIONS[versionId] ? versionId : DEFAULT_VERSION
  if (_cache.has(id)) return _cache.get(id)
  const file = VERSIONS[id]
  if (!file) return null
  const full = path.join(_rootDir, file)
  try {
    const raw = fs.readFileSync(full, 'utf8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return null
    const books = data.map((b, idx) => ({
      index: idx,
      // Los JSON de rvr1960 etc. ya vienen en español (cf. raw[0].name === 'Génesis').
      name: String(b?.name || `Libro ${idx + 1}`),
      chapters: Array.isArray(b?.chapters) ? b.chapters : [],
    }))
    _cache.set(id, books)
    return books
  } catch (e) {
    // No exponemos el path al endpoint, solo log local.
    console.warn('[bibleSearch] loadVersion failed:', e?.message || e)
    return null
  }
}

/**
 * Resuelve un alias de libro (ES) a su nombre canónico (ES, ej "Salmos").
 * Tolerante a acentos, mayúsculas y abreviaciones cortas ("sal", "1co").
 *
 * @param {string} text
 * @returns {string | null} nombre canónico ES o null si no se reconoce.
 */
function resolveBookName(text) {
  if (!text || typeof text !== 'string') return null
  const key = normalizeText(text)
  return BOOK_ALIASES[key] || null
}

/**
 * Parser de query textual a referencia estructurada.
 * Misma lógica que BiblePanel.parsedQuery (extraída para DRY + tests).
 *
 * Acepta:
 *   "salmos"            → { bookText: 'salmos', chapter: null, verse: null, verseEnd: null }
 *   "salmos 22"         → { bookText: 'salmos', chapter: 22, ... }
 *   "salmos 22:1"       → { ..., verse: 1 }
 *   "salmos 22 1"       → mismo que :1 (espacio en vez de :)
 *   "salmos 22:1-5"     → { ..., verseEnd: 5 }
 *   "1 juan 3:16"       → bookText: '1 juan'
 *
 * @param {string} q
 * @returns {{bookText, chapter, verse, verseEnd}}
 */
function parseReference(q) {
  const result = { bookText: '', chapter: null, verse: null, verseEnd: null }
  if (!q || typeof q !== 'string') return result
  const norm = q.trim().replace(/\s*:\s*/g, ' ').replace(/\s*-\s*/g, '-')
  if (!norm) return result
  const tokens = norm.split(/\s+/)
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1]
    const rangeMatch = last.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      result.verseEnd = +rangeMatch[2]
      result.verse   = +rangeMatch[1]
      tokens.pop()
    } else if (/^\d+$/.test(last)) {
      if (result.chapter == null) {
        if (result.verse == null) {
          // primer número desde el final → si solo hay uno, es capítulo
          result.chapter = +last
        } else {
          // ya tenemos verse (de un rango o de un push previo), este es el chapter
          result.chapter = +last
        }
      } else if (result.verse == null) {
        // tenemos chapter pero no verse: el chapter previo era en realidad verse
        result.verse = result.chapter
        result.chapter = +last
      } else {
        break
      }
      tokens.pop()
    } else {
      break
    }
  }
  result.bookText = tokens.join(' ')
  return result
}

/**
 * Resuelve un parsed reference contra una versión cargada.
 * Devuelve un array con 0 o 1 item, o un código de error explícito:
 *   - { ok:true, results:[...] }                     si encontrado
 *   - { ok:false, error:'book_not_found' }           libro no identificado
 *   - { ok:false, error:'reference_not_found' }      libro OK pero cap/vers fuera de rango
 *
 * @param {{bookText, chapter, verse, verseEnd}} parsed
 * @param {string} versionId
 */
function searchByReference(parsed, versionId = DEFAULT_VERSION) {
  if (!parsed || !parsed.bookText) {
    return { ok: false, error: 'book_not_found' }
  }
  const books = loadVersion(versionId)
  if (!books) return { ok: false, error: 'bible_unavailable' }

  // 1. Intento directo por alias (incluye acentos, abreviaciones).
  let canonical = resolveBookName(parsed.bookText)
  let bookIndex = -1
  if (canonical) {
    bookIndex = books.findIndex(b => normalizeText(b.name) === normalizeText(canonical))
  }
  // 2. Fallback: prefix match contra los nombres de la versión cargada.
  //    Cubre nombres ligeramente distintos entre versiones (ej "Cantares"
  //    vs "Cantar de los Cantares"). El alias ya resuelve la mayoría;
  //    esto es la red de seguridad.
  if (bookIndex < 0) {
    const needle = normalizeText(parsed.bookText)
    bookIndex = books.findIndex(b => normalizeText(b.name).startsWith(needle))
  }
  if (bookIndex < 0) {
    return { ok: false, error: 'book_not_found' }
  }
  const book = books[bookIndex]

  // Solo libro (sin cap/vers) → devolvemos el primer versículo del primer
  // capítulo como "preview" del libro. UX: si el operador escribe "Salmos"
  // sin chapter, mejor mostrar algo que devolver vacío.
  const chapterNum = parsed.chapter || 1
  if (chapterNum < 1 || chapterNum > book.chapters.length) {
    return {
      ok: false,
      error: 'reference_not_found',
      parsed: { book: book.name, chapter: chapterNum, verse: parsed.verse },
    }
  }
  const chapter = book.chapters[chapterNum - 1] || []

  // Sin verse → si el usuario solo dio libro+cap, devolvemos el verso 1
  // del cap (preview). El operador puede editar en el sheet o re-buscar.
  const verseNum = parsed.verse || 1
  if (verseNum < 1 || verseNum > chapter.length) {
    return {
      ok: false,
      error: 'reference_not_found',
      parsed: { book: book.name, chapter: chapterNum, verse: verseNum },
    }
  }

  const verseEnd = parsed.verseEnd && parsed.verseEnd >= verseNum && parsed.verseEnd <= chapter.length
    ? parsed.verseEnd
    : null

  const result = buildResult(book, bookIndex, chapterNum, verseNum, verseEnd, chapter)
  return { ok: true, results: [result] }
}

/**
 * Compone el item de resultado con texto combinado si hay rango.
 */
function buildResult(book, bookIndex, chapterNum, verseNum, verseEnd, chapterArr) {
  const chapter = chapterArr || (book.chapters[chapterNum - 1] || [])
  if (verseEnd && verseEnd > verseNum) {
    const slice = []
    for (let i = verseNum; i <= verseEnd; i++) {
      if (chapter[i - 1] != null) slice.push(chapter[i - 1])
    }
    const text = slice.join(' ')
    return {
      book: book.name,
      bookIndex,
      chapter: chapterNum,
      verse: verseNum,
      verseEnd,
      text,
      reference: `${book.name} ${chapterNum}:${verseNum}-${verseEnd}`,
    }
  }
  return {
    book: book.name,
    bookIndex,
    chapter: chapterNum,
    verse: verseNum,
    text: chapter[verseNum - 1] || '',
    reference: `${book.name} ${chapterNum}:${verseNum}`,
  }
}

/**
 * Búsqueda full-text. Tolerante a acentos y mayúsculas (normalizeText).
 *
 * @param {string} q
 * @param {number} limit
 * @param {string} versionId
 * @returns {{ok:true, results:[...]} | {ok:false, error:string}}
 */
function searchByText(q, limit = 20, versionId = DEFAULT_VERSION) {
  if (typeof q !== 'string') return { ok: false, error: 'q_required' }
  const norm = normalizeText(q)
  if (norm.length < 3) return { ok: false, error: 'q_too_short' }
  const books = loadVersion(versionId)
  if (!books) return { ok: false, error: 'bible_unavailable' }
  const capped = Math.max(1, Math.min(50, Number(limit) || 20))
  const results = []
  for (let b = 0; b < books.length; b++) {
    const book = books[b]
    for (let c = 0; c < book.chapters.length; c++) {
      const chapter = book.chapters[c]
      for (let v = 0; v < chapter.length; v++) {
        if (normalizeText(chapter[v]).includes(norm)) {
          results.push({
            book: book.name,
            bookIndex: b,
            chapter: c + 1,
            verse: v + 1,
            text: chapter[v],
            reference: `${book.name} ${c + 1}:${v + 1}`,
          })
          if (results.length >= capped) return { ok: true, results }
        }
      }
    }
  }
  return { ok: true, results }
}

/**
 * Endpoint helper: dado un query libre, decide si parsea como referencia
 * o cae a fulltext. Devuelve la respuesta lista para el handler.
 *
 * @param {{q, version?, limit?, mode?}} args
 */
function search(args) {
  const versionId = VERSIONS[args.version] ? args.version : DEFAULT_VERSION
  const limit = args.limit
  const mode = args.mode || 'auto'
  const q = String(args.q || '').replace(/\s+/g, ' ').trim()
  if (!q) return { ok: false, error: 'q_required' }

  if (mode === 'text') {
    const r = searchByText(q, limit, versionId)
    if (!r.ok) return r
    return { ok: true, mode: 'text', query: q, version: versionId, results: r.results, count: r.results.length }
  }

  if (mode === 'ref' || mode === 'auto') {
    const parsed = parseReference(q)
    const hasRefSignal = parsed.bookText && (parsed.chapter || resolveBookName(parsed.bookText))
    if (hasRefSignal) {
      const r = searchByReference(parsed, versionId)
      if (r.ok) {
        return { ok: true, mode: 'ref', query: q, version: versionId, results: r.results, count: r.results.length }
      }
      // Si modo explícito 'ref', propagamos el error. En 'auto' caemos a fulltext.
      if (mode === 'ref' || r.error === 'reference_not_found') return r
    }
  }

  // auto fallback → fulltext
  const r = searchByText(q, limit, versionId)
  if (!r.ok) return r
  return { ok: true, mode: 'text', query: q, version: versionId, results: r.results, count: r.results.length }
}

// ---------------- Test helpers ----------------

function __resetForTests() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetForTests no disponible en producción')
  }
  _cache.clear()
}

// ---------------- Rate-limit per-device ----------------
//
// Sliding window 60s. 30 req/min por deviceId. Limpieza pasiva al consultar.
// El Map vive en este módulo (no en pairing) porque es feature-específico
// y no queremos contaminar la API pública del pairing.

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const _rateMap = new Map()

/**
 * Chequea y registra una request para un deviceId.
 * @returns {{allowed:true} | {allowed:false, retryAfterMs:number}}
 */
function checkRateLimit(deviceId) {
  const now = Date.now()
  const id = String(deviceId || 'unknown')
  let arr = _rateMap.get(id)
  if (!arr) { arr = []; _rateMap.set(id, arr) }
  // Filtra timestamps fuera de la ventana.
  while (arr.length > 0 && arr[0] <= now - RATE_WINDOW_MS) arr.shift()
  if (arr.length >= RATE_MAX) {
    const retryAfterMs = arr[0] + RATE_WINDOW_MS - now
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) }
  }
  arr.push(now)
  return { allowed: true }
}

function __resetRateLimitForTests() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetRateLimitForTests no disponible en producción')
  }
  _rateMap.clear()
}

module.exports = {
  VERSION_IDS,
  DEFAULT_VERSION,
  setRootDir,
  loadVersion,
  parseReference,
  resolveBookName,
  searchByReference,
  searchByText,
  buildResult,
  search,
  checkRateLimit,
  RATE_WINDOW_MS,
  RATE_MAX,
  __resetForTests,
  __resetRateLimitForTests,
}
