// GET /api/download/mobile-apk — redirect evergreen al último APK Android.
//
// La página /download no hardcodea la versión del APK: esta ruta consulta los
// releases de GitHub, busca el último release mobile-vX.Y.Z con un asset .apk
// (prefiriendo el -release.apk firmado sobre el -debug.apk) y redirige 302 al
// browser_download_url.
//
// Cache: el fetch usa el Data Cache de Next (revalidate 300s) + un cache en
// memoria a nivel de módulo con el mismo TTL. Con 60 req/h de límite anónimo
// de la API de GitHub, 1 hit cada 5 min como máximo es seguro.
//
// Degradación elegante: si la API falla o no hay release mobile con APK,
// redirigimos a la página de releases de GitHub — nunca un 500.
//
// CORS/seguridad: un GET de navegación del browser no manda Origin, así que
// pasa el middleware sin tocar la allowlist (web/middleware.js linea 24).

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RELEASES_API = 'https://api.github.com/repos/Juanalejo01/eclesia-presenter/releases?per_page=30'
const RELEASES_PAGE = 'https://github.com/Juanalejo01/eclesia-presenter/releases'
// Mismo patrón de tag que valida release-mobile.yml
const MOBILE_TAG_RE = /^mobile-v\d+\.\d+\.\d+$/
const TTL_MS = 5 * 60 * 1000

// Cache en memoria del módulo (complementa el Data Cache; sobrevive entre
// requests mientras viva la instancia serverless).
let _cache = { url: null, ts: 0 }

function redirectWithCache(url) {
  const res = NextResponse.redirect(url, 302)
  res.headers.set('Cache-Control', 'public, max-age=300')
  return res
}

// Dado el array de releases de la API de GitHub, devuelve la URL del mejor
// APK o null. (No se exporta: los route handlers de Next solo deben exportar
// GET/POST/configs.)
function pickApkUrl(releases) {
  if (!Array.isArray(releases)) return null
  const mobile = releases
    .filter(r =>
      r && !r.draft &&
      typeof r.tag_name === 'string' && MOBILE_TAG_RE.test(r.tag_name)
    )
    // No fiarse del orden de la API: ordenamos por created_at desc.
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  for (const rel of mobile) {
    const assets = Array.isArray(rel.assets) ? rel.assets : []
    const apks = assets.filter(a => a && typeof a.name === 'string' && a.name.endsWith('.apk') && a.browser_download_url)
    if (apks.length === 0) continue
    // Preferir el APK firmado de release sobre el fallback debug.
    const signed = apks.find(a => a.name.endsWith('-release.apk'))
    return (signed || apks[0]).browser_download_url
  }
  return null
}

export async function GET() {
  const now = Date.now()
  if (_cache.url && (now - _cache.ts) < TTL_MS) {
    return redirectWithCache(_cache.url)
  }

  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub API exige User-Agent en requests anónimas
        'User-Agent': 'eclesia-presenter-web',
      },
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`github_api_${res.status}`)

    const releases = await res.json()
    const apkUrl = pickApkUrl(releases)
    if (!apkUrl) throw new Error('no_mobile_apk')

    _cache = { url: apkUrl, ts: now }
    return redirectWithCache(apkUrl)
  } catch {
    // Nunca 500: ante cualquier fallo mandamos al listado de releases.
    return redirectWithCache(RELEASES_PAGE)
  }
}
