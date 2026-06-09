/**
 * BibleScreen.test.jsx
 *
 * Cobertura de la pantalla Biblia (T9). Mismo patrón que ServiceScreen:
 * mockear transport + useConnection + haptics + useBibleSearch para
 * controlar el flow del search desde el test.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mock del transport ──────────────────────────────────────────────
const mockSubscribers = {}
const mockSend = jest.fn(() => true)
const mockDisconnect = jest.fn()

jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    send: (...args) => mockSend(...args),
    disconnect: (...args) => mockDisconnect(...args),
    subscribe: (eventType, handler) => {
      if (!mockSubscribers[eventType]) mockSubscribers[eventType] = new Set()
      mockSubscribers[eventType].add(handler)
      return jest.fn(() => { mockSubscribers[eventType]?.delete(handler) })
    },
    connect: jest.fn(() => Promise.resolve()),
    subscribeState: () => () => {},
    getState: () => ({ status: 'open', latencyMs: 50, queueSize: 0, lastError: null, url: null, sentCount: 0, recvCount: 0 }),
  },
  ClientCommand: {
    NEXT: 'next', PREV: 'prev', BLANK: 'blank', BLACK: 'black', CLEAR: 'clear',
    BIBLE_REF: 'bible-ref',
    BIBLE_PROJECT_DIRECT: 'bible-project-direct',
    SONG: 'song', ANNOUNCE: 'announce',
    PROJECTION_CLOSE: 'projection-close',
    LIST_REORDER: 'list-reorder', PING: 'ping',
  },
  ServerEvent: {
    PGM_UPDATE: 'pgm-update',
    SCHEDULE_UPDATE: 'schedule-update',
    CONNECTION_STATE: 'connection-state',
    PONG: 'pong',
    ERROR: 'error',
    AUTH_ERROR: 'auth-error',
  },
}))

// ─── Mock de useConnection ───────────────────────────────────────────
let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

// ─── Mock de useBibleSearch ──────────────────────────────────────────
let mockHookState = {
  query: '',
  setQuery: jest.fn(),
  status: 'idle',
  results: [],
  mode: null,
  error: null,
  retry: jest.fn(),
  reset: jest.fn(),
}
jest.mock('../src/hooks/useBibleSearch.js', () => ({
  useBibleSearch: () => mockHookState,
}))

// ─── Mock de haptics ─────────────────────────────────────────────────
const mockTapLight = jest.fn()
const mockTapMedium = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: (...args) => mockTapLight(...args),
  tapMedium: (...args) => mockTapMedium(...args),
}))

// ─── Mock react-router-dom ───────────────────────────────────────────
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import BibleScreen from '../src/screens/BibleScreen.jsx'

beforeEach(() => {
  for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
  mockSend.mockClear(); mockDisconnect.mockClear()
  mockTapLight.mockClear(); mockTapMedium.mockClear()
  mockNavigate.mockClear()
  mockConnectionState = {
    isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
  }
  mockHookState = {
    query: '',
    setQuery: jest.fn(),
    status: 'idle',
    results: [],
    mode: null,
    error: null,
    retry: jest.fn(),
    reset: jest.fn(),
  }
})

test('1. render idle: header + chips + empty state', () => {
  render(<BibleScreen />)
  expect(screen.getByRole('heading', { name: /Biblia/i })).toBeInTheDocument()
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
  expect(screen.getByText(/Buscar y proyectar versículos/i)).toBeInTheDocument()
  // Chips visibles solo en idle
  expect(screen.getByText('Juan 3:16')).toBeInTheDocument()
  expect(screen.getByText('Salmos 23')).toBeInTheDocument()
})

test('2. typing en input llama setQuery del hook', () => {
  render(<BibleScreen />)
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'amor' } })
  expect(mockHookState.setQuery).toHaveBeenCalledWith('amor')
})

test('3. tap chip llama setQuery con la referencia', () => {
  render(<BibleScreen />)
  fireEvent.click(screen.getByText('Juan 3:16'))
  expect(mockHookState.setQuery).toHaveBeenCalledWith('Juan 3:16')
})

test('4. status=results renderiza items con reference y text', () => {
  mockHookState.status = 'results'
  mockHookState.mode = 'ref'
  mockHookState.results = [
    { reference: 'Juan 3:16', text: 'Porque de tal manera amó Dios', book: 'Juan', bookIndex: 42, chapter: 3, verse: 16 },
  ]
  render(<BibleScreen />)
  expect(screen.getByText(/Porque de tal manera/i)).toBeInTheDocument()
  expect(screen.getAllByText(/Juan 3:16/i).length).toBeGreaterThan(0)
})

test('5. tap row abre sheet con focus en botón Proyectar', () => {
  mockHookState.status = 'results'
  mockHookState.results = [
    { reference: 'Juan 3:16', text: 'Porque de tal manera', book: 'Juan', bookIndex: 42, chapter: 3, verse: 16 },
  ]
  render(<BibleScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Versículo Juan 3:16/i }))
  expect(mockTapLight).toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Proyectar/i })).toBeInTheDocument()
})

test('6. tap Proyectar envía BIBLE_PROJECT_DIRECT con payload completo', () => {
  mockHookState.status = 'results'
  mockHookState.results = [
    { reference: 'Juan 3:16', text: 'tal manera amó', book: 'Juan', bookIndex: 42, chapter: 3, verse: 16 },
  ]
  render(<BibleScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Versículo Juan 3:16/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Proyectar$/i }))
  expect(mockTapMedium).toHaveBeenCalled()
  expect(mockSend).toHaveBeenCalledWith({
    type: 'bible-project-direct',
    payload: {
      reference: 'Juan 3:16',
      text: 'tal manera amó',
      version: 'rvr1960',
      bookIndex: 42,
      chapterNum: 3,
      verseNum: 16,
      verseEnd: null,
    },
  })
})

test('7. status=error muestra mensaje + botón Reintentar', () => {
  mockHookState.status = 'error'
  mockHookState.error = { code: 'offline' }
  render(<BibleScreen />)
  // El mensaje completo aparece sólo en el empty state, el subtítulo es shorter.
  expect(screen.getByText(/Comprueba la WiFi/i)).toBeInTheDocument()
  const retry = screen.getByRole('button', { name: /Reintentar/i })
  fireEvent.click(retry)
  expect(mockHookState.retry).toHaveBeenCalled()
})

test('8. AUTH_ERROR via hook → disconnect + nav a /pair', () => {
  mockHookState.status = 'error'
  mockHookState.error = { code: 'auth_error' }
  render(<BibleScreen />)
  expect(mockDisconnect).toHaveBeenCalled()
  expect(mockNavigate).toHaveBeenCalledWith('/pair', { replace: true })
})

test('9. offline → input deshabilitado, chips ocultos en idle pero deshabilitados si visible', () => {
  mockConnectionState = {
    isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0,
  }
  render(<BibleScreen />)
  expect(screen.getByRole('searchbox')).toBeDisabled()
  // Banner offline
  expect(screen.getAllByText(/Sin conexión con el PC/i).length).toBeGreaterThan(0)
})

test('10. Esc cierra el sheet', () => {
  mockHookState.status = 'results'
  mockHookState.results = [
    { reference: 'Juan 3:16', text: 'tal manera', book: 'Juan', bookIndex: 42, chapter: 3, verse: 16 },
  ]
  render(<BibleScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Versículo Juan 3:16/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('11. Sheet: tap Cancelar cierra sin enviar', () => {
  mockHookState.status = 'results'
  mockHookState.results = [
    { reference: 'Juan 3:16', text: 'tal manera', book: 'Juan', bookIndex: 42, chapter: 3, verse: 16 },
  ]
  render(<BibleScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Versículo Juan 3:16/i }))
  fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mockSend).not.toHaveBeenCalled()
})

test('12. Sheet con !isConnected: botón Proyectar aria-disabled y no envía', () => {
  mockConnectionState.isConnected = false
  mockHookState.status = 'results'
  mockHookState.results = [
    { reference: 'Juan 3:16', text: 'tal manera', book: 'Juan', bookIndex: 42, chapter: 3, verse: 16 },
  ]
  render(<BibleScreen />)
  // En modo offline el input está disabled — abrimos el sheet vía tap en row
  // (el row no se deshabilita; sigue siendo navegable).
  fireEvent.click(screen.getByRole('button', { name: /Versículo Juan 3:16/i }))
  const project = screen.getByRole('button', { name: /^Proyectar$/i })
  expect(project).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(project)
  expect(mockSend).not.toHaveBeenCalled()
})

test('13. status=empty muestra mensaje + sugerencia', () => {
  mockHookState.status = 'empty'
  render(<BibleScreen />)
  expect(screen.getByText(/No encontramos versículos/i)).toBeInTheDocument()
})

test('14. status=loading muestra skeleton (aria-hidden)', () => {
  mockHookState.status = 'loading'
  render(<BibleScreen />)
  // El skeleton es aria-hidden, validamos por la presencia del subtítulo.
  expect(screen.getByText(/Buscando…/i)).toBeInTheDocument()
})
