/**
 * useTransport.js
 *
 * Hook reactivo que devuelve un snapshot del transport singleton usando
 * `useSyncExternalStore` (React 18 nativo, sin tearing, perfecto para
 * stores externos imperativos).
 *
 * Acepta un `selector` opcional para suscribirse SOLO a una slice del
 * estado: el componente se re-renderiza únicamente cuando esa slice
 * cambia (comparación `===`). Esto evita el "re-render storm" cuando
 * `sentCount` se incrementa por cada `send()` rápido (p.ej. next/prev
 * en sucesión) y solo necesitas leer `status` o `queueSize`.
 *
 * Ejemplo:
 *   const status = useTransport(s => s.status)   // recomendado
 *   const all    = useTransport()                // snapshot completo
 *
 * Edge cases:
 *   - El selector se lee de un ref para no romper la suscripción si
 *     el caller pasa un selector inline distinto en cada render.
 *   - `transport.subscribeState` NO emite snapshot inicial síncrono;
 *     React invoca `getSnapshot` por sí mismo en el primer render.
 *   - El selector DEBE devolver primitivos o referencias estables.
 *     Devolver un objeto literal nuevo cada vez (p.ej. `s => ({a:s.a})`)
 *     dispara bucles infinitos porque la comparación `===` siempre
 *     detecta cambio. Si necesitas varias slices, usa varias llamadas
 *     a `useTransport` o combina con `useMemo` aguas abajo.
 */
import { useRef, useSyncExternalStore } from 'react'
import { transport } from '../services/transport.js'

export function useTransport(selector) {
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  const getSnapshot = () => {
    const s = transport.getState()
    return selectorRef.current ? selectorRef.current(s) : s
  }
  return useSyncExternalStore(transport.subscribeState, getSnapshot, getSnapshot)
}
