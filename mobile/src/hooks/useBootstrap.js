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
import { initLocale } from '../services/i18n.js'
import { account } from '../services/account.js'

export function useBootstrap() {
  const [state, setState] = useState({ ready: false, hasCredentials: false })

  useEffect(() => {
    let cancelled = false
    // C1: la cuenta Supabase se restaura en BACKGROUND — init() es
    // fire-and-forget (nunca lanza) y NO gatea `ready`: el fetch del
    // plan puede tardar (red) y el mando debe arrancar igual de rapido.
    account.init()
    ;(async () => {
      let hasCreds = false
      try {
        // T13: el locale se hidrata EN PARALELO con las credenciales y
        // ANTES de que `ready` flippee — el splash gatea el primer paint,
        // asi que no hay flash de idioma equivocado y la duracion del
        // splash no cambia (Promise.all, no secuencial). initLocale()
        // nunca lanza (catchea internamente), pero el .catch defensivo
        // evita que un fallo suyo tire el restore.
        const [creds] = await Promise.all([
          transport.restore(),
          initLocale().catch((e) => {
            console.warn('[bootstrap] initLocale failed:', e?.message || e)
          }),
        ])
        hasCreds = !!creds
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
