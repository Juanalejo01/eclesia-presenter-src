/**
 * BibleResultRow
 *
 * Item de la lista de resultados. Two-line truncate por defecto para
 * que la lista quepa en el viewport del móvil sin scroll horizontal.
 * Min height 64px para cumplir el target tap a11y (44x44).
 */
import { useT } from '../hooks/useT.js'

export default function BibleResultRow({ item, onTap, highlight = false }) {
  const { t } = useT()
  if (!item) return null
  const preview = (item.text || '').slice(0, 80)
  const aria = t('bible.verseAria', {
    ref: item.reference,
    preview: `${preview}${item.text?.length > 80 ? '...' : ''}`,
  })
  return (
    <button
      type="button"
      onClick={() => onTap(item)}
      aria-label={aria}
      className={
        'w-full text-left flex flex-col gap-1 p-3 rounded-xl ' +
        'bg-bg-2 border transition-colors ' +
        (highlight
          ? 'border-copper-200/60 ring-1 ring-copper-200/30'
          : 'border-line-1 hover:bg-bg-3 active:bg-bg-3') +
        ' min-h-[64px]'
      }
      style={{ contentVisibility: 'auto' }}
    >
      <span className="text-[11px] font-mono uppercase tracking-widest text-copper-200">
        {item.reference}
      </span>
      <span className="text-sm text-ink-1 line-clamp-2 leading-snug">
        {item.text}
      </span>
    </button>
  )
}
