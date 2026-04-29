// Converts .xmm Bible files (simple XML: <bible><b n="..."><c n="..."><v n="...">text</v>)
// into the JSON format the app expects: [{ abbrev, name, chapters: [[v1, v2, ...], ...] }]
//
// Usage:  node scripts/convert-xmm.mjs <input.xmm> <output.json>

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const ABBREV = {
  'Génesis': 'gn', 'Éxodo': 'ex', 'Levítico': 'lv', 'Números': 'nm',
  'Deuteronomio': 'dt', 'Josué': 'js', 'Jueces': 'jud', 'Rut': 'rt',
  '1 Samuel': '1sm', '2 Samuel': '2sm', '1 Reyes': '1kgs', '2 Reyes': '2kgs',
  '1 Crónicas': '1ch', '2 Crónicas': '2ch', 'Esdras': 'ezr', 'Nehemías': 'ne',
  'Ester': 'et', 'Job': 'job', 'Salmos': 'ps', 'Proverbios': 'prv',
  'Eclesiastés': 'ec', 'Cantares': 'so', 'Cantar de los Cantares': 'so',
  'Isaías': 'is', 'Jeremías': 'jr', 'Lamentaciones': 'lm', 'Ezequiel': 'ez',
  'Daniel': 'dn', 'Oseas': 'ho', 'Joel': 'jl', 'Amós': 'am',
  'Abdías': 'ob', 'Jonás': 'jn', 'Miqueas': 'mi', 'Nahúm': 'na',
  'Habacuc': 'hk', 'Sofonías': 'zp', 'Hageo': 'hg', 'Zacarías': 'zc',
  'Malaquías': 'ml',
  'Mateo': 'mt', 'Marcos': 'mk', 'Lucas': 'lk', 'Juan': 'jo',
  'Hechos': 'act', 'Romanos': 'rm',
  '1 Corintios': '1co', '2 Corintios': '2co', 'Gálatas': 'gl',
  'Efesios': 'eph', 'Filipenses': 'ph', 'Colosenses': 'cl',
  '1 Tesalonicenses': '1ts', '2 Tesalonicenses': '2ts',
  '1 Timoteo': '1tm', '2 Timoteo': '2tm',
  'Tito': 'tt', 'Filemón': 'phm', 'Hebreos': 'hb', 'Santiago': 'jm',
  '1 Pedro': '1pe', '2 Pedro': '2pe',
  '1 Juan': '1jo', '2 Juan': '2jo', '3 Juan': '3jo',
  'Judas': 'jd', 'Apocalipsis': 'rv',
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

function cleanVerse(text) {
  return decodeEntities(text)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]/g, '')   // strip [1] [2] footnote markers
    .trim()
}

function parseXmm(xml) {
  const books = []
  // Strip BOM and XML decl
  xml = xml.replace(/^﻿/, '').replace(/<\?xml[^?]*\?>/, '')

  const bookRe = /<b\s+n="([^"]+)"\s*>([\s\S]*?)<\/b>/g
  let bMatch
  while ((bMatch = bookRe.exec(xml)) !== null) {
    const bookName = bMatch[1]
    const bookBody = bMatch[2]
    const chapters = []

    const chapRe = /<c\s+n="(\d+)"\s*>([\s\S]*?)<\/c>/g
    let cMatch
    while ((cMatch = chapRe.exec(bookBody)) !== null) {
      const chapNum = +cMatch[1]
      const chapBody = cMatch[2]
      const verses = []

      const verseRe = /<v\s+n="(\d+)"\s*>([\s\S]*?)<\/v>/g
      let vMatch
      while ((vMatch = verseRe.exec(chapBody)) !== null) {
        const verseNum = +vMatch[1]
        verses[verseNum - 1] = cleanVerse(vMatch[2])
      }
      chapters[chapNum - 1] = verses
    }

    books.push({
      abbrev: ABBREV[bookName] || bookName.toLowerCase().replace(/\s+/g, ''),
      name: bookName,
      chapters,
    })
  }
  return books
}

const [, , inFile, outFile] = argv
if (!inFile || !outFile) {
  console.error('Usage: node convert-xmm.mjs <input.xmm> <output.json>')
  process.exit(1)
}

const xml = readFileSync(inFile, 'utf8')
const books = parseXmm(xml)
writeFileSync(outFile, JSON.stringify(books))
console.log(`✓ ${inFile} → ${outFile}  (${books.length} libros, ${books.reduce((s, b) => s + b.chapters.length, 0)} capítulos)`)
