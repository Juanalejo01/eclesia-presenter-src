/**
 * CommandButton
 *
 * Botón secundario para los 3 comandos de proyección (Blank/Black/Clear).
 * Más bajo y compacto que BigButton, pero respeta el tap target mínimo de
 * 52px (línea de accesibilidad Material Design / Apple HIG).
 *
 * Variantes con pista visual sobre el efecto:
 *   neutral → fondo bg-2, texto ink-2 (default)
 *   blank   → fondo blanco (hint visual de slide en blanco)
 *   black   → fondo negro con texto blanco (hint visual de blackout)
 *   clear   → ghost con borde rojo suave (hint de "quitar live")
 *
 * Props:
 *   label    — texto principal (ej. "Blank")
 *   hint     — subtítulo pequeño opcional (ej. "Slide en blanco")
 *   onClick  — handler
 *   disabled — bool
 *   variant  — 'neutral' | 'blank' | 'black' | 'clear'
 *   ...rest  — passthrough (aria-label, etc.)
 */
export default function CommandButton({
  label,
  hint,
  onClick,
  disabled,
  variant = 'neutral',
  ...rest
}) {
  const cls = {
    neutral: 'bg-bg-2 hover:bg-bg-3 active:bg-bg-3 text-ink-2 border-line-2',
    blank:   'bg-ink-1 hover:bg-ink-2 active:bg-ink-3 text-bg-1 border-ink-1',
    black:   'bg-black hover:bg-bg-3 active:bg-bg-3 text-white border-bg-3',
    clear:   'bg-transparent hover:bg-live/10 active:bg-live/20 text-live border-live/40',
  }[variant] || ''

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={`flex-1 min-h-[52px] px-3 rounded-lg border font-medium text-sm
                  transition active:scale-[0.97] disabled:opacity-40
                  disabled:active:scale-100 ${cls}`}
      {...rest}
    >
      <div className="leading-tight">{label}</div>
      {hint && (
        <div className="text-[10px] opacity-70 font-normal mt-0.5">{hint}</div>
      )}
    </button>
  )
}
