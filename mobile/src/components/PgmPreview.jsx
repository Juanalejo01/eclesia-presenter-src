/**
 * PgmPreview
 *
 * Placeholder de la vista PGM (slide que está actualmente proyectándose
 * en el PC). Recibe un objeto `slide` con la última `pgm-update` del
 * server o `null` si todavía no hay nada en live.
 *
 * Hoy renderiza solo texto + referencia (T6 sustituirá esto por un
 * mini SlideRenderer real). El frame es 16:9 con fondo cobre oscuro
 * para que el operador identifique de un vistazo qué hay proyectado.
 *
 * Cuatro estados:
 *   - null  / vacío → "Sin contenido proyectado"
 *   - type='blackout' → fondo negro con label "Blackout"
 *   - type='blank' sin texto → fondo claro con label "Slide en blanco"
 *   - normal → texto + referencia (referencia opcional)
 *
 * Props:
 *   slide — { text?, reference?, type? } | null
 */
export default function PgmPreview({ slide }) {
  const empty =
    !slide ||
    (slide.type !== 'blank' &&
      slide.type !== 'blackout' &&
      !slide.text &&
      !slide.reference)

  if (empty) {
    return (
      <div
        className="aspect-video bg-bg-3 border border-line-1 rounded-xl grid place-items-center text-ink-3 text-sm p-6 text-center"
        role="img"
        aria-label="Sin contenido proyectado"
      >
        Sin contenido proyectado
      </div>
    )
  }

  if (slide.type === 'blackout') {
    return (
      <div
        className="aspect-video bg-black border border-line-1 rounded-xl grid place-items-center text-ink-3 text-xs font-mono uppercase tracking-widest"
        role="img"
        aria-label="Proyección en blackout"
      >
        Blackout
      </div>
    )
  }

  if (slide.type === 'blank' && !slide.text) {
    return (
      <div
        className="aspect-video bg-ink-1 border border-line-1 rounded-xl grid place-items-center text-bg-1 text-xs font-mono uppercase tracking-widest opacity-70"
        role="img"
        aria-label="Slide en blanco proyectado"
      >
        Slide en blanco
      </div>
    )
  }

  return (
    <div
      className="aspect-video bg-gradient-to-br from-bg-3 to-bg-2 border border-line-1 rounded-xl
                 flex flex-col items-center justify-center text-center px-4 py-3 gap-2"
      role="img"
      aria-label={`Proyectando: ${slide.text || ''}${slide.reference ? ` (${slide.reference})` : ''}`.trim()}
    >
      <p className="text-ink-1 font-display text-lg leading-snug line-clamp-3 max-w-full">
        {slide.text || '…'}
      </p>
      {slide.reference && (
        <p className="text-copper-200 font-mono text-[11px] uppercase tracking-widest">
          {slide.reference}
        </p>
      )}
    </div>
  )
}
