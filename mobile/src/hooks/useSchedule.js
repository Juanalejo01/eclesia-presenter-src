/**
 * useSchedule.js
 *
 * Suscribe a `schedule-update` (lista del día) y centraliza los items
 * para que ScheduleList los pinte. Mantiene un flag `isStale` para
 * distinguir "todavía no llegó nada del server" (mostramos "Cargando...")
 * de "llegó un payload vacío" (mostramos "Sin items en la lista").
 *
 * CONTRATO con el server (T4+):
 *   schedule-update emite `payload` = array de items con forma mínima:
 *     { id: string, type: 'song'|'bible'|'image'|'video'|'announcement',
 *       title: string, subtitle?: string, thumbnail?: string,
 *       bible?: { book, chapter, verse, version } }
 *   El server es la única fuente de verdad del orden.
 *
 * Optimistic reorder:
 *   Cuando el usuario arrastra una fila, ScheduleList llama a
 *   `setLocalOrder(nextItems)` para repintar al instante sin esperar al
 *   round-trip WS. Si después llega un schedule-update con orden distinto
 *   (otro cliente cambió la lista, o el server rechazó el reorder), gana
 *   el del server — sobreescribimos items con el payload remoto.
 *
 * El guard `mounted` evita setState post-unmount si llega un mensaje
 * tarde (StrictMode doble-mount o cleanup tardío del transport).
 */
import { useEffect, useState } from 'react'
import { transport, ServerEvent } from '../services/transport.js'
import { debug } from '../services/devLog.js'

export function useSchedule() {
  const [items, setItems] = useState([])
  // `isStale` arranca true: aún no llegó ningún schedule-update. Cuando
  // llega el primer evento (aunque sea []), pasa a false para que la UI
  // sepa que ya está sincronizada con el server.
  const [isStale, setStale] = useState(true)

  useEffect(() => {
    let mounted = true

    const handler = (payload) => {
      if (!mounted) return
      if (!Array.isArray(payload)) {
        debug('[schedule] payload no es array, ignorando', typeof payload)
        return
      }
      // Filtramos items mal formados (sin id o type string). Defensivo:
      // si el server emite uno corrupto, ignoramos solo ese — el resto
      // de la lista debe pintar igual.
      const validated = payload.filter(
        (it) =>
          it &&
          typeof it === 'object' &&
          typeof it.id === 'string' &&
          typeof it.type === 'string',
      )
      setItems(validated)
      setStale(false)
    }

    const off = transport.subscribe(ServerEvent.SCHEDULE_UPDATE, handler)

    return () => {
      mounted = false
      try { off && off() } catch { /* ignore */ }
    }
  }, [])

  /**
   * Aplica un reorder local optimista. Es solo visual. El reorder real
   * lo gestiona scheduleActions.reorderItems(ids). Si el server emite
   * un schedule-update distinto después, ese gana.
   *
   * @param {object[]} nextItems — nueva lista en el orden deseado.
   */
  function setLocalOrder(nextItems) {
    if (Array.isArray(nextItems)) setItems(nextItems)
  }

  return { items, isStale, setLocalOrder }
}
