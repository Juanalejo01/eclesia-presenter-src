/**
 * SongsRow
 *
 * Item del catalogo de canciones. Two-line: title + (author · matchKind/snippet).
 * Badge "Letra" cuando matchKind === 'lyric'.
 */
import { useT } from '../hooks/useT.js'

export default function SongsRow({ song, onTap }) {
  const { t } = useT()
  if (!song) return null
  const meta = song.author || song.tags || ''
  const showLyricBadge = song.matchKind === 'lyric'
  const ariaLabel = t('songs.rowAria', { title: song.title }) + (song.author ? ', ' + song.author : '')
  return (
    <button
      type="button"
      onClick={() => onTap?.(song)}
      aria-label={ariaLabel}
      className={
        'w-full text-left flex flex-col gap-1 p-3 rounded-xl ' +
        'bg-bg-2 border border-line-1 hover:bg-bg-3 active:bg-bg-3 ' +
        'transition-colors min-h-[64px]'
      }
      style={{ contentVisibility: 'auto' }}
    >
      <span className="flex items-center gap-2">
        <span className="text-sm text-ink-1 font-medium truncate flex-1">
          {song.title}
        </span>
        {song.isFavorite && (
          <span
            aria-label={t('songs.favorite')}
            className="text-copper-200 text-xs"
            title={t('songs.favorite')}
          >
            ★
          </span>
        )}
        {showLyricBadge && (
          <span className="text-[10px] uppercase font-mono tracking-widest text-copper-200 px-1.5 py-0.5 rounded bg-bg-3 border border-copper-200/30">
            {t('songs.lyricBadge')}
          </span>
        )}
      </span>
      {(meta || song.snippet) && (
        <span className="text-xs text-ink-3 truncate">
          {song.snippet || meta}
        </span>
      )}
    </button>
  )
}
