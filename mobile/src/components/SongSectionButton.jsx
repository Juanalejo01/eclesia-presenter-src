/**
 * SongSectionButton
 *
 * Tarjeta de seccion dentro del SongPreviewSheet: label kicker + preview text.
 * Si esta es la seccion live, badge "EN VIVO" + boton "Quitar live".
 */

export default function SongSectionButton({
  section,
  isLive = false,
  onProject,
  onClearLive,
  disabled = false,
}) {
  if (!section) return null
  const preview = (section.text || '').replace(/\s+/g, ' ').slice(0, 60)
  return (
    <div
      className={
        'rounded-xl border transition-colors flex flex-col gap-1 p-3 ' +
        (isLive
          ? 'border-live/60 ring-1 ring-live/30 bg-bg-2'
          : 'border-line-1 bg-bg-2 hover:bg-bg-3')
      }
    >
      <button
        type="button"
        onClick={() => !disabled && onProject?.(section)}
        disabled={disabled}
        aria-disabled={disabled}
        aria-label={`Proyectar sección ${section.label}`}
        className={
          'w-full text-left flex flex-col gap-1 min-h-[56px] ' +
          (disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]')
        }
      >
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-mono tracking-widest text-copper-200">
            {section.label}
          </span>
          {isLive && (
            <span className="text-[10px] uppercase font-mono tracking-widest text-live px-1.5 py-0.5 rounded bg-live/10 border border-live/40">
              EN VIVO
            </span>
          )}
        </span>
        <span className="text-sm text-ink-2 truncate">
          {preview || <em className="text-ink-3">(sin texto)</em>}
        </span>
      </button>
      {isLive && (
        <button
          type="button"
          onClick={() => onClearLive?.()}
          className="mt-1 h-9 rounded-lg bg-bg-3 text-ink-2 text-xs font-medium hover:bg-bg-1 transition-colors"
        >
          Quitar live
        </button>
      )}
    </div>
  )
}
