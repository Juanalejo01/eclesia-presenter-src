// Constantes de sitio compartidas por metadata, robots, sitemap y JSON-LD.
// Para usar un dominio propio, define NEXT_PUBLIC_SITE_URL en Vercel
// (ej. https://eclesiapresenter.com). Si no, cae al dominio de Vercel.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://eclesia-presenter.vercel.app'
).replace(/\/+$/, '')

export const SITE_NAME = 'EclesiaPresenter'

export const SITE_DESCRIPTION =
  'La forma moderna de proyectar versículos, canciones y videos en tu iglesia. Sin red, sin latencia, capturable por OBS.'

export const GITHUB_URL = 'https://github.com/Juanalejo01/eclesia-presenter'

export const AUTHOR_NAME = 'Juan Alejandro López Ospina'

// Imagen Open Graph / Twitter por defecto (servida desde /public).
export const OG_IMAGE = '/og.png'
