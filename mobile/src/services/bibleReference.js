/**
 * bibleReference.js
 *
 * Parser local (sin red) de queries del estilo "Salmos 22:1" → estructura.
 * Misma lógica que BiblePanel.parsedQuery del desktop (extraída para que el
 * mobile pueda autocompletar sin pegar al server cada keystroke).
 *
 * Por qué duplicar la lógica entre desktop y mobile: el mobile NO carga
 * los JSON locales (sería un bundle de 30+ MB innecesario; la fuente de
 * verdad vive en el PC). Pero sí queremos detectar localmente "esto huele
 * a referencia" para mostrar feedback visual ("Ir a Salmos 22:1") antes
 * de que vuelva el server.
 *
 * No resuelve el libro contra ninguna versión — solo tokeniza. El server
 * (src/server/bibleSearch.js) hace la resolución final con su bookmap.
 */

/**
 * @param {string} q
 * @returns {{bookText:string, chapter:number|null, verse:number|null, verseEnd:number|null}}
 */
export function parseReference(q) {
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
        // Si ya hay verse (de un rango), este es el chapter directo;
        // si no hay nada, este es el primer número (chapter por defecto).
        result.chapter = +last
      } else if (result.verse == null) {
        // ya tenemos chapter pero no verse: el chapter previo era en realidad verse
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
 * Normaliza texto igual que el server (mismo algoritmo) para comparaciones
 * tolerantes a acentos / mayúsculas.
 */
export function normalizeText(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡?!.,;:"'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Heurística simple: ¿la query parece una referencia (libro + número) o
 * un texto libre ("amor de Dios")? Útil para mostrar el hint "Ir a..."
 * antes de hacer el round-trip al server.
 *
 * Regla: hay un bookText no vacío Y al menos chapter o verse.
 */
export function looksLikeReference(q) {
  const p = parseReference(q)
  return !!p.bookText && (p.chapter != null || p.verse != null)
}
