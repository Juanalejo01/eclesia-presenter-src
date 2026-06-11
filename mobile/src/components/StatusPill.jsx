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
import { useT } from '../hooks/useT.js'

export default function StatusPill() {
  const { t } = useT()
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
    label = t('status.reconnecting')
  } else {
    bg = 'bg-live/15 text-live border-live/40'
    dot = 'bg-live'
    label = t('status.offline')
  }

  // El enum del signal se traduce via lookup (status.signal.*) — antes
  // el aria mezclaba 'Conexión excellent' (enum crudo en ingles).
  const liveLabel = isConnected
    ? (latencyMs != null
        ? t('status.ariaConnectedLatency', { signal: t(`status.signal.${signal}`), ms: latencyMs })
        : t('status.ariaConnected', { signal: t(`status.signal.${signal}`) }))
    : (isConnecting ? t('status.ariaReconnecting') : t('status.ariaOffline'))

  return (
    <div className="flex items-center gap-2 flex-wrap" role="status" aria-live="polite" aria-label={liveLabel}>
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      {queueSize > 0 && (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-copper-300/30 bg-bg-3 text-xs text-copper-100 font-mono"
          aria-label={t(queueSize === 1 ? 'status.queuedAria' : 'status.queuedAriaPlural', { n: queueSize })}
        >
          {t(queueSize === 1 ? 'status.queued' : 'status.queuedPlural', { n: queueSize })}
        </div>
      )}
    </div>
  )
}
