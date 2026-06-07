/**
 * StatusPill
 *
 * Píldora de estado de conexión del remoto. Verde si OPEN con buena
 * señal, ámbar si está reconectando, rojo si no hay conexión. Muestra
 * latencia en ms en niveles excellent/good/poor. Si hay comandos
 * encolados (modo offline), añade un chip "{N} en cola".
 *
 * Por qué un componente dedicado: aparece en el header de la pantalla
 * principal (95% del tiempo del usuario) y queremos que tenga su propio
 * ciclo de re-render. Lee de `useConnection()`, que ya hace selectores
 * finos sobre el snapshot del transport — así un sentCount++ no
 * repinta este pill.
 *
 * Edge cases:
 *   - Si OPEN pero todavía no hubo pong, `useConnection` reporta
 *     signal='good' con latencyMs=null. Mostramos "·ms" como filler.
 *   - El chip de cola sólo aparece con queueSize > 0.
 */
import { useConnection } from '../hooks/useConnection.js'

export default function StatusPill() {
  const { isConnected, isConnecting, latencyMs, signal, queueSize } = useConnection()

  let bg, dot, label
  if (signal === 'excellent') {
    bg = 'bg-ready/15 text-ready border-ready/40'
    dot = 'bg-ready'
    label = `${latencyMs ?? '·'}ms`
  } else if (signal === 'good') {
    bg = 'bg-ready/10 text-ready border-ready/30'
    dot = 'bg-ready'
    label = `${latencyMs ?? '·'}ms`
  } else if (signal === 'poor') {
    bg = 'bg-copper-300/15 text-copper-100 border-copper-300/40'
    dot = 'bg-copper-200'
    label = `${latencyMs ?? '·'}ms`
  } else if (isConnecting) {
    bg = 'bg-copper-300/15 text-copper-100 border-copper-300/40'
    dot = 'bg-copper-200 animate-pulse'
    label = 'Reconectando'
  } else {
    bg = 'bg-live/15 text-live border-live/40'
    dot = 'bg-live'
    label = 'Sin conexión'
  }

  const liveLabel = isConnected
    ? `Conexión ${signal}${latencyMs != null ? `, ${latencyMs} ms` : ''}`
    : (isConnecting ? 'Reconectando con el PC' : 'Sin conexión con el PC')

  return (
    <div className="flex items-center gap-2 flex-wrap" role="status" aria-live="polite" aria-label={liveLabel}>
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      {queueSize > 0 && (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-copper-300/30 bg-bg-3 text-xs text-copper-100 font-mono"
          aria-label={`${queueSize} comandos en cola`}
        >
          {queueSize} en cola
        </div>
      )}
    </div>
  )
}
