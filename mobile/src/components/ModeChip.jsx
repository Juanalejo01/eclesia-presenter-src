/**
 * ModeChip (C4)
 *
 * Etiqueta sutil en el header de cada pantalla que comunica de un vistazo
 * a qué NATURALEZA pertenece la sección, despejando la confusión entre los
 * dos modos de la app:
 *
 *   - mode="live"  → "En vivo · PC": secciones de MANDO que requieren el PC
 *     emparejado en la misma WiFi (Servicio, Biblia, Canciones modo PC).
 *     Color cobre/verde si `connected`, gris apagado si no — así el chip
 *     refuerza el StatusPill sin repetir la latencia.
 *   - mode="cloud" → "Nube": secciones que funcionan por internet sin PC
 *     (Canciones · Mi nube, Mis listas). Siempre cobre tenue: no dependen
 *     de la conexión LAN.
 *
 * Es deliberadamente pequeño (text-[10px], icono 12px) para no competir con
 * el StatusPill ni con el título. Pura presentación: el estado lo deciden
 * las pantallas (no lee hooks) para mantenerlo barato y testeable.
 */
import { useT } from '../hooks/useT.js'

export default function ModeChip({ mode, connected = false }) {
  const { t } = useT()
  const isLive = mode === 'live'

  // live + conectado → verde "ready"; live + offline → gris; cloud → cobre.
  let cls, dot
  if (isLive && connected) {
    cls = 'bg-ready/10 text-ready border-ready/30'
    dot = 'bg-ready'
  } else if (isLive) {
    cls = 'bg-bg-3 text-ink-3 border-line-1'
    dot = 'bg-ink-3'
  } else {
    cls = 'bg-copper-300/10 text-copper-100 border-copper-300/25'
    dot = 'bg-copper-200'
  }

  const label = isLive ? t('dualMode.chipLive') : t('dualMode.chipCloud')
  const aria = isLive
    ? (connected ? t('dualMode.chipLiveOnAria') : t('dualMode.chipLiveOffAria'))
    : t('dualMode.chipCloudAria')

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider ${cls}`}
      role="note"
      aria-label={aria}
    >
      <span className={`w-1 h-1 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
