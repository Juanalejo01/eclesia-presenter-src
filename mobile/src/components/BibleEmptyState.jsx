/**
 * BibleEmptyState
 *
 * Estado vacío reutilizado en idle / empty / error / offline. Variant
 * elige el icono y el mensaje base; action permite añadir botón retry.
 */

const VARIANTS = {
  idle:    { icon: '📖', tone: 'text-ink-3' },
  empty:   { icon: '🔎', tone: 'text-ink-3' },
  error:   { icon: '⚠️', tone: 'text-live'  },
  offline: { icon: '📡', tone: 'text-copper-200' },
}

export default function BibleEmptyState({
  variant = 'idle',
  message,
  hint,
  action,
}) {
  const v = VARIANTS[variant] || VARIANTS.idle
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className="bg-bg-2 border border-line-1 rounded-xl p-6 text-center flex flex-col items-center gap-3"
    >
      <div className="text-4xl" aria-hidden="true">{v.icon}</div>
      {message && <p className={`text-sm ${v.tone}`}>{message}</p>}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
      {action}
    </div>
  )
}
