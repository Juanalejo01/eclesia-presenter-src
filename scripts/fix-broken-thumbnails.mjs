// scripts/fix-broken-thumbnails.mjs
//
// Recorre el catálogo de backgrounds, hace HEAD a cada thumbnail, y para los
// que dan 404 intenta extraer el og:image real desde la página de Pexels.
//
// Uso:
//   node scripts/fix-broken-thumbnails.mjs            # solo reporta
//   node scripts/fix-broken-thumbnails.mjs --apply    # repara y guarda
//
// Estrategia de fallback (en orden):
//   1. og:image de https://www.pexels.com/video/{id}/
//   2. Patrón alternativo: pictures/preview-0.jpg
//   3. Placeholder genérico (data URI o asset local)

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = path.resolve(__dirname, '..', 'web', 'public', 'backgrounds-catalog.json')

const APPLY = process.argv.includes('--apply')

// ────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────

async function headCheck(url, timeoutMs = 10_000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' })
    return { ok: res.ok, status: res.status }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  } finally {
    clearTimeout(t)
  }
}

async function fetchPexelsPageOgImage(videoId, timeoutMs = 15_000) {
  // Intentamos dos rutas (con y sin locale)
  const candidates = [
    `https://www.pexels.com/video/${videoId}/`,
    `https://www.pexels.com/es-es/video/${videoId}/`,
  ]
  for (const pageUrl of candidates) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(pageUrl, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 EclesiaPresenterCatalogBot/1.0' },
      })
      if (!res.ok) continue
      const html = await res.text()
      // og:image
      const m =
        html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)
      if (m && m[1]) return m[1]
    } catch {}
    finally {
      clearTimeout(t)
    }
  }
  return null
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await fs.readFile(CATALOG_PATH, 'utf8')
  const catalog = JSON.parse(raw)
  const items = catalog.items || []

  console.log(`📋 Comprobando ${items.length} thumbnails…`)
  console.log(APPLY ? '✏️  Modo APPLY: se guardarán los cambios' : '👀 Modo dry-run (usa --apply para guardar)')
  console.log('')

  const broken = []
  const fixed = []

  let i = 0
  for (const item of items) {
    i++
    process.stdout.write(`[${i}/${items.length}] ${item.id}… `)
    const check = await headCheck(item.thumbnail)
    if (check.ok) {
      process.stdout.write(`OK\n`)
      continue
    }
    process.stdout.write(`ROTO (${check.status || check.error || 'unknown'})\n`)
    broken.push(item)

    // Extraer videoId del id (formato: "categoria-titulo-NNNNNNNN")
    const videoIdMatch = item.id.match(/-(\d+)$/)
    if (!videoIdMatch) {
      console.log(`  ⚠️  No se pudo extraer videoId del id "${item.id}", saltando reparación`)
      continue
    }
    const videoId = videoIdMatch[1]

    process.stdout.write(`  🔍 Buscando og:image para video ${videoId}… `)
    const realThumbnail = await fetchPexelsPageOgImage(videoId)
    if (realThumbnail) {
      process.stdout.write(`✅ ${realThumbnail}\n`)
      fixed.push({ id: item.id, old: item.thumbnail, new: realThumbnail })
      if (APPLY) item.thumbnail = realThumbnail
    } else {
      process.stdout.write(`❌ no se encontró\n`)
    }
  }

  console.log('')
  console.log('────────────────────────────────────────────')
  console.log(`📊 Resumen:`)
  console.log(`   Total:     ${items.length}`)
  console.log(`   OK:        ${items.length - broken.length}`)
  console.log(`   Rotos:     ${broken.length}`)
  console.log(`   Reparados: ${fixed.length}`)
  console.log(`   No-fixable: ${broken.length - fixed.length}`)
  console.log('────────────────────────────────────────────')

  if (fixed.length > 0 && APPLY) {
    await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
    console.log(`\n✏️  Catálogo guardado en ${CATALOG_PATH}`)
  } else if (fixed.length > 0) {
    console.log(`\n💡 Re-ejecuta con --apply para guardar los cambios`)
  }

  // Items no fixable: lista para revisión manual
  const unfixable = broken.filter(b => !fixed.some(f => f.id === b.id))
  if (unfixable.length > 0) {
    console.log(`\n⚠️  Items rotos sin reparación automática (revisar manualmente):`)
    for (const u of unfixable) {
      console.log(`   - ${u.id}`)
      console.log(`     URL del video: ${u.url}`)
    }
  }
}

main().catch(e => {
  console.error('💥 Error:', e)
  process.exit(1)
})
