// Lienzo único del editor de canciones.
//
// La letra completa se escribe en un solo textarea:
//   - línea en blanco (doble Enter) = nueva sección → nuevo slide
//   - línea que empieza por "#" = etiqueta de la sección que sigue
//     ("#Coro", "#Estrofa 2"...) y se hereda en los bloques siguientes
//     hasta el próximo "#" (un coro de 2 slides = dos bloques bajo #Coro)
//
// Convierte lienzo ⇄ sections[{type, label, text}] — el mismo modelo que
// consumen songToSlides, la BD y el mando móvil, así que nada más cambia.

// Partes ofrecidas por el autocompletado al escribir "#".
export const SECTION_SUGGESTIONS = [
  { type: 'verse',  label: 'Estrofa' },
  { type: 'chorus', label: 'Coro' },
  { type: 'chorus', label: 'Estribillo' },
  { type: 'bridge', label: 'Puente' },
  { type: 'intro',  label: 'Intro' },
  { type: 'outro',  label: 'Final' },
  { type: 'tag',    label: 'Tag' },
]

// Label canónico por type (para serializar secciones sin label).
const CANONICAL_LABEL = {
  verse: 'Estrofa', chorus: 'Coro', bridge: 'Puente',
  intro: 'Intro', outro: 'Final', tag: 'Tag',
}

const ALIASES = {
  estrofa: 'verse', verso: 'verse', verse: 'verse',
  coro: 'chorus', estribillo: 'chorus', chorus: 'chorus',
  puente: 'bridge', bridge: 'bridge',
  intro: 'intro', introduccion: 'intro',
  final: 'outro', outro: 'outro', salida: 'outro',
  tag: 'tag', coda: 'tag',
}

const normalize = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim()

/**
 * Resuelve una etiqueta libre a su type canónico, o null si no se reconoce.
 * Tolerante a mayúsculas/acentos y a número final ("Estrofa 2"). Si la
 * etiqueta completa no es un alias, prueba con la primera palabra
 * ("Coro final" → chorus) — cubre labels libres del editor antiguo.
 */
export function typeFromLabel(label) {
  const norm = normalize(label).replace(/[\s\-·.:]*\d+$/, '').trim()
  if (!norm) return null
  if (ALIASES[norm]) return ALIASES[norm]
  const first = norm.split(/\s+/)[0]
  return ALIASES[first] || null
}

/**
 * Lienzo → sections[]. Bloques separados por líneas en blanco; "#etiqueta"
 * marca (y se hereda hasta el próximo "#"). Bloques sin etiqueta → verse
 * auto-numerada "Estrofa N". Secciones sin letra no se emiten.
 */
export function parseCanvas(text) {
  if (!text || typeof text !== 'string') return []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  const sections = []
  let meta = null       // { type, label } del último "#" visto (se hereda)
  let current = []      // líneas del bloque en curso
  let autoCount = 0     // numeración de "Estrofa N" automáticas

  const flush = () => {
    if (current.length === 0) return
    const body = current.join('\n')
    current = []
    if (meta) {
      sections.push({ type: meta.type, label: meta.label, text: body })
    } else {
      autoCount++
      sections.push({ type: 'verse', label: `Estrofa ${autoCount}`, text: body })
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('#')) {
      flush()
      const raw = line.replace(/^#+\s*/, '').trim()
      if (raw) {
        const label = raw.charAt(0).toUpperCase() + raw.slice(1)
        meta = { type: typeFromLabel(raw) || 'verse', label }
      } else {
        meta = null  // "#" suelto: separador sin etiqueta → vuelve a auto
      }
    } else if (line === '') {
      flush()       // doble Enter: cierra el bloque, meta se hereda
    } else {
      current.push(line)
    }
  }
  flush()
  return sections
}

/**
 * sections[] → lienzo. Encabezado "#label" por sección y línea en blanco
 * entre bloques. parseCanvas(sectionsToCanvas(x)) preserva type/label/text
 * siempre que el label resuelva su type (los del dropdown y los
 * auto-generados lo hacen).
 */
export function sectionsToCanvas(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return ''
  return sections
    .map(s => `#${s.label || CANONICAL_LABEL[s.type] || 'Estrofa'}\n${s.text || ''}`)
    .join('\n\n')
}

/**
 * Detecta si el caret está escribiendo un encabezado "#..." al inicio de
 * línea. Devuelve { start: índice del '#', query: texto tras el '#' hasta
 * el caret } o null. El componente lo usa para abrir/filtrar el menú.
 */
export function getHashContext(text, caret) {
  if (typeof text !== 'string' || typeof caret !== 'number') return null
  const before = text.slice(0, caret)
  const lineStart = before.lastIndexOf('\n') + 1
  const line = before.slice(lineStart)
  const m = line.match(/^(\s*)#([^#\n]*)$/)
  if (!m) return null
  return { start: lineStart + m[1].length, query: m[2] }
}
