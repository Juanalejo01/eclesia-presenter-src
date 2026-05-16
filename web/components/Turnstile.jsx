// Componente cliente para Cloudflare Turnstile (captcha invisible / casi-invisible).
// Se renderiza solo si NEXT_PUBLIC_TURNSTILE_SITE_KEY está configurada.
//
// SETUP:
//   1. https://dash.cloudflare.com → Turnstile → Add Site
//   2. Domain: eclesia-presenter.vercel.app (+ localhost para dev)
//   3. Mode: "Managed" (mejor balance UX/seguridad)
//   4. Copia el "Site Key" → env var NEXT_PUBLIC_TURNSTILE_SITE_KEY (Public, OFF Sensitive)
//   5. Copia el "Secret Key" → env var TURNSTILE_SECRET_KEY (Sensitive ON)
//   6. En Supabase Dashboard → Authentication → Settings → CAPTCHA Protection
//      → habilitar y elegir "Turnstile by Cloudflare" → pegar el secret.

'use client'

import { useEffect, useRef } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export default function Turnstile({ onVerify, theme = 'dark', size = 'flexible' }) {
  const ref = useRef(null)
  const widgetIdRef = useRef(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) {
      console.warn('[Turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY no configurada — captcha deshabilitado')
      onVerify?.('disabled')  // dejamos pasar para no romper dev local sin config
      return
    }

    // Carga del script una sola vez
    let cancelled = false
    const renderWidget = () => {
      if (cancelled || !ref.current || !window.turnstile) return
      try {
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          size,
          callback: (token) => onVerify?.(token),
          'error-callback': () => onVerify?.(null),
          'expired-callback': () => onVerify?.(null),
        })
      } catch (e) {
        console.warn('[Turnstile] render failed:', e?.message)
      }
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      // Inyectar el script si no está cargado todavía
      let script = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        script.onload = renderWidget
        document.head.appendChild(script)
      } else {
        script.addEventListener('load', renderWidget)
      }
    }

    return () => {
      cancelled = true
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch {}
      }
    }
  }, [siteKey, theme, size, onVerify])

  // Si no hay siteKey configurada, ocultamos el widget completo (silencio total).
  if (!siteKey) return null

  return (
    <div className="flex justify-center">
      <div ref={ref} />
    </div>
  )
}
