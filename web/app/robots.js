import { SITE_URL } from '../lib/site'

// Genera /robots.txt automáticamente (Next.js App Router metadata route).
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Rutas privadas / de sesión: no indexar.
        disallow: ['/api/', '/cuenta/', '/cuenta', '/login', '/register', '/checkout'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
