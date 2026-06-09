/**
 * BibleSearchBar
 *
 * Input controlado para la búsqueda bíblica. Sin loading prop visible más
 * allá del spinner en la derecha. El componente NO contiene lógica de
 * debounce — eso vive en useBibleSearch. Aquí solo somos un input
 * accesible y bonito.
 */

export default function BibleSearchBar({
  value,
  onChange,
  onClear,
  loading = false,
  disabled = false,
  placeholder = 'Buscar versículo o texto…',
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-lg pointer-events-none"
      >
        🔍
      </span>
      <input
        type="search"
        role="searchbox"
        aria-label="Buscar versículo"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        spellCheck={false}
        autoCorrect="off"
        maxLength={200}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          'w-full h-12 pl-10 pr-12 rounded-xl bg-bg-2 border border-line-1 ' +
          'text-base text-ink-1 placeholder-ink-3 ' +
          'focus:outline-none focus:ring-2 focus:ring-copper-200/40 focus:border-copper-200 ' +
          'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        }
      />
      {loading && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-copper-200/60 border-t-transparent rounded-full animate-spin"
        />
      )}
      {!loading && value && value.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-ink-3 hover:text-ink-1 rounded-full hover:bg-bg-3 transition-colors"
        >
          <span aria-hidden="true" className="text-lg leading-none">×</span>
        </button>
      )}
    </div>
  )
}
