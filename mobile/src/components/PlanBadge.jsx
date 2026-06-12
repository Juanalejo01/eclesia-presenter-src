/**
 * PlanBadge (C1)
 *
 * Pill del plan de cuenta: Free (gris neutro) / PRO (cobre brand).
 * Compartido por AccountScreen y la fila de cuenta de MoreScreen para
 * que ambos lean idéntico.
 *
 * Props:
 *   isPro — bool. true → PRO cobre, false → Free gris.
 */
import { useT } from '../hooks/useT.js'

export default function PlanBadge({ isPro }) {
  const { t } = useT()
  const cls = isPro
    ? 'bg-copper-300/20 text-copper-200 border border-copper-300/40'
    : 'bg-bg-3 text-ink-3 border border-line-1'
  return (
    <span
      data-testid="plan-badge"
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono
                  font-semibold uppercase tracking-wider ${cls}`}
    >
      {isPro ? t('account.planPro') : t('account.planFree')}
    </span>
  )
}
