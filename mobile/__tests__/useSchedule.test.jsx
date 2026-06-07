/**
 * useSchedule.test.jsx
 *
 * Cobertura del hook que suscribe a SCHEDULE_UPDATE. Mockeamos
 * `transport.subscribe` para registrar el handler y dispararlo
 * manualmente desde el test.
 *
 * Como es un hook React, vive en jsdom (.test.jsx). Renderizamos un
 * componente trampolín que invoca el hook y muestra `items` + `isStale`.
 *
 * Entorno: jsdom (por extensión .test.jsx, ver projects en package.json).
 */
import '@testing-library/jest-dom'
import { render, act } from '@testing-library/react'

// ─── Mock del transport ──────────────────────────────────────────────
const mockSubscribers = {}
const mockUnsubscribes = []

jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    subscribe: (eventType, handler) => {
      if (!mockSubscribers[eventType]) mockSubscribers[eventType] = new Set()
      mockSubscribers[eventType].add(handler)
      const off = jest.fn(() => {
        mockSubscribers[eventType]?.delete(handler)
      })
      mockUnsubscribes.push(off)
      return off
    },
  },
  ServerEvent: {
    PGM_UPDATE:        'pgm-update',
    SCHEDULE_UPDATE:   'schedule-update',
    CONNECTION_STATE:  'connection-state',
    PONG:              'pong',
    ERROR:             'error',
    AUTH_ERROR:        'auth-error',
  },
}))

// Después del mock importamos el hook.
import { useSchedule } from '../src/hooks/useSchedule.js'

// Trampolín: cualquier hook necesita un componente para evaluarse.
// Exponemos el resultado por referencia para inspeccionarlo desde el test.
let _captured = null
function Probe() {
  const result = useSchedule()
  _captured = result
  return (
    <div>
      <span data-testid="isStale">{String(result.isStale)}</span>
      <span data-testid="count">{result.items.length}</span>
      <ul>
        {result.items.map((it) => (
          <li key={it.id} data-testid="item">{it.id}:{it.type}:{it.title}</li>
        ))}
      </ul>
    </div>
  )
}

beforeEach(() => {
  for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
  mockUnsubscribes.length = 0
  _captured = null
})

function emit(eventType, payload) {
  const set = mockSubscribers[eventType]
  if (!set) return
  act(() => {
    for (const h of set) h(payload)
  })
}

// ──────────────────────────────────────────────────────────────────────
// 1. Estado inicial: items=[], isStale=true
// ──────────────────────────────────────────────────────────────────────
test('1. estado inicial → items=[] e isStale=true', () => {
  const { getByTestId } = render(<Probe />)
  expect(getByTestId('isStale').textContent).toBe('true')
  expect(getByTestId('count').textContent).toBe('0')
  // El hook debió suscribirse a SCHEDULE_UPDATE.
  expect(mockSubscribers['schedule-update']?.size).toBe(1)
})

// ──────────────────────────────────────────────────────────────────────
// 2. schedule-update con array válido → items poblados, isStale=false
// ──────────────────────────────────────────────────────────────────────
test('2. schedule-update válido → items poblados, isStale=false', () => {
  const { getByTestId, getAllByTestId } = render(<Probe />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'Cuán grande es Él' },
    { id: 'b', type: 'bible', title: 'Salmos 23' },
  ])
  expect(getByTestId('isStale').textContent).toBe('false')
  expect(getByTestId('count').textContent).toBe('2')
  const rows = getAllByTestId('item').map((n) => n.textContent)
  expect(rows).toEqual([
    'a:song:Cuán grande es Él',
    'b:bible:Salmos 23',
  ])
})

// ──────────────────────────────────────────────────────────────────────
// 3. schedule-update con payload empty array → isStale=false, items=[]
//    (distinción importante para que la UI muestre el empty state real)
// ──────────────────────────────────────────────────────────────────────
test('3. schedule-update con [] → isStale=false (server confirmó vacío)', () => {
  const { getByTestId } = render(<Probe />)
  expect(getByTestId('isStale').textContent).toBe('true')
  emit('schedule-update', [])
  expect(getByTestId('isStale').textContent).toBe('false')
  expect(getByTestId('count').textContent).toBe('0')
})

// ──────────────────────────────────────────────────────────────────────
// 4. payload no-array → ignorado (no cambia estado)
// ──────────────────────────────────────────────────────────────────────
test('4. payload no-array → ignorado', () => {
  const { getByTestId } = render(<Probe />)
  emit('schedule-update', { not: 'an array' })
  emit('schedule-update', 'string')
  emit('schedule-update', 42)
  emit('schedule-update', null)
  // Sigue stale: nada lo cambió.
  expect(getByTestId('isStale').textContent).toBe('true')
  expect(getByTestId('count').textContent).toBe('0')
})

// ──────────────────────────────────────────────────────────────────────
// 5. items mal formados (sin id/type) son filtrados
// ──────────────────────────────────────────────────────────────────────
test('5. items mal formados son filtrados', () => {
  const { getByTestId } = render(<Probe />)
  emit('schedule-update', [
    { id: 'good', type: 'song', title: 'Bien' },
    { type: 'song', title: 'Sin id' },         // sin id
    { id: 'no-type', title: 'Sin type' },      // sin type
    null,                                      // null
    'string',                                  // primitivo
    { id: 42, type: 'song', title: 'id no string' }, // id no-string
    { id: 'ok2', type: 'bible', title: 'OK2' },
  ])
  expect(getByTestId('count').textContent).toBe('2')
  expect(_captured.items.map((it) => it.id)).toEqual(['good', 'ok2'])
})

// ──────────────────────────────────────────────────────────────────────
// 6. setLocalOrder actualiza items inmediatamente
// ──────────────────────────────────────────────────────────────────────
test('6. setLocalOrder(nextItems) repinta sin esperar al server', () => {
  const { getByTestId } = render(<Probe />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
    { id: 'c', type: 'song', title: 'C' },
  ])
  // Reorder local: c-a-b
  act(() => {
    _captured.setLocalOrder([
      { id: 'c', type: 'song', title: 'C' },
      { id: 'a', type: 'song', title: 'A' },
      { id: 'b', type: 'song', title: 'B' },
    ])
  })
  expect(_captured.items.map((it) => it.id)).toEqual(['c', 'a', 'b'])
  expect(getByTestId('count').textContent).toBe('3')
})

// ──────────────────────────────────────────────────────────────────────
// 7. setLocalOrder(no-array) → no-op
// ──────────────────────────────────────────────────────────────────────
test('7. setLocalOrder(no-array) → no muta items', () => {
  const { getByTestId } = render(<Probe />)
  emit('schedule-update', [{ id: 'a', type: 'song', title: 'A' }])
  act(() => {
    _captured.setLocalOrder(null)
    _captured.setLocalOrder('string')
    _captured.setLocalOrder(42)
  })
  expect(getByTestId('count').textContent).toBe('1')
  expect(_captured.items[0].id).toBe('a')
})

// ──────────────────────────────────────────────────────────────────────
// 8. unmount llama unsubscribe (sin leaks)
// ──────────────────────────────────────────────────────────────────────
test('8. unmount → cleanup invoca unsubscribe', () => {
  const { unmount } = render(<Probe />)
  expect(mockUnsubscribes).toHaveLength(1)
  expect(mockUnsubscribes[0]).not.toHaveBeenCalled()
  unmount()
  expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1)
  // Set debe estar vacío después del unsubscribe.
  expect(mockSubscribers['schedule-update']?.size ?? 0).toBe(0)
})

// ──────────────────────────────────────────────────────────────────────
// 9. Update remoto posterior gana sobre setLocalOrder (server = single
//    source of truth) — escenario de optimistic reorder rechazado.
// ──────────────────────────────────────────────────────────────────────
test('9. schedule-update posterior sobreescribe el orden local optimista', () => {
  const { getByTestId } = render(<Probe />)
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
  ])
  // Reorder local: b-a
  act(() => {
    _captured.setLocalOrder([
      { id: 'b', type: 'song', title: 'B' },
      { id: 'a', type: 'song', title: 'A' },
    ])
  })
  expect(_captured.items.map((it) => it.id)).toEqual(['b', 'a'])
  // El server emite el orden "real": a-b. Debe prevalecer.
  emit('schedule-update', [
    { id: 'a', type: 'song', title: 'A' },
    { id: 'b', type: 'song', title: 'B' },
  ])
  expect(_captured.items.map((it) => it.id)).toEqual(['a', 'b'])
  expect(getByTestId('count').textContent).toBe('2')
})
