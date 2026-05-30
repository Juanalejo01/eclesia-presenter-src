// Store de Lista del día — persistente en localStorage.
// Cada item carga el contenido completo (text, reference) ya resuelto,
// más metadata para regenerar (bookIndex, verseNums, songId, sectionIndex).
//
// Suscripción reactiva: los componentes se enteran de cambios sin polling.

// MIME type usado para drag&drop hacia la Lista del día.
// Cualquier panel puede arrastrar items con este tipo y el ScheduleStrip
// los acepta. El payload es el JSON del schedule item completo.
export const SCHEDULE_DRAG_MIME = 'application/x-eclesia-schedule-item'

/**
 * Helper para usar en onDragStart de un elemento que se va a soltar en la Lista.
 * Pasa el item completo (con type, title, text, reference, meta).
 *
 *   <div draggable onDragStart={e => setScheduleDragPayload(e, item)}>...
 */
export function setScheduleDragPayload(event, item) {
  if (!event?.dataTransfer || !item) return
  try {
    event.dataTransfer.setData(SCHEDULE_DRAG_MIME, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'copy'
  } catch {}
}

/** ¿Este evento de drop trae un item para la Lista del día? */
export function getScheduleDragPayload(event) {
  try {
    const raw = event?.dataTransfer?.getData(SCHEDULE_DRAG_MIME)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

const STORAGE_KEY = 'eclesia.schedule'
const listeners = new Set()

function read() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function write(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  for (const fn of listeners) try { fn(items) } catch {}
}

let nextId = (() => {
  const items = read()
  return Math.max(0, ...items.map(i => i.id || 0)) + 1
})()

// --------- API ---------

export function getItems() { return read() }

export function subscribe(fn) {
  listeners.add(fn)
  fn(read())
  return () => listeners.delete(fn)
}

/**
 * Añade un item al final de la lista. El payload trae siempre:
 *  { type: 'bible'|'song'|'note', title, text, reference, ...metadata }
 */
export function addItem(payload) {
  const items = read()
  const item = {
    id: nextId++,
    type: payload.type || 'note',
    title: payload.title || payload.text?.slice(0, 60) || 'Sin título',
    text: payload.text || '',
    reference: payload.reference || '',
    done: false,
    addedAt: Date.now(),
    ...payload.meta,  // metadata específica del tipo
  }
  write([...items, item])
  return item
}

export function removeItem(id) {
  write(read().filter(i => i.id !== id))
}

export function updateItem(id, patch) {
  write(read().map(i => i.id === id ? { ...i, ...patch } : i))
}

export function toggleDone(id) {
  const items = read()
  const item = items.find(i => i.id === id)
  if (!item) return
  updateItem(id, { done: !item.done })
}

/** Mueve item del índice `from` al índice `to` (drag & drop reorder) */
export function moveItem(fromIdx, toIdx) {
  const items = read()
  if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) return
  if (fromIdx === toIdx) return
  const next = [...items]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  write(next)
}

export function clear() { write([]) }
