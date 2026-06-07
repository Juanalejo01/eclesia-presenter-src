/**
 * ScheduleList
 *
 * Lista del día con drag&drop táctil + tap para proyectar.
 *
 * Interacciones:
 *   - Tap simple en una fila → proyecta ese item al PC.
 *   - Long-press en el handle (⋮⋮) + arrastrar → reordena. Al soltar,
 *     envía list-reorder al server.
 *
 * Optimistic reorder:
 *   El reorder se aplica al instante en local (sin esperar el round-trip
 *   WS), para que el usuario vea la lista cambiar mientras suelta el
 *   dedo. Si después el server emite un schedule-update con un orden
 *   distinto (otro cliente cambió la lista, o el server rechazó el
 *   reorder), gana el del server — useSchedule sobreescribe items.
 *
 * Estados:
 *   - isStale=true (nunca llegó schedule-update) → "Cargando..."
 *   - items.length===0 (llegó pero está vacía) → empty state.
 *   - items.length>0 → DragDropContext con todas las filas.
 */
import { useCallback } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useSchedule } from '../hooks/useSchedule.js'
import { projectItem, reorderItems } from '../services/scheduleActions.js'
import { tapLight } from '../services/haptics.js'
import ScheduleItemRow from './ScheduleItemRow.jsx'

export default function ScheduleList() {
  const { items, isStale, setLocalOrder } = useSchedule()

  // onDragEnd: el callback de @hello-pangea/dnd. `result` trae source y
  // destination con índices. Si destination es null el usuario soltó
  // fuera de la droppable: cancelamos. Si source===destination no hay
  // cambio: cancelamos.
  const onDragEnd = useCallback(
    (result) => {
      if (!result || !result.destination) return
      const from = result.source.index
      const to = result.destination.index
      if (from === to) return

      // Reorder local optimista — mutamos una copia y reemplazamos.
      const next = items.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      setLocalOrder(next)

      // Envío al server. Si el send falla (offline), el transport lo
      // encolará — el reorder local ya está aplicado y se mantendrá
      // hasta que el server confirme con su propio schedule-update.
      reorderItems(next.map((it) => it.id))
      tapLight()
    },
    [items, setLocalOrder],
  )

  // Estable entre renders (deps vacías): la fila recibe `item` como
  // argumento, así que esta closure no captura nada que pueda variar.
  const onItemTap = useCallback((item) => {
    projectItem(item)
  }, [])

  if (isStale) {
    return (
      <section aria-label="Lista del día" className="text-xs text-ink-3 text-center py-6">
        Cargando lista del día...
      </section>
    )
  }
  if (items.length === 0) {
    return (
      <section aria-label="Lista del día" className="text-xs text-ink-3 text-center py-6">
        Sin items en la lista del día.
        <br />
        Añade canciones desde el PC.
      </section>
    )
  }

  return (
    <section aria-label="Lista del día">
      <h2 className="text-xs font-mono uppercase tracking-widest text-ink-3 mb-2 px-1">
        Lista del día ({items.length})
      </h2>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="schedule">
          {(droppable) => (
            <div
              ref={droppable.innerRef}
              {...droppable.droppableProps}
              className="flex flex-col gap-2"
            >
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(draggable, snapshot) => (
                    <div
                      ref={draggable.innerRef}
                      {...draggable.draggableProps}
                      style={draggable.draggableProps.style}
                    >
                      <ScheduleItemRow
                        item={item}
                        isDragging={snapshot.isDragging}
                        dragHandleProps={draggable.dragHandleProps}
                        onTap={onItemTap}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {droppable.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </section>
  )
}
