/**
 * FormField
 *
 * Label + input estilizado con la paleta cobre. Soporta texto de ayuda
 * (`hint`) con varios tonos (`hintTone`) y mensaje de error (`error`);
 * si hay error gana la prioridad.
 *
 * `hintTone` admite:
 *   - 'normal'  (default) — gris ink-3
 *   - 'warning' — ámbar copper-200 (warnings no-fatales, ej :5173)
 *   - 'success' — verde ready (confirmación, ej "EclesiaPresenter v X.Y.Z encontrado")
 *   - 'probing' — gris ink-2 itálico (proceso en curso)
 *
 * Acepta el resto de props del <input> (placeholder, value, onChange,
 * inputMode, maxLength, type, disabled, etc.).
 */
const HINT_CLASS = {
  normal:  'text-ink-3',
  warning: 'text-copper-200',
  success: 'text-ready',
  probing: 'text-ink-2 italic',
}

export default function FormField({ label, hint, hintTone = 'normal', error, ...inputProps }) {
  const hintCls = HINT_CLASS[hintTone] || HINT_CLASS.normal
  return (
    <label className="block">
      <span className="block text-sm text-ink-2 mb-1.5 font-medium">{label}</span>
      <input
        {...inputProps}
        className="w-full h-12 px-4 rounded-lg bg-bg-2 border border-line-1
                   text-ink-1 placeholder:text-ink-3
                   focus:outline-none focus:border-copper-200 focus:bg-bg-3
                   transition-colors disabled:opacity-60"
      />
      {error && (
        <span className="block mt-1.5 text-xs text-live">{error}</span>
      )}
      {!error && hint && (
        <span className={`block mt-1.5 text-xs ${hintCls}`}>{hint}</span>
      )}
    </label>
  )
}
