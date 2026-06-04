import { SITE_URL } from '../lib/site'
import { DOCS } from './docs/_data/docs'

// Genera /sitemap.xml automáticamente (Next.js App Router metadata route).
// Solo rutas públicas e indexables; se excluyen login/register/cuenta/checkout.
export default function sitemap() {
  const now = new Date()

  const staticRoutes = [
    { path: '',                  priority: 1.0, changeFrequency: 'weekly'  },
    { path: '/pricing',          priority: 0.9, changeFrequency: 'monthly' },
    { path: '/download',         priority: 0.9, changeFrequency: 'weekly'  },
    { path: '/casos-de-uso',     priority: 0.7, changeFrequency: 'monthly' },
    { path: '/docs',             priority: 0.7, changeFrequency: 'weekly'  },
    { path: '/contacto',         priority: 0.5, changeFrequency: 'yearly'  },
    { path: '/legal/privacidad', priority: 0.3, changeFrequency: 'yearly'  },
    { path: '/legal/terminos',   priority: 0.3, changeFrequency: 'yearly'  },
  ].map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const docRoutes = DOCS.map((d) => ({
    url: `${SITE_URL}/docs/${d.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...docRoutes]
}
