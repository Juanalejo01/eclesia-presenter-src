/**
 * useBootstrap
 *
 * Hook que decide al arrancar la app si ya hay credenciales persistidas
 * (=> ir directo a /service) o si toca emparejar (=> ir a /pair).
 *
 * Llama a `transport.restore()` UNA sola vez. El resultado se cachea
 * en state local con `ready=true` al terminar (éxito o no).
 *
 * Por qué un hook y no lógica dentro del router:
 *   - El restore() es asíncrono y depende de Capacitor Preferences.
 *     Render guard hasta que termina evita parpadeos pair → service.
 *   - Reutilizable si en el futuro queremos otra pantalla de splash.
 *
 * Devuelve:
 *   { ready, hasCredentials }
 *     ready          — true cuando restore() completó (success o fail)
 *     hasCredentials — true si transport encontró creds y arrancó el WS
 */
import { useEffect, useState } from 'react'
import { transport } from '../services/transport.js'

export function useBootstrap() {
  const [state, setState] = useState({ ready: false, hasCredentials: false })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let hasCreds = false
      try {
        hasCreds = await transport.restore()
      } catch (e) {
        // restore() jamás debería lanzar (catchea internamente), pero
        // si lo hace caemos al estado "sin credenciales" sin romper.
        console.warn('[bootstrap] restore failed:', e?.message || e)
      }
      if (!cancelled) {
        setState({ ready: true, hasCredentials: !!hasCreds })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
