/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,  // no anunciar "Powered by Next.js"

  // Headers de seguridad aplicados a TODAS las rutas.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Forzar HTTPS por 2 años + incluir subdominios + preload list
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // No permitir que la web se cargue dentro de un <iframe> (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
          // El navegador detecta automáticamente el content-type (evita mime sniffing)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Solo enviar Referer en mismo origen (no filtrar URLs internas a 3rd parties)
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Limitar APIs sensibles del navegador a same-origin
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
          // Content Security Policy
          // - default: solo same-origin
          // - script: self + Stripe Checkout + Vercel analytics (si lo añades)
          // - style: self + inline (Tailwind)
          // - img: self + data: (base64 SVG) + https: (api.qrserver, stripe)
          // - connect: self + Supabase + Stripe
          // - frame-ancestors: 'none' (refuerza X-Frame-Options)
          { key: 'Content-Security-Policy', value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com https://*.vercel-analytics.com https://*.vercel-insights.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://*.vercel-analytics.com https://*.vercel-insights.com",
            "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://billing.stripe.com https://challenges.cloudflare.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
            "object-src 'none'",
            "upgrade-insecure-requests",
          ].join('; ') },
        ],
      },
    ]
  },

  // Los binarios se sirven desde GitHub Releases.
  async redirects() {
    const tag = 'v0.2.0'
    const base = 'https://github.com/Juanalejo01/eclesia-presenter/releases'
    return [
      { source: '/download/installer', destination: `${base}/download/${tag}/EclesiaPresenter-0.2.0-setup.exe`, permanent: false },
      { source: '/download/portable',  destination: `${base}/download/${tag}/EclesiaPresenter-0.2.0-portable.exe`, permanent: false },
      { source: '/download/latest',    destination: `${base}/latest`, permanent: false },
    ]
  },
}

// Sentry: wrap solo si está instalado (para que el deploy no rompa si
// alguien clona el repo sin instalar el paquete).
async function withSentry(config) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return config
  try {
    const sentry = await import('@sentry/nextjs')
    return sentry.withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Solo subir source maps si tenemos token de auth (en CI/Vercel)
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  } catch (e) {
    console.warn('[next.config] Sentry not installed, skipping wrap:', e?.message)
    return config
  }
}

export default await withSentry(nextConfig)
