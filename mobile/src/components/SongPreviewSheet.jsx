/**
 * SongPreviewSheet
 *
 * Bottom sheet con el detalle de una cancion: titulo + autor + chips de
 * tags + lista de secciones tapeables. NO se cierra al proyectar (workflow
 * de directo: el operador suele saltar entre secciones de la misma cancion).
 *
 * Patron clonado de BiblePreviewSheet pero mas alto (max-h 80vh) y con
 * lista interna en lugar de un solo CTA.
 */
import { useEffect, useRef, useState } from 'react'
import SongSectionButton from './SongSectionButton.jsx'
import { useT } from '../hooks/useT.js'

export default function SongPreviewSheet({
  open,
  song,           // detalle completo (de useSong); puede ser null mientras carga
  loading = false,
  isConnected = true,
  livePgm = null, // { songId, sectionId } o null
  onClose,
  onProjectSection,
  onClearLive,
}) {
  const { t } = useT()
  const sheetRef = useRef(null)
  const closeBtnRef = useRef(null)
  const [dragOffset, setDragOffset] = useState(0)
  const touchStartY = useRef(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { closeBtnRef.current?.focus() }, 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => { if (!open) setDragOffset(0) }, [open])

  if (!open) return null

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  const handleTouchMove = (e) => {
    if (touchStartY.current == null) return
    const dy = e.touches[0].clientY - touchStartY.current
    if (dy > 0) setDragOffset(dy)
  }
  const handleTouchEnd = () => {
    if (dragOffset > 120) onClose?.()
    setDragOffset(0)
    touchStartY.current = null
  }

  const titleId = 'song-preview-title'

  const sections = Array.isArray(song?.sections) ? song.sections : []
  const isLiveSection = (sec) =>
    livePgm && song && livePgm.songId === song.id && livePgm.sectionId === sec.sectionId

  return (
    <div
      // backdrop — SIN touchAction:'none' (mataba el overflow-y-auto de la
      // lista de secciones; mismo fix que BiblePreviewSheet).
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-bg-1 border-t-2 border-copper-200/30 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh] motion-safe:transition-transform"
        style={{
          transform: `translateY(${dragOffset}px)`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle — único dueño del gesto swipe-down (touchAction:'none'
            solo aquí; el contenido scrollea con touch normal). */}
        <div
          className="pt-2 pb-1 grid place-items-center"
          aria-hidden="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full bg-ink-3/40" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-2 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="font-display text-xl text-ink-1 truncate">
              {song?.title || (loading ? t('songs.sheetLoading') : t('songs.sheetFallbackTitle'))}
            </h2>
            {song?.author && (
              <p className="text-xs text-ink-3 mt-0.5">{song.author}</p>
            )}
            {song?.tags && (
              <div className="flex flex-wrap gap-1 mt-2">
                {String(song.tags).split(/[,;]/).map(t => t.trim()).filter(Boolean).slice(0, 5).map(t => (
                  <span key={t} className="text-[10px] uppercase tracking-widest font-mono text-ink-3 bg-bg-2 border border-line-1 px-2 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-10 h-10 grid place-items-center rounded-full bg-bg-2 text-ink-2 hover:bg-bg-3"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* Lista de secciones */}
        <div className="px-4 pt-2 pb-3 overflow-y-auto flex flex-col gap-2 flex-1">
          {loading && !song && (
            <div aria-hidden="true" className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 rounded-xl bg-bg-2 border border-line-1 animate-pulse" />
              ))}
            </div>
          )}
          {!loading && sections.length === 0 && song && (
            <p role="status" className="text-center text-sm text-ink-3 py-4">
              {t('songs.noSections')}
            </p>
          )}
          {sections.map((sec) => (
            <SongSectionButton
              key={sec.sectionId}
              section={sec}
              isLive={isLiveSection(sec)}
              disabled={!isConnected}
              onProject={() => onProjectSection?.(sec)}
              onClearLive={onClearLive}
            />
          ))}
        </div>

        {!isConnected && (
          <p className="px-4 pb-3 text-center text-xs text-ink-3">
            {t('songs.sheetOffline')}
          </p>
        )}
      </div>
    </div>
  )
}
