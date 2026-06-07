/**
 * useConnection.js
 *
 * Hook simplificado para componentes UI (status bar, icono de señal).
 * Deriva booleanos cómodos y un nivel cualitativo de señal a partir
 * de latencyMs y status.
 *
 * Por qué existe: en lugar de duplicar la lógica `latency < 80 ? ...`
 * en cada componente, vive una vez aquí.
 *
 * Ejemplo:
 *   const { isConnected, signal, latencyMs } = useConnection()
 *
 * Niveles de signal:
 *   excellent: < 80 ms      good: 80-199 ms      poor: >= 200 ms
 *   offline:   no conectado
 *
 * Edge cases:
 *   - Si está OPEN pero todavía no hubo pong, signal = 'good' (no
 *     suponemos lo peor).
 */
import { useTransport } from './useTransport.js'

export function useConnection() {
  const s = useTransport()
  const isConnected  = s.status === 'open'
  const isConnecting = s.status === 'connecting' || s.status === 'reconnecting'
  const latencyMs    = s.latencyMs

  let signal = 'offline'
  if (isConnected) {
    if (latencyMs == null)        signal = 'good'
    else if (latencyMs < 80)      signal = 'excellent'
    else if (latencyMs < 200)     signal = 'good'
    else                          signal = 'poor'
  }

  return {
    isConnected,
    isConnecting,
    latencyMs,
    signal,
    queueSize: s.queueSize,
  }
}
