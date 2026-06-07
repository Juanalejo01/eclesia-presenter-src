/**
 * ScheduleItemRow
 *
 * Fila individual de la lista del día. memo() para que un reorder de la
 * lista no repinte las filas cuyo item no cambió de referencia.
 *
 * Estructura: handle de drag (⋮⋮) + icono por tipo + título/subtítulo.
 * El handle es la única zona que inicia drag — el resto del área es
 * tap-para-proyectar. Esto evita que el usuario inicie un drag por
 * accidente al pulsar para proyectar.
 *
 * Accesibilidad:
 *   - role=button + aria-label descriptivo del tipo + título.
 *   - Enter/Space en el body proyectan el item.
 *   - El handle tiene aria-label "Reordenar".
 */
import { memo } from 'react'

// Iconos emoji por tipo. Mantenidos como string literales (no SVG)
// para no añadir peso al bundle — son glyphs del sistema y se ven
// nítidos a cualquier escala.
const ICON_BY_TYPE = {
  song:         '\u{1F3B5}', // 🎵
  bible:        '\u{1F4D6}', // 📖
  image:        '\u{1F5BC}', // 🖼️
  video:        '\u{1F3AC}', // 🎬
  announcement: '\u{1F4E2}', // 📢
}

const LABEL_BY_TYPE = {
  song:         'Canción',
  bible:        'Biblia',
  image:        'Imagen',
  video:        'Video',
  announcement: 'Anuncio',
}

function _ScheduleItemRow({ item, isDragging, dragHandleProps, onTap }) {
  const typeLabel = LABEL_BY_TYPE[item.type] || 'Item'
  const icon = ICON_BY_TYPE[item.type] || '·'

  // Handlers locales que inyectan `item` para que el padre pase un
  // `onTap(item)` ESTABLE (no una closure por render que rompa memo).
  function handleClick() {
    onTap?.(item)
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap?.(item)
    }
  }

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Proyectar ${typeLabel}: ${item.title}`}
      onKeyDown={handleKeyDown}
      className={
        'flex items-center gap-3 px-3 py-3 rounded-lg ' +
        'bg-bg-2 border border-line-1 ' +
        'transition active:scale-[0.98] cursor-pointer ' +
        (isDragging
          ? 'shadow-2xl shadow-black/40 border-copper-200/50 bg-bg-3'
          : 'hover:bg-bg-3')
      }
    >
      {/* Drag handle — única zona que inicia drag. El resto del area
          es tap-para-proyectar. Evita que el usuario empiece un drag
          por accidente al pulsar para proyectar. */}
      <div
        {...dragHandleProps}
        aria-label="Reordenar"
        className="shrink-0 grid place-items-center w-7 h-9 rounded text-ink-3 hover:text-ink-2 cursor-grab active:cursor-grabbing select-none"
        onClick={(e) => {
          // El handle NO debe disparar onTap del padre — sólo arrastra.
          e.stopPropagation()
        }}
      >
        <span className="text-base leading-none">{'⋮⋮'}</span>
      </div>

      {/* Icono por tipo */}
      <div
        className="shrink-0 w-9 h-9 rounded-md bg-bg-3 grid place-items-center text-lg"
        aria-hidden="true"
      >
        {icon}
      </div>

      {/* Contenido: título + subtítulo (opcional) */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-1 truncate">{item.title}</div>
        {item.subtitle && (
          <div className="text-xs text-ink-3 truncate font-mono">{item.subtitle}</div>
        )}
      </div>
    </div>
  )
}

// memo compara por igualdad de referencia. ScheduleList usa setLocalOrder
// con un array nuevo cuyas referencias internas (los items) se preservan
// — sólo el ítem movido cambia de posición, no de referencia. Por eso
// `prev.item === next.item` evita re-renders innecesarios de las filas
// que no se movieron.
//
// `onTap` se compara también: el padre lo memoriza con useCallback y
// recibe `item` como argumento (no como closure capturado), así que la
// referencia es estable entre renders mientras no cambien sus deps.
// `dragHandleProps` viene de la lib de dnd y puede no ser estable: si
// no lo es, simplemente re-renderemos la fila, que es benigno (los
// child nodes no cambian de identidad).
export default memo(_ScheduleItemRow, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.isDragging === next.isDragging &&
    prev.onTap === next.onTap &&
    prev.dragHandleProps === next.dragHandleProps
  )
})
