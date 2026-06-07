/**
 * usePgmState.js
 *
 * Hook que centraliza la suscripción a los eventos PGM del transport:
 *   - `pgm-update`       → slide en vivo en el monitor del PC.
 *   - `pgm-update-theme` → tema completo (bg/font/reference/...) +
 *                         `version` del server, emitido en el handshake
 *                         inicial y en cada cambio.
 *
 * Devuelve `{ slide, theme, serverVersion }` listo para componer en la
 * UI. Se debe usar UNA SOLA VEZ por árbol (lo monta ServiceScreen) para
 * no duplicar logs ni handlers. Si en T11 hace falta usarlo desde otro
 * sitio, se centraliza en un Context.
 *
 * Por qué un hook y no estado global: cada subscribe del transport es
 * un Set local con su unsubscribe; no aporta tener un store reactivo
 * adicional. Mantenemos el patrón "useEffect + transport.subscribe" del
 * resto del repo.
 *
 * El guard `mounted` evita setState post-unmount si llega un mensaje
 * tarde (StrictMode doble-mount o cleanup tardío del transport).
 */
import { useEffect, useState } from 'react'
import { transport, ServerEvent } from '../services/transport.js'
import { DEFAULT_THEME, mergeTheme } from '../services/slideTheme.js'

// DEV-only logger — mismo patrón que ServiceScreen: import.meta literal
// es parse-error en Jest CJS, así que lo accedemos via `new Function`.
const _isDev = (() => {
  try {
    // eslint-disable-next-line no-new-func
    const env = new Function('try { return import.meta.env } catch { return undefined }')()
    return !!(env && env.DEV)
  } catch {
    return false
  }
})()

function _debug(...args) {
  if (_isDev) console.log(...args)
}

export function usePgmState() {
  const [slide, setSlide] = useState(null)
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [serverVersion, setServerVersion] = useState(null)

  useEffect(() => {
    let mounted = true

    const offSlide = transport.subscribe(ServerEvent.PGM_UPDATE, (payload) => {
      if (!mounted) return
      _debug('[pgm] slide update', payload?.text?.slice(0, 40))
      setSlide(payload || null)
    })

    // `pgm-update-theme` no está en ServerEvent (es del flow de tema,
    // no del slide). Suscribimos por literal — el server lo emite.
    const offTheme = transport.subscribe('pgm-update-theme', (payload) => {
      if (!mounted) return
      _debug('[pgm] theme update')
      if (payload && typeof payload.version === 'string') {
        setServerVersion(payload.version)
      }
      setTheme(mergeTheme(payload))
    })

    return () => {
      mounted = false
      try { offSlide && offSlide() } catch { /* ignore */ }
      try { offTheme && offTheme() } catch { /* ignore */ }
    }
  }, [])

  return { slide, theme, serverVersion }
}
