/**
 * BigButton
 *
 * Botón táctil grande (min-height 56px) pensado para taps con el dedo.
 * Tres variantes: primary (cobre), ghost (outline), danger (rojo live).
 *
 * Props:
 *   onClick     — handler
 *   disabled    — bool
 *   loading     — bool. Muestra "..." y bloquea el click
 *   variant     — 'primary' | 'ghost' | 'danger'
 *   type        — 'button' | 'submit' (default 'button')
 *   children    — contenido del botón
 */
export default function BigButton({
  onClick,
  disabled,
  loading,
  variant = 'primary',
  type = 'button',
  children,
}) {
  const cls = {
    primary: 'bg-copper-200 hover:bg-copper-100 active:bg-copper-300 text-bg-1',
    ghost:   'bg-transparent hover:bg-bg-2 text-ink-2 border border-line-2',
    danger:  'bg-live hover:bg-red-500 active:bg-red-600 text-white',
  }[variant] || ''

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full min-h-[56px] px-6 rounded-xl font-semibold text-base
                  transition active:scale-[0.98] disabled:opacity-50
                  disabled:active:scale-100 ${cls}`}
    >
      {loading ? '...' : children}
    </button>
  )
}
