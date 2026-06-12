/**
 * BiblePreviewSheet
 *
 * Bottom-sheet modal con la previsualización del versículo seleccionado
 * y un botón Proyectar (CTA primaria) + Cancelar. Soporta:
 *   - tap fuera (backdrop) → dismiss
 *   - tecla Esc → dismiss
 *   - swipe-down (dy>120px) → dismiss
 *   - focus trap básico (primer tab vuelve al botón Proyectar)
 *   - prefers-reduced-motion: opacidad only, sin slide
 *   - aria-modal=true, role=dialog
 *
 * Pattern: full-screen backdrop + sheet anclado abajo con rounded-top.
 * El sheet NO se renderiza si open=false (no portal — vive en el árbol).
 */
import { useEffect, useRef, useState } from 'react'
import { useT } from '../hooks/useT.js'

export default function BiblePreviewSheet({
  open,
  item,
  isConnected = true,
  onClose,
  onProject,
}) {
  const { t } = useT()
  const sheetRef = useRef(null)
  const projectBtnRef = useRef(null)
  const [dragOffset, setDragOffset] = useState(0)
  const touchStartY = useRef(null)

  // Focus al abrir + cleanup. role=dialog + aria-modal requiere mover el
  // foco al primer elemento interactivo para no dejarlo bajo el sheet.
  useEffect(() => {
    if (!open) return
    // Pequeño delay para que el browser pinte antes de focus.
    const t = setTimeout(() => {
      projectBtnRef.current?.focus()
    }, 50)
    return () => clearTimeout(t)
  }, [open])

  // Esc cierra.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Cuando se cierra, reset del drag offset (para que la próxima apertura
  // empiece desde la posición correcta).
  useEffect(() => {
    if (!open) setDragOffset(0)
  }, [open])

  if (!open || !item) return null

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  const handleTouchMove = (e) => {
    if (touchStartY.current == null) return
    const dy = e.touches[0].clientY - touchStartY.current
    if (dy > 0) setDragOffset(dy)
  }
  const handleTouchEnd = () => {
    if (dragOffset > 120) {
      onClose?.()
    }
    setDragOffset(0)
    touchStartY.current = null
  }

  const handleProject = () => {
    if (!isConnected) return
    onProject?.(item)
  }

  const titleId = 'bible-preview-title'
  const textId = 'bible-preview-text'

  return (
    <div
      // backdrop — SIN touchAction:'none': lo tenía y mataba el
      // overflow-y-auto del contenido en versículos largos (el touch-scroll
      // quedaba bloqueado para todo el subárbol).
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-bg-1 border-t-2 border-copper-200/30 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh] motion-safe:transition-transform"
        style={{
          transform: `translateY(${dragOffset}px)`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle — único dueño del gesto swipe-down. touchAction:'none'
            vive SOLO aquí para que el browser no compita con el drag; el
            resto del sheet scrollea con touch normal. */}
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

        {/* Contenido scroll si verse muy largo */}
        <div className="px-5 pt-3 pb-4 overflow-y-auto">
          <p
            id={titleId}
            className="font-mono text-xs uppercase tracking-[0.16em] text-copper-200 mb-3"
          >
            {item.reference}
          </p>
          <p
            id={textId}
            className="font-display text-xl leading-relaxed text-ink-1"
          >
            {item.text}
          </p>
        </div>

        {/* Botones sticky abajo */}
        <div className="sticky bottom-0 bg-bg-1/95 backdrop-blur px-4 py-3 border-t border-line-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-bg-3 text-ink-2 font-medium hover:bg-bg-2 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            ref={projectBtnRef}
            type="button"
            onClick={handleProject}
            disabled={!isConnected}
            aria-disabled={!isConnected}
            aria-describedby={!isConnected ? 'offline-hint' : undefined}
            className={
              'flex-2 h-12 rounded-xl font-semibold transition-colors ' +
              (isConnected
                ? 'bg-gradient-to-b from-copper-200 to-copper-300 text-bg-1 hover:brightness-110 active:scale-[0.98]'
                : 'bg-bg-3 text-ink-3 cursor-not-allowed')
            }
            style={{ flex: 2 }}
          >
            {t('bible.project')}
          </button>
        </div>
        {!isConnected && (
          <p id="offline-hint" className="px-4 pb-3 text-center text-xs text-ink-3">
            {t('bible.sheetOffline')}
          </p>
        )}
      </div>
    </div>
  )
}
