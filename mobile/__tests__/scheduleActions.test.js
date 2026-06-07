/**
 * scheduleActions.test.js
 *
 * Cobertura del routing por tipo de item → comando WS, más el envío de
 * list-reorder. Mockeamos `transport.send` + `tapLight` para verificar
 * que ambos se invocan con los argumentos esperados.
 *
 * Entorno: node (extensión .test.js, ver projects en package.json).
 */

// ─── Mock del transport ──────────────────────────────────────────────
const mockSend = jest.fn(() => true)
jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: { send: (...args) => mockSend(...args) },
  ClientCommand: {
    NEXT:                  'next',
    PREV:                  'prev',
    BLANK:                 'blank',
    BLACK:                 'black',
    CLEAR:                 'clear',
    BIBLE_REF:             'bible-ref',
    SONG:                  'song',
    ANNOUNCE:              'announce',
    PROJECTION_CLOSE:      'projection-close',
    LIST_REORDER:          'list-reorder',
    PROJECT_SCHEDULE_ITEM: 'project-schedule-item',
    PING:                  'ping',
  },
}))

// ─── Mock de haptics ─────────────────────────────────────────────────
const mockTapLight = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: (...args) => mockTapLight(...args),
  tapMedium: jest.fn(),
}))

// Después de TODOS los mocks, importamos el módulo.
const { projectItem, reorderItems } = require('../src/services/scheduleActions.js')

beforeEach(() => {
  mockSend.mockClear()
  mockTapLight.mockClear()
  mockSend.mockImplementation(() => true)
})

// ──────────────────────────────────────────────────────────────────────
// projectItem
// ──────────────────────────────────────────────────────────────────────

test('1. projectItem(song) → send con type "song" + payload {id} + tapLight', () => {
  const ok = projectItem({ id: 'abc', type: 'song', title: 'Cuán grande es Él' })
  expect(ok).toBe(true)
  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend).toHaveBeenCalledWith({ type: 'song', payload: { id: 'abc' } })
  expect(mockTapLight).toHaveBeenCalledTimes(1)
})

test('2. projectItem(bible) con .bible → send con type "bible-ref" + payload desestructurado', () => {
  const item = {
    id: 'b1',
    type: 'bible',
    title: 'Salmos 23:1',
    bible: { book: 'Salmos', chapter: 23, verse: 1, version: 'RVR1960' },
  }
  const ok = projectItem(item)
  expect(ok).toBe(true)
  expect(mockSend).toHaveBeenCalledWith({
    type: 'bible-ref',
    payload: { book: 'Salmos', chapter: 23, verse: 1, version: 'RVR1960' },
  })
  expect(mockTapLight).toHaveBeenCalledTimes(1)
})

test('3. projectItem(bible) SIN .bible → no send + devuelve false', () => {
  const ok = projectItem({ id: 'b2', type: 'bible', title: 'Salmos' })
  expect(ok).toBe(false)
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockTapLight).not.toHaveBeenCalled()
})

test('4. projectItem(image) → send con "project-schedule-item" + payload {id}', () => {
  const ok = projectItem({ id: 'img1', type: 'image', title: 'Fondo cruz' })
  expect(ok).toBe(true)
  expect(mockSend).toHaveBeenCalledWith({
    type: 'project-schedule-item',
    payload: { id: 'img1' },
  })
  expect(mockTapLight).toHaveBeenCalledTimes(1)
})

test('5. projectItem(video) → send con "project-schedule-item" + payload {id}', () => {
  const ok = projectItem({ id: 'v1', type: 'video', title: 'Intro' })
  expect(ok).toBe(true)
  expect(mockSend).toHaveBeenCalledWith({
    type: 'project-schedule-item',
    payload: { id: 'v1' },
  })
})

test('6. projectItem(announcement) → send con "project-schedule-item" + payload {id}', () => {
  const ok = projectItem({ id: 'ann1', type: 'announcement', title: 'Bienvenida' })
  expect(ok).toBe(true)
  expect(mockSend).toHaveBeenCalledWith({
    type: 'project-schedule-item',
    payload: { id: 'ann1' },
  })
})

test('7. projectItem(null|undefined|primitives) → false sin send', () => {
  expect(projectItem(null)).toBe(false)
  expect(projectItem(undefined)).toBe(false)
  expect(projectItem('string')).toBe(false)
  expect(projectItem(42)).toBe(false)
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockTapLight).not.toHaveBeenCalled()
})

test('8. projectItem(type desconocido) → false sin send', () => {
  const ok = projectItem({ id: 'x', type: 'pizza', title: 'Mozzarella' })
  expect(ok).toBe(false)
  expect(mockSend).not.toHaveBeenCalled()
})

test('9. projectItem cuando transport.send retorna false → no tapLight', () => {
  // Simula transport offline + cola llena: send devuelve false. El
  // contrato es que NO vibremos haptically si el comando no salió.
  mockSend.mockImplementation(() => false)
  const ok = projectItem({ id: 'abc', type: 'song', title: 'X' })
  expect(ok).toBe(false)
  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockTapLight).not.toHaveBeenCalled()
})

// ──────────────────────────────────────────────────────────────────────
// reorderItems
// ──────────────────────────────────────────────────────────────────────

test('10. reorderItems(["a","b","c"]) → send con "list-reorder" + payload {ids}', () => {
  const ok = reorderItems(['a', 'b', 'c'])
  expect(ok).toBe(true)
  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend).toHaveBeenCalledWith({
    type: 'list-reorder',
    payload: { ids: ['a', 'b', 'c'] },
  })
})

test('11. reorderItems([]) → false sin send', () => {
  expect(reorderItems([])).toBe(false)
  expect(mockSend).not.toHaveBeenCalled()
})

test('12. reorderItems(no-array) → false sin send', () => {
  expect(reorderItems(null)).toBe(false)
  expect(reorderItems(undefined)).toBe(false)
  expect(reorderItems('a,b,c')).toBe(false)
  expect(reorderItems({ 0: 'a' })).toBe(false)
  expect(mockSend).not.toHaveBeenCalled()
})
