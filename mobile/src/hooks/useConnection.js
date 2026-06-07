/**
 * useConnection.js
 *
 * Hook simplificado para componentes UI (status bar, icono de señal).
 * Deriva booleanos cómodos y un nivel cualitativo de señal a partir
 * de `latencyMs` y `status`.
 *
 * Por qué existe: en lugar de duplicar la lógica `latency < 80 ? ...`
 * en cada componente, vive una vez aquí.
 *
 * Optimización: usa selectores de `useTransport` para suscribirse SOLO
 * a las 3 slices que importan (status, latencyMs, queueSize). Así un
 * `send()` que solo mueve `sentCount` NO re-renderiza este hook.
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
import { useMemo } from 'react'
import { useTransport } from './useTransport.js'

// Umbrales documentados. Basados en p50 LAN <80ms / WiFi típica 80-200ms.
const SIGNAL_EXCELLENT_MAX_MS = 80
const SIGNAL_GOOD_MAX_MS      = 200

export function useConnection() {
  const status    = useTransport((s) => s.status)
  const latencyMs = useTransport((s) => s.latencyMs)
  const queueSize = useTransport((s) => s.queueSize)

  return useMemo(() => {
    const isConnected  = status === 'open'
    const isConnecting = status === 'connecting' || status === 'reconnecting'
    let signal = 'offline'
    if (isConnected) {
      if (latencyMs == null)                       signal = 'good'
      else if (latencyMs < SIGNAL_EXCELLENT_MAX_MS) signal = 'excellent'
      else if (latencyMs < SIGNAL_GOOD_MAX_MS)      signal = 'good'
      else                                          signal = 'poor'
    }
    return { isConnected, isConnecting, latencyMs, queueSize, signal }
  }, [status, latencyMs, queueSize])
}
