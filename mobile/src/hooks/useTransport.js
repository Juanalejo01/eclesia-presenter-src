/**
 * useTransport.js
 *
 * Hook reactivo que devuelve el snapshot completo del transport y
 * re-renderiza al componente cuando cualquier campo cambia (status,
 * latencyMs, queueSize, ...).
 *
 * Por qué existe: el transport es un singleton imperativo; este hook
 * es el puente al modelo reactivo de React sin meter Redux.
 *
 * Ejemplo:
 *   function StatusBar() {
 *     const { status, latencyMs } = useTransport()
 *     return <div>{status} {latencyMs}ms</div>
 *   }
 *
 * Edge cases:
 *   - Si el componente se desmonta durante una transición, el
 *     unsubscribe del effect previene setState-on-unmounted.
 */
import { useEffect, useState } from 'react'
import { transport } from '../services/transport.js'

export function useTransport() {
  const [state, setState] = useState(() => transport.getState())
  useEffect(() => {
    // Snapshot inicial por si cambió entre el mount y el primer render
    setState(transport.getState())
    return transport.subscribeState(setState)
  }, [])
  return state
}
