// AppDialog.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Modal global confirm/alert/prompt acorde al brand cobre. Se monta una vez en
// App.jsx; render condicional según el dialogService singleton.
//
// Estado: leído via useDialog(). Si no hay dialog activo → render null.
// Cierre: por botones, Esc, Enter (confirm), o click en backdrop.
// A11y: role=dialog, aria-modal, aria-labelledby, focus inicial automático.

import { useEffect, useRef, useState } from 'react'
import { useDialog, resolveDialog } from '../services/dialogService.js'

// Mini ref-counter para que múltiples modales anidados no se pisen el overflow
// del body. Sobrevive pre-emption (open→open con id distinto): cleanup decrementa,
// re-effect incrementa, neto = 1. Si en el futuro otro modal usa el mismo helper,
// también respeta el orden correcto de restauración.
let _bodyLockCount = 0
let _prevOverflow = ''
function lockBodyScroll() {
  if (_bodyLockCount === 0) {
    _prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  _bodyLockCount++
}
function unlockBodyScroll() {
  _bodyLockCount = Math.max(0, _bodyLockCount - 1)
  if (_bodyLockCount === 0) {
    document.body.style.overflow = _prevOverflow
  }
}

// Iconos SVG inline para no añadir dependencia. Se pintan con currentColor.
function IconQuestion() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconWarning() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconInfo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function VariantIcon({ variant }) {
  if (variant === 'danger') return <IconWarning />
  if (variant === 'info') return <IconInfo />
  return <IconQuestion />
}

export default function AppDialog() {
  const dlg = useDialog()
  const [inputVal, setInputVal] = useState('')
  const inputRef = useRef(null)
  const confirmBtnRef = useRef(null)
  const cardRef = useRef(null)

  // Reset del input cuando se abre un nuevo prompt. Usamos el id como dependencia
  // para forzar el reset incluso si dos prompts seguidos tienen el mismo type.
  useEffect(() => {
    if (dlg?.type === 'prompt') {
      setInputVal(dlg.defaultValue || '')
    }
  }, [dlg?.id, dlg?.type])

  // Bloquear scroll del body + handlers de teclado mientras el modal está abierto.
  useEffect(() => {
    if (!dlg) return
    lockBodyScroll()

    // Auto-focus tras el primer paint para que la animación no robe el foco.
    const raf = requestAnimationFrame(() => {
      if (dlg.type === 'prompt') {
        const el = inputRef.current
        if (el) {
          el.focus()
          // Seleccionar todo el texto por defecto: UX cómoda para reemplazar.
          try { el.select() } catch {}
        }
      } else {
        confirmBtnRef.current?.focus()
      }
    })

    // Fix 1: Leer del DOM evita el bug TDZ del ref espejo (Enter inmediato con
    // defaultValue devolvía null porque el effect mirror corría después).
    const handleConfirm = () => {
      if (dlg.type === 'prompt') {
        const v = (inputRef.current?.value || '').trim()
        resolveDialog(v ? v : null)
      } else {
        resolveDialog(true)
      }
    }
    const handleCancel = () => {
      resolveDialog(dlg.type === 'prompt' ? null : false)
    }

    // Fix 4: focus trap entre primer y último elemento focusable del card.
    const trapFocus = (e) => {
      const root = cardRef.current
      if (!root) return
      const focusables = root.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Fix 2: stopImmediatePropagation evita que SongEditor/CommandPalette u
        // otros listeners hermanos en capture-phase también reaccionen al Esc.
        e.stopImmediatePropagation()
        e.preventDefault()
        handleCancel()
      } else if (e.key === 'Enter') {
        // En textareas no interceptar (no aplica hoy pero seguro a futuro).
        if (e.target && e.target.tagName === 'TEXTAREA') return
        e.stopImmediatePropagation()
        e.preventDefault()
        handleConfirm()
      } else if (e.key === 'Tab') {
        trapFocus(e)
      }
    }
    window.addEventListener('keydown', onKey, true)

    return () => {
      cancelAnimationFrame(raf)
      unlockBodyScroll()
      window.removeEventListener('keydown', onKey, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlg?.id])

  if (!dlg) return null

  const onBackdropClick = (e) => {
    // Solo cancela si el click fue en el backdrop (no en el card).
    if (e.target === e.currentTarget) {
      resolveDialog(dlg.type === 'prompt' ? null : false)
    }
  }

  const onCancel = () => resolveDialog(dlg.type === 'prompt' ? null : false)
  const onConfirm = () => {
    if (dlg.type === 'prompt') {
      const v = (inputVal || '').trim()
      resolveDialog(v ? v : null)
    } else {
      resolveDialog(true)
    }
  }

  const titleId = `app-dialog-title-${dlg.id}`
  const variant = dlg.variant || 'default'
  const confirmClass = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'

  return (
    <div className="modal-backdrop" onMouseDown={onBackdropClick}>
      <div
        ref={cardRef}
        className={`app-dialog-card variant-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-dialog-header">
          <span className={`app-dialog-icon ${variant}`}>
            <VariantIcon variant={variant} />
          </span>
          <h2 id={titleId} className="app-dialog-title">{dlg.title}</h2>
        </div>

        <div className="app-dialog-body">
          {dlg.message && <div className="app-dialog-message">{dlg.message}</div>}
          {dlg.detail && <div className="app-dialog-detail">{dlg.detail}</div>}
          {dlg.type === 'prompt' && (
            <input
              ref={inputRef}
              type="text"
              className="app-dialog-input"
              value={inputVal}
              maxLength={dlg.maxLength || 200}
              placeholder={dlg.placeholder || ''}
              onChange={(e) => setInputVal(e.target.value)}
            />
          )}
        </div>

        <div className="app-dialog-footer">
          {dlg.cancelLabel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {dlg.cancelLabel}
            </button>
          )}
          <button
            type="button"
            ref={confirmBtnRef}
            className={confirmClass}
            onClick={onConfirm}
          >
            {dlg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
