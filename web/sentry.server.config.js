// Sentry — configuración del SERVER (API routes, middleware, server components).
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,

    // El server NO necesita replay (sin DOM)
    integrations: [],

    ignoreErrors: [],

    beforeSend(event) {
      // Scrub headers sensibles del request capturado
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['stripe-signature']
      }
      // No enviar el body del webhook de Stripe (contiene info de pagos)
      if (event.request?.url?.includes('/api/webhooks/stripe')) {
        if (event.request.data) event.request.data = '[scrubbed]'
      }
      return event
    },
  })
}
