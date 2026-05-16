// Sentry — configuración del CLIENTE (navegador).
// Se carga automáticamente en el bundle del browser cuando @sentry/nextjs está instalado.
//
// SETUP:
//   1. Crear cuenta gratis en https://sentry.io (Free tier: 5k errores/mes)
//   2. Crear un proyecto "Next.js" → copiar el DSN
//   3. Añadir NEXT_PUBLIC_SENTRY_DSN en Vercel
//   4. Si no hay DSN configurado, Sentry queda inactivo sin romper nada.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Solo en producción, en dev local nos comemos los logs de la consola
    enabled: process.env.NODE_ENV === 'production',

    // Capturar el 10% de las transacciones (performance monitoring). Sube al 1.0
    // para debug, baja a 0 si quieres ahorrar quota.
    tracesSampleRate: 0.1,

    // Replay de sesión (graba lo que hizo el usuario antes del error) — útil pero
    // consume quota. Solo replay en sesiones con error y 10% del resto.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,    // No grabar contenido de inputs (PII)
        blockAllMedia: true,  // No grabar imágenes/videos
      }),
    ],

    // No enviar errores conocidos no-críticos
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Network request failed',  // típico de móviles con WiFi inestable
      // Errores de extensiones del navegador
      /chrome-extension:/,
      /moz-extension:/,
    ],

    // Filtro previo al envío: scrub PII residual
    beforeSend(event) {
      // Remover query strings (pueden contener email, tokens)
      if (event.request?.url) {
        try { event.request.url = event.request.url.split('?')[0] } catch {}
      }
      // Remover headers de auth
      if (event.request?.headers) {
        delete event.request.headers['Authorization']
        delete event.request.headers['Cookie']
      }
      return event
    },
  })
}
