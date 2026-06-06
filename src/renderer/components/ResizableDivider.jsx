import { useRef, useEffect } from 'react'

/**
 * Divider que se arrastra para redimensionar una columna o fila adyacente.
 *
 * Props:
 *   size       Tamaño actual del lado controlado, en píxeles.
 *   onResize   Callback (newSize) durante el arrastre — actualiza el state.
 *   onCommit   Callback opcional (finalSize) al soltar — para persistir
 *              en localStorage sin spammear el storage en cada mousemove.
 *   direction  'right'  → arrastrar a la izquierda agranda el panel de la
 *                         derecha (caso típico: monitor de previsualización).
 *              'left'   → arrastrar a la derecha agranda el panel de la
 *                         izquierda (caso típico: biblioteca de canciones).
 *   min, max   Límites del tamaño.
 *   variant    'main' para el divider principal entre paneles del shell
 *              (más grueso/visible); 'inner' para divisores internos de
 *              un panel (más sutil).
 *
 * No hace gestión propia del valor — solo dispara callbacks.
 */
export default function ResizableDivider({
  size,
  onResize,
  onCommit,
  direction = 'right',
  min = 200,
  max = 1000,
  variant = 'main',
}) {
  // Refs para no perder el valor inicial durante el drag, incluso si el
  // componente re-renderiza mientras se mueve el mouse.
  const startRef = useRef({ x: 0, size: 0 })
  const currentSizeRef = useRef(size)
  useEffect(() => { currentSizeRef.current = size }, [size])

  const onMouseDown = (e) => {
    // Ignorar clicks del botón derecho/medio
    if (e.button !== 0) return
    e.preventDefault()

    startRef.current = { x: e.clientX, size }

    const onMove = (me) => {
      const start = startRef.current
      // delta > 0 cuando el ratón se mueve a la izquierda
      const dx = start.x - me.clientX
      // direction='right': arrastrar a la izquierda agranda el panel de la
      // derecha (el monitor) → newSize = start + dx
      // direction='left':  arrastrar a la derecha agranda el panel de la
      // izquierda → newSize = start - dx (signo opuesto)
      const delta = direction === 'right' ? dx : -dx
      const newSize = Math.max(min, Math.min(max, start.size + delta))
      currentSizeRef.current = newSize
      onResize?.(newSize)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onCommit?.(currentSizeRef.current)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Doble click: reset al valor por defecto. Pequeño quality-of-life.
  const onDoubleClick = () => {
    // Sin un default explícito, no hacemos nada — evitar sorpresas.
    if (typeof onCommit !== 'function') return
    // Convención: 'main' por defecto reseteamos a 380; 'inner' a (min+max)/2.
    const def = variant === 'main' ? 380 : Math.round((min + max) / 2)
    onResize?.(def)
    onCommit?.(def)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Arrastra para redimensionar · doble click para resetear"
      style={{
        cursor: 'col-resize',
        position: 'relative',
        userSelect: 'none',
        // Línea visible del divider (1px) centrada en su columna del grid
        background: variant === 'main'
          ? 'var(--line-1)'
          : 'transparent',
        zIndex: 5,
      }}
    >
      {/* Zona de agarre invisible más ancha alrededor de la línea: el usuario
          no tiene que apuntar exactamente al pixel de la línea. */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0,
        left: -4, right: -4,
      }} />
      {/* Indicador visual sutil en el centro del divider — un par de puntos
          tipo "drag handle" para que se note que es arrastrable. */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', gap: 3,
        opacity: variant === 'main' ? 0.45 : 0.30,
        pointerEvents: 'none',
      }}>
        <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--text-3)' }} />
        <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--text-3)' }} />
        <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--text-3)' }} />
      </div>
    </div>
  )
}
