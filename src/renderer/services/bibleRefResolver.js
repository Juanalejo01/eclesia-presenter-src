// bibleRefResolver.js — Resuelve una referencia bíblica en formato string
// (ej. "Juan 3:16-18") al { text, reference, meta } que usa el schedule local,
// reutilizando bibleService (las mismas Biblias JSON que ve BiblePanel).
//
// Usado al importar una lista del día de la nube (C3b): el móvil guarda SOLO
// la referencia textual (contrato jsonb), y el desktop resuelve el texto contra
// sus Biblias locales al importar.
//
// Async porque bibleService.getBooks/getChapter cargan los JSON bajo demanda.

import { getBooks, getChapter, combineVerses } from './bibleService.js'
import { normalizeText } from './textUtils.js'

// Parsea "Juan 3:16", "1 Corintios 13:4-7", "Salmos 23" → partes.
// Devuelve null si no tiene forma de referencia.
export function parseReferenceString(reference) {
  if (!reference || typeof reference !== 'string') return null
  const raw = reference.trim()
  // Captura: <nombre libro> <capítulo>[:<verso>[-<versoFin>]]
  // El nombre del libro puede empezar por dígito ("1 Juan", "2 Corintios").
  const m = raw.match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?\s*$/)
  if (!m) return null
  const [, bookName, chapter, verseStart, verseEnd] = m
  return {
    bookName: bookName.trim(),
    chapterNum: parseInt(chapter, 10),
    verseStart: verseStart ? parseInt(verseStart, 10) : null,
    verseEnd: verseEnd ? parseInt(verseEnd, 10) : (verseStart ? parseInt(verseStart, 10) : null),
  }
}

// Encuentra el índice del libro cuyo nombre coincide (tolerante a tildes/caso).
function findBookIndex(books, name) {
  const target = normalizeText(name)
  // Coincidencia exacta normalizada primero, luego prefijo.
  let idx = books.findIndex(b => normalizeText(b.name) === target)
  if (idx >= 0) return idx
  idx = books.findIndex(b => normalizeText(b.name).startsWith(target))
  return idx  // -1 si no hay
}

/**
 * Resuelve una referencia string a { text, reference, meta } o null.
 * @param {string} reference  ej "Juan 3:16-18"
 * @param {string} [versionId]  versión bíblica (ej "rvr1960"); si no resuelve,
 *        bibleService cae a la versión local por defecto.
 * @returns {Promise<{text:string, reference:string, meta:Object}|null>}
 */
export async function resolveBibleReference(reference, versionId) {
  const parsed = parseReferenceString(reference)
  if (!parsed) return null

  let books
  try {
    books = await getBooks(versionId)
  } catch {
    return null
  }
  if (!Array.isArray(books) || books.length === 0) return null

  const bookIndex = findBookIndex(books, parsed.bookName)
  if (bookIndex < 0) return null

  let chapter
  try {
    chapter = await getChapter(bookIndex, parsed.chapterNum, versionId)
  } catch {
    return null
  }
  if (!chapter || !Array.isArray(chapter.verses) || chapter.verses.length === 0) return null

  // Rango de versículos. Si no se especificó verso, tomamos el capítulo entero.
  let verseNums
  if (parsed.verseStart == null) {
    verseNums = chapter.verses.map(v => v.verseNum)
  } else {
    verseNums = []
    for (let n = parsed.verseStart; n <= parsed.verseEnd; n++) verseNums.push(n)
  }

  const versesData = chapter.verses.filter(v => verseNums.includes(v.verseNum))
  if (versesData.length === 0) return null

  const combined = combineVerses(chapter.bookName, chapter.chapterNum, versesData)
  if (!combined) return null

  return {
    text: combined.text,
    reference: combined.reference,
    meta: {
      bookIndex,
      chapterNum: parsed.chapterNum,
      verseNums: versesData.map(v => v.verseNum),
    },
  }
}
