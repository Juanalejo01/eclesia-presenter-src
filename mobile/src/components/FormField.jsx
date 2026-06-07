/**
 * FormField
 *
 * Label + input estilizado con la paleta cobre. Soporta texto de ayuda
 * (`hint`) y mensaje de error (`error`); si hay error gana la prioridad.
 *
 * Acepta el resto de props del <input> (placeholder, value, onChange,
 * inputMode, maxLength, type, disabled, etc.).
 */
export default function FormField({ label, hint, error, ...inputProps }) {
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
        <span className="block mt-1.5 text-xs text-ink-3">{hint}</span>
      )}
    </label>
  )
}
