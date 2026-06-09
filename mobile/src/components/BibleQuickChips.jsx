/**
 * BibleQuickChips
 *
 * Chips horizontales con referencias frecuentes. Visible solo en idle
 * para no robar protagonismo cuando ya hay resultados. Tap → onPick(query).
 */

const CHIPS = [
  'Juan 3:16',
  'Salmos 23',
  '1 Corintios 13',
  'Mateo 5:3',
  'Génesis 1:1',
  'Proverbios 3:5',
  'Filipenses 4:13',
  'Romanos 8:28',
]

export default function BibleQuickChips({ onPick, disabled = false }) {
  return (
    <div
      role="list"
      aria-label="Versículos frecuentes"
      className="flex gap-2 overflow-x-auto snap-x snap-mandatory py-1 -mx-1 px-1"
    >
      {CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          role="listitem"
          disabled={disabled}
          onClick={() => onPick(chip)}
          className={
            'shrink-0 snap-start px-3 h-9 rounded-full ' +
            'bg-bg-2 border border-line-1 text-ink-2 text-sm font-medium ' +
            'hover:bg-bg-3 hover:text-ink-1 transition-colors ' +
            'disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

export { CHIPS as BIBLE_QUICK_CHIPS }
