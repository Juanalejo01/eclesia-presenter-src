'use strict'

// Importador de canciones de Holyrics -> modelo EclesiaPresenter.
//
// Holyrics (holyrics.com.br) modela una cancion con estos campos (segun el API
// oficial holyrics/API-Server): title, artist, author, copyright, key, bpm,
// time_sig, groups:[{name}], y slides:[{ text | styled_text, slide_description,
// order }].
//
// Soportamos las dos formas de export realistas al migrar:
//   1. JSON de Holyrics — objeto unico, array, o { songs:[...] } / { data:[...] }.
//   2. Texto plano (.txt) — una cancion por archivo; bloques separados por
//      linea(s) en blanco = secciones (igual que nuestro auto-split al pegar).
//
// Devuelve SIEMPRE un array de canciones en NUESTRO modelo:
//   { title, author, tags, sections:[{type,label,text}], maxLines }

// slide_description de Holyrics (multi-idioma) -> tipo de seccion nuestro.
const TYPE_RULES = [
  { type: 'chorus', re: /(chorus|coro|refr(a|ã|a)o|refrain|estribillo)/i },
  { type: 'bridge', re: /(bridge|puente|ponte)/i },
  { type: 'intro',  re: /(intro|introdu)/i },
  { type: 'outro',  re: /(outro|ending|encerram|coda|\bfinal\b)/i },
  { type: 'tag',    re: /(\btag\b|vamp|turnaround)/i },
  { type: 'verse',  re: /(verse|verso|estrofe|estrofa|strophe)/i },
]

const TYPE_LABEL = {
  verse: 'Estrofa', chorus: 'Coro', bridge: 'Puente',
  intro: 'Intro', outro: 'Final', tag: 'Tag',
}

function classify(description) {
  if (!description) return null
  for (const r of TYPE_RULES) if (r.re.test(description)) return r.type
  return null
}

function cleanText(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

// Holyrics puede traer styled_text con marcado (etiquetas tipo HTML). Nos
// quedamos con el texto plano conservando los saltos de linea.
function stripMarkup(s) {
  if (!s) return ''
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// slides[] de Holyrics -> nuestras secciones, con etiquetas auto-numeradas.
function slidesToSections(slides) {
  if (!Array.isArray(slides)) return []
  const counters = {}
  const out = []
  const ordered = [...slides].sort(
    (a, b) => (Number(a && a.order) || 0) - (Number(b && b.order) || 0)
  )
  for (const sl of ordered) {
    if (!sl || typeof sl !== 'object') continue
    const text = sl.text != null && String(sl.text).trim()
      ? cleanText(sl.text)
      : stripMarkup(sl.styled_text)
    if (!text) continue
    const type = classify(sl.slide_description) || 'verse'
    counters[type] = (counters[type] || 0) + 1
    const desc = (sl.slide_description || '').trim()
    const label = desc || `${TYPE_LABEL[type]} ${counters[type]}`
    out.push({ type, label, text })
  }
  return out
}

// Texto plano -> secciones por bloques separados por linea en blanco.
function textToSections(raw) {
  const blocks = cleanText(raw)
    .split(/\n[ \t]*\n+/)
    .map(b => b.trim())
    .filter(Boolean)
  return blocks.map((text, i) => ({ type: 'verse', label: `Estrofa ${i + 1}`, text }))
}

function tagsFromGroups(groups) {
  const names = Array.isArray(groups)
    ? groups.map(g => (g && g.name ? String(g.name) : '')).filter(Boolean)
    : []
  return ['importada', 'holyrics', ...names]
    .map(t => t.toLowerCase().trim())
    .filter((t, i, a) => t && a.indexOf(t) === i)
    .join(',')
}

// Normaliza UN objeto-cancion de Holyrics a nuestro modelo.
function normalizeSong(h) {
  if (!h || typeof h !== 'object') return null
  const title = (cleanText(h.title || h.name || h.song || '').split('\n')[0] || 'Sin título').slice(0, 200)
  const author = cleanText(h.author || h.artist || h.composer || '') || null

  let sections = []
  if (Array.isArray(h.slides) && h.slides.length) sections = slidesToSections(h.slides)
  else if (typeof h.lyrics === 'string') sections = textToSections(h.lyrics)
  else if (typeof h.text === 'string') sections = textToSections(h.text)
  else if (Array.isArray(h.lyrics)) sections = slidesToSections(h.lyrics)
  if (!sections.length) return null

  return { title, author, tags: tagsFromGroups(h.groups), sections, maxLines: 4 }
}

function parseTextFile(raw, filename) {
  const baseName = String(filename || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  let title = baseName
  let body = raw
  if (!title) {
    // Sin nombre de archivo: primera linea como titulo si va seguida de blanco.
    const m = raw.match(/^\s*([^\n]{1,80})\n\s*\n([\s\S]+)$/)
    if (m) { title = m[1].trim(); body = m[2] }
  }
  const sections = textToSections(body)
  if (!sections.length) return []
  return [{
    title: (title || 'Sin título').slice(0, 200),
    author: null,
    tags: 'importada,holyrics',
    sections,
    maxLines: 4,
  }]
}

/**
 * Parsea el contenido de un archivo de Holyrics -> array de canciones nuestras.
 * @param {string} content  Contenido del archivo (JSON o texto).
 * @param {string} [filename]  Nombre del archivo (para deducir titulo en .txt).
 * @returns {Array<{title,author,tags,sections,maxLines}>}
 */
function parseHolyrics(content, filename = '') {
  const raw = String(content || '')
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed[0] === '{' || trimmed[0] === '[') {
    let data = null
    try { data = JSON.parse(trimmed) } catch { data = null }
    if (data) {
      let list = []
      if (Array.isArray(data)) list = data
      else if (Array.isArray(data.songs)) list = data.songs
      else if (Array.isArray(data.data)) list = data.data
      else if (Array.isArray(data.items)) list = data.items
      else list = [data]
      return list.map(normalizeSong).filter(Boolean)
    }
    // Si no parseo como JSON, caemos a texto plano.
  }

  return parseTextFile(raw, filename)
}

module.exports = {
  parseHolyrics,
  normalizeSong,
  slidesToSections,
  textToSections,
  classify,
}
