/**
 * ScheduleList.test.jsx
 *
 * Cobertura del componente lista del día. Mockeamos:
 *   - `transport.subscribe`/`send` (igual que en ServiceScreen.test).
 *   - `scheduleActions` para inspeccionar projectItem / reorderItems.
 *   - `@hello-pangea/dnd` con stubs simples — el DnD real necesita
 *     drag/drop nativos que jsdom no implementa, así que reemplazamos
 *     los componentes por wrappers transparentes y exponemos onDragEnd
 *     globalmente para dispararlo desde el test.
 *
 * Entorno: jsdom (por extensión .test.jsx).
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mock del transport (solo subscribe — send va a scheduleActions) ─
const mockSubscribers = {}
jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    subscribe: (eventType, handler) => {
      if (!mockSubscribers[eventType]) mockSubscribers[eventType] = new Set()
      mockSubscribers[eventType].add(handler)
      return () => mockSubscribers[eventType]?.delete(handler)
    },
    send: jest.fn(() => true),
  },
  ServerEvent: {
    SCHEDULE_UPDATE: 'schedule-update',
  },
}))

// ─── Mock de scheduleActions ────────────────────────────────────────
const mockProjectItem = jest.fn()
const mockReorderItems = jest.fn()
jest.mock('../src/services/scheduleActions.js', () => ({
  projectItem: (...args) => mockProjectItem(...args),
  reorderItems: (...args) => mockReorderItems(...args),
}))

// ─── Mock de haptics ─────────────────────────────────────────────────
const mockTapLight = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: (...args) => mockTapLight(...args),
  tapMedium: jest.fn(),
}))

// ─── Mock de @hello-pangea/dnd ───────────────────────────────────────
// jsdom no soporta drag/drop nativo. Reemplazamos con stubs que:
//   - Exponen onDragEnd globalmente para dispararlo manualmente.
//   - Pasan children con providers vacíos pero válidos.
jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }) => {
    global.__triggerDragEnd = onDragEnd
    return children
  },
  Droppable: ({ children }) => children(
    { droppableProps: {}, innerRef: () => {}, placeholder: null },
    { isDraggingOver: false },
  ),
  Draggable: ({ children, draggableId }) => children(
    {
      draggableProps: { 'data-draggable-id': draggableId, style: {} },
      innerRef: () => {},
      dragHandleProps: { 'data-drag-handle': draggableId },
    },
    { isDragging: false },
  ),
}))

// Después de TODOS los mocks, importamos el componente.
import ScheduleList from '../src/components/ScheduleList.jsx'

function emit(eventType, payload) {
  const set = mockSubscribers[eventType]
  if (!set) return
  act(() => {
    for (const h of set) h(payload)
  })
}

beforeEach(() => {
  for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
  mockProjectItem.mockClear()
  mockReorderItems.mockClear()
  mockTapLight.mockClear()
  global.__triggerDragEnd = undefined
})

// ──────────────────────────────────────────────────────────────────────
// 1. Estado stale → "Cargando lista del día..."
// ──────────────────────────────────────────────────────────────────────
test('1. estado stale → muestra "Cargando lista del día..."', () => {
  render(<ScheduleList />)
  expect(screen.getByText(/Cargando lista del día/i)).toBeInTheDocument()
})

// ──────────────────────────────────────────────────────────────────────
// 2. Empty state tras schedule-update con []
// ──────────────────────────────────────────────────────────────────────
test('2. schedule-update con [] → muestra empty state', () => {
  render(<ScheduleList />)
  emit('schedule-update', [])
  expect(screen.getByText(/Sin items en la lista del día/i)).toBeInTheDocument()
  expect(screen.queryByText(/Cargando lista del día/i)).toBeNull()
})

// ──────────────────────────────────────────────────────────────────────
// 3. Items renderizan título + contador (N) en el header
// ──────────────────────────────────────────────────────────────────────
test('3. items se renderizan con título + contador en el header', () => {
  render(<ScheduleList />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'Cuán grande es Él' },
    { id: 'b', type: 'bible', title: 'Salmos 23:1', subtitle: 'Sal 23:1' },
    { id: 'c', type: 'image', title: 'Fondo cruz' },
  ])
  expect(screen.getByText(/Lista del día \(3\)/i)).toBeInTheDocument()
  expect(screen.getByText('Cuán grande es Él')).toBeInTheDocument()
  expect(screen.getByText('Salmos 23:1')).toBeInTheDocument()
  expect(screen.getByText('Sal 23:1')).toBeInTheDocument()
  expect(screen.getByText('Fondo cruz')).toBeInTheDocument()
})

// ──────────────────────────────────────────────────────────────────────
// 4. Tap en una fila → llama projectItem con el item
// ──────────────────────────────────────────────────────────────────────
test('4. tap en una fila → projectItem(item)', () => {
  render(<ScheduleList />)
  const items = [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
  ]
  emit('schedule-update', items)
  // La fila tiene aria-label "Proyectar Canción: A"
  const rowA = screen.getByRole('button', { name: /Proyectar Canción: A/i })
  fireEvent.click(rowA)
  expect(mockProjectItem).toHaveBeenCalledTimes(1)
  expect(mockProjectItem).toHaveBeenCalledWith(items[0])
})

// ──────────────────────────────────────────────────────────────────────
// 5. onDragEnd con destination distinto → setLocalOrder + reorderItems
// ──────────────────────────────────────────────────────────────────────
test('5. onDragEnd valido → reorderItems con ids reordenados + tapLight', () => {
  render(<ScheduleList />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
    { id: 'c', type: 'song', title: 'C' },
  ])
  // Mover índice 0 → 2 (a → final): orden resultante b, c, a
  act(() => {
    global.__triggerDragEnd({
      source: { index: 0, droppableId: 'schedule' },
      destination: { index: 2, droppableId: 'schedule' },
    })
  })
  expect(mockReorderItems).toHaveBeenCalledTimes(1)
  expect(mockReorderItems).toHaveBeenCalledWith(['b', 'c', 'a'])
  expect(mockTapLight).toHaveBeenCalledTimes(1)
})

// ──────────────────────────────────────────────────────────────────────
// 6. onDragEnd sin destination (soltado fuera) → no reorder
// ──────────────────────────────────────────────────────────────────────
test('6. onDragEnd sin destination → no reorder ni tapLight', () => {
  render(<ScheduleList />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
  ])
  act(() => {
    global.__triggerDragEnd({
      source: { index: 0, droppableId: 'schedule' },
      destination: null,
    })
  })
  expect(mockReorderItems).not.toHaveBeenCalled()
  expect(mockTapLight).not.toHaveBeenCalled()
})

// ──────────────────────────────────────────────────────────────────────
// 7. onDragEnd con source===destination → no reorder
// ──────────────────────────────────────────────────────────────────────
test('7. onDragEnd con índices iguales → no reorder', () => {
  render(<ScheduleList />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
  ])
  act(() => {
    global.__triggerDragEnd({
      source: { index: 1, droppableId: 'schedule' },
      destination: { index: 1, droppableId: 'schedule' },
    })
  })
  expect(mockReorderItems).not.toHaveBeenCalled()
})

// ──────────────────────────────────────────────────────────────────────
// 8. Después del reorder el orden visible refleja el cambio
//    (optimistic update via setLocalOrder)
// ──────────────────────────────────────────────────────────────────────
test('8. reorder optimista repinta el DOM con el orden nuevo', () => {
  render(<ScheduleList />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
    { id: 'c', type: 'song', title: 'C' },
  ])
  // El DOM inicial: a, b, c (en el orden de aparición de los aria-labels).
  const initialButtons = screen.getAllByRole('button').filter((b) =>
    /Proyectar Canción/i.test(b.getAttribute('aria-label') || ''),
  )
  expect(initialButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Proyectar Canción: A',
    'Proyectar Canción: B',
    'Proyectar Canción: C',
  ])
  // Mover c → primero (índice 2 → 0)
  act(() => {
    global.__triggerDragEnd({
      source: { index: 2, droppableId: 'schedule' },
      destination: { index: 0, droppableId: 'schedule' },
    })
  })
  const afterButtons = screen.getAllByRole('button').filter((b) =>
    /Proyectar Canción/i.test(b.getAttribute('aria-label') || ''),
  )
  expect(afterButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Proyectar Canción: C',
    'Proyectar Canción: A',
    'Proyectar Canción: B',
  ])
})

// ──────────────────────────────────────────────────────────────────────
// 9. Tecla Enter en una fila → projectItem (accesibilidad)
// ──────────────────────────────────────────────────────────────────────
test('9. tecla Enter en una fila → projectItem(item)', () => {
  render(<ScheduleList />)
  const items = [{ id: 'a', type: 'bible', title: 'Salmos 23', bible: { book: 'Salmos', chapter: 23, verse: 1 } }]
  emit('schedule-update', items)
  const row = screen.getByRole('button', { name: /Proyectar Biblia: Salmos 23/i })
  fireEvent.keyDown(row, { key: 'Enter' })
  expect(mockProjectItem).toHaveBeenCalledWith(items[0])
})
