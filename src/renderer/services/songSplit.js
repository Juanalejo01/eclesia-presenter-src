// Auto-split de canciones para presentación.
// Cada sección se parte en sub-slides según un máximo de líneas o caracteres.

const DEFAULT_MAX_LINES = 4
const DEFAULT_MAX_CHARS = 220   // por sub-slide

/**
 * Parte un texto con saltos de línea en chunks de hasta `maxLines`.
 * Respeta líneas en blanco como separador natural cuando es posible.
 */
export function splitText(text, { maxLines = DEFAULT_MAX_LINES, maxChars = DEFAULT_MAX_CHARS } = {}) {
  if (!text) return []
  const lines = text.split('\n').map(l => l.trim())

  const chunks = []
  let current = []
  let currentChars = 0

  const flush = () => {
    if (current.length === 0) return
    chunks.push(current.join('\n'))
    current = []
    currentChars = 0
  }

  for (const line of lines) {
    const lineLen = line.length + 1
    // Count only non-empty lines toward the limit (blank lines are separators, not content)
    const nonEmptyCount = current.filter(l => l.length > 0).length
    const overLines = nonEmptyCount >= maxLines
    const overChars = currentChars + lineLen > maxChars && current.length > 0
    if (overLines || overChars) flush()
    current.push(line)
    currentChars += lineLen
  }
  flush()

  return chunks
}

/**
 * Genera la lista plana de sub-slides de una canción.
 * Cada sub-slide carga el contexto: section index + part index + total + label.
 */
export function songToSlides(song, options = {}) {
  if (!song?.sections?.length) return []
  const slides = []
  song.sections.forEach((section, sIdx) => {
    const parts = splitText(section.text || '', options)
    const total = parts.length
    parts.forEach((text, pIdx) => {
      slides.push({
        text,
        reference: total > 1
          ? `${song.title} · ${section.label} (${pIdx + 1}/${total})`
          : `${song.title} · ${section.label}`,
        type: 'song',
        sectionIndex: sIdx,
        partIndex: pIdx,
        partTotal: total,
        sectionType: section.type,
        sectionLabel: section.label,
      })
    })
  })
  return slides
}
