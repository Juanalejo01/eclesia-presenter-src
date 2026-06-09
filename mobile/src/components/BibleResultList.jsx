/**
 * BibleResultList
 *
 * Lista virtualizada-by-CSS de resultados. Sin react-window: usamos
 * `content-visibility: auto` por row para que el navegador haga el work
 * de no pintar rows fuera del viewport. Funciona en WebView Android
 * moderno (>=85). En fallback puro (Safari iOS viejo) degrada a pintar
 * todo — sigue siendo aceptable porque limit=20 max.
 */
import BibleResultRow from './BibleResultRow.jsx'

export default function BibleResultList({ results, mode, onTap }) {
  if (!Array.isArray(results) || results.length === 0) return null
  const highlightFirst = mode === 'ref' && results.length === 1
  return (
    <ul
      role="list"
      aria-label={`${results.length} resultados`}
      className="flex flex-col gap-2 overflow-y-auto"
    >
      {results.map((item, i) => (
        <li key={`${item.reference}-${i}`} role="listitem">
          <BibleResultRow
            item={item}
            onTap={onTap}
            highlight={highlightFirst && i === 0}
          />
        </li>
      ))}
    </ul>
  )
}
