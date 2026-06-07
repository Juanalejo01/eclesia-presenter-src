import { useId, useState } from 'react'
import { IconChevDown } from './Icons.jsx'

/**
 * Sección plegable para el panel de propiedades del editor.
 * Inspirado en los acordeones de Canva / Photoshop / Procreate.
 *
 * El estado abierto/cerrado se persiste en localStorage por clave única,
 * así el usuario encuentra el editor como lo dejó cuando vuelve.
 *
 * Props:
 *   title         Nombre de la sección (FONDO, TIPOGRAFÍA…) — se muestra
 *                 en mayúsculas estilo eyebrow.
 *   storageKey    Clave única para persistir el estado plegado/expandido.
 *                 Sin esta, cae a un useState simple sin persistencia.
 *   defaultOpen   Si true, abierta por defecto la primera vez (sin storage).
 *   subtitle      Texto pequeño a la derecha del título (opcional).
 *   icon          Icono opcional al inicio del título.
 *   children      Contenido — los <div className="field"> habituales.
 */
const STORAGE_PREFIX = 'eclesia.editor.section.'

function loadOpen(storageKey, defaultOpen) {
  if (!storageKey) return defaultOpen
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (v === '0') return false
    if (v === '1') return true
  } catch {}
  return defaultOpen
}

function saveOpen(storageKey, open) {
  if (!storageKey) return
  try { localStorage.setItem(STORAGE_PREFIX + storageKey, open ? '1' : '0') } catch {}
}

export default function PropertySection({
  title,
  subtitle,
  icon,
  storageKey,
  defaultOpen = true,
  children,
}) {
  const [open, setOpenState] = useState(() => loadOpen(storageKey, defaultOpen))
  // Id estable para a11y: aria-controls del botón apunta aquí.
  const bodyId = useId()

  const toggle = () => {
    const next = !open
    setOpenState(next)
    saveOpen(storageKey, next)
  }

  return (
    <div className="prop-section">
      <button
        type="button"
        onClick={toggle}
        className="prop-section-header"
        aria-expanded={open}
        aria-controls={bodyId}>
        <span className="prop-section-title">
          {icon && (
            <span className="prop-section-icon" aria-hidden="true">{icon}</span>
          )}
          {title}
        </span>
        <span className="prop-section-right">
          {/* subtitle es decorativo (resumen del estado); el valor real lo
              re-leen los controles del body. aria-hidden evita que lectores
              de pantalla lean "Tipografía 64px expandido" de forma confusa. */}
          {subtitle && (
            <span className="prop-section-sub" aria-hidden="true">{subtitle}</span>
          )}
          <span
            className={'prop-section-chev' + (open ? ' open' : '')}
            aria-hidden="true">
            <IconChevDown size={12} />
          </span>
        </span>
      </button>
      {/* Renderizamos siempre el contenido — la transición grid-template-rows
          anima al alto real (sin cap fijo de max-height que truncaría). El
          inner se mantiene siempre montado para preservar estado de inputs. */}
      <div
        id={bodyId}
        role="region"
        className={'prop-section-body' + (open ? ' open' : '')}>
        <div className="prop-section-body-inner">{children}</div>
      </div>
    </div>
  )
}
