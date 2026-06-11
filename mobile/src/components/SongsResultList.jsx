/**
 * SongsResultList
 *
 * Lista CSS-virtualizada de SongsRow. Mismo patron que BibleResultList.
 */
import SongsRow from './SongsRow.jsx'
import { useT } from '../hooks/useT.js'

export default function SongsResultList({ items, onTap }) {
  const { t } = useT()
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <ul
      role="list"
      aria-label={t('songs.listAria', { n: items.length })}
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
