/**
 * SongsResultList
 *
 * Lista CSS-virtualizada de SongsRow. Mismo patron que BibleResultList.
 */
import SongsRow from './SongsRow.jsx'

export default function SongsResultList({ items, onTap }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <ul
      role="list"
      aria-label={`${items.length} canciones`}
      className="flex flex-col gap-2 overflow-y-auto"
    >
      {items.map((song) => (
        <li key={song.id} role="listitem">
          <SongsRow song={song} onTap={onTap} />
        </li>
      ))}
    </ul>
  )
}
