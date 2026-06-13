/**
 * SongsScreen.test.jsx (T10)
 *
 * Mismo patron que BibleScreen.test.jsx: mocks de transport / useConnection
 * / useSongs / useSong / haptics / router. Validamos UX core.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mock transport ──
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
    SONG: 'song',
    SONG_PROJECT_DIRECT: 'song-project-direct',
    ANNOUNCE: 'announce',
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
    SONGS_LIST: 'songs-list',
    SONGS_CHANGED: 'songs-changed',
  },
}))

// ─── Mock useConnection ──
let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

// ─── Mock useSongs ──
let mockSongsState = {
  query: '',
  setQuery: jest.fn(),
  status: 'idle',
  items: [],
  total: 0,
  hasMore: false,
  error: null,
  retry: jest.fn(),
  reset: jest.fn(),
  invalidate: jest.fn(),
  lastUpdatedAt: null,
}
jest.mock('../src/hooks/useSongs.js', () => ({
  useSongs: () => mockSongsState,
}))

// ─── Mock useSong ──
let mockSongDetail = { song: null, status: 'idle', error: null, retry: jest.fn() }
jest.mock('../src/hooks/useSong.js', () => ({
  useSong: (id) => {
    if (!id) return { song: null, status: 'idle', error: null, retry: jest.fn() }
    return mockSongDetail
  },
}))

// ─── Mock haptics ──
const mockTapLight = jest.fn()
const mockTapMedium = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: (...args) => mockTapLight(...args),
  tapMedium: (...args) => mockTapMedium(...args),
}))

// ─── Mock router ──
const mockNavigate = jest.fn()
// useLocation añadido en C4: SongsScreen lee ?mode=cloud para deep-link.
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '' }),
}))

import SongsScreen from '../src/screens/SongsScreen.jsx'

beforeEach(() => {
  for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
  mockSend.mockClear()
  mockDisconnect.mockClear()
  mockTapLight.mockClear()
  mockTapMedium.mockClear()
  mockNavigate.mockClear()
  mockConnectionState = {
    isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
  }
  mockSongsState = {
    query: '', setQuery: jest.fn(), status: 'idle', items: [], total: 0, hasMore: false,
    error: null, retry: jest.fn(), reset: jest.fn(), invalidate: jest.fn(), lastUpdatedAt: null,
  }
  mockSongDetail = { song: null, status: 'loading', error: null, retry: jest.fn() }
})

test('1. render idle muestra header + SearchBar', () => {
  render(<SongsScreen />)
  expect(screen.getByRole('heading', { name: /Canciones/i })).toBeInTheDocument()
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
})

test('2. typing en input llama setQuery', () => {
  render(<SongsScreen />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cuan' } })
  expect(mockSongsState.setQuery).toHaveBeenCalledWith('cuan')
})

test('3. status=results renderiza items', () => {
  mockSongsState.status = 'results'
  mockSongsState.items = [
    { id: 1, title: 'Cuán Grande Es Él', author: 'Hine', tags: 'Himno', sectionsCount: 2 },
  ]
  mockSongsState.total = 1
  render(<SongsScreen />)
  expect(screen.getByText(/Cuán Grande/)).toBeInTheDocument()
})

test('4. tap row abre sheet con haptic light', () => {
  mockSongsState.status = 'results'
  mockSongsState.items = [{ id: 1, title: 'Cuán Grande Es Él', author: 'Hine', sectionsCount: 2 }]
  mockSongDetail = {
    song: { id: 1, title: 'Cuán Grande Es Él', author: 'Hine', sections: [
      { sectionId: 's_0', label: 'Estrofa 1', text: 'Señor mi Dios' },
      { sectionId: 's_1', label: 'Coro', text: 'Mi corazón' },
    ]},
    status: 'ready', error: null, retry: jest.fn(),
  }
  render(<SongsScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Canción Cuán Grande/i }))
  expect(mockTapLight).toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('5. tap section envía SONG_PROJECT_DIRECT con payload correcto', () => {
  mockSongsState.status = 'results'
  mockSongsState.items = [{ id: 1, title: 'Cuán Grande', author: 'Hine', sectionsCount: 2 }]
  mockSongDetail = {
    song: { id: 1, title: 'Cuán Grande', author: 'Hine', sections: [
      { sectionId: 's_0', label: 'Estrofa 1', text: 'Señor mi Dios' },
      { sectionId: 's_1', label: 'Coro', text: 'Mi corazón canta' },
    ]},
    status: 'ready', error: null, retry: jest.fn(),
  }
  render(<SongsScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Canción Cuán Grande/i }))
  fireEvent.click(screen.getByRole('button', { name: /Proyectar sección Coro/i }))
  expect(mockTapMedium).toHaveBeenCalled()
  expect(mockSend).toHaveBeenCalledWith({
    type: 'song-project-direct',
    payload: {
      songId: 1,
      sectionId: 's_1',
      text: 'Mi corazón canta',
      reference: 'Cuán Grande · Coro',
    },
  })
})

test('6. status=error rate_limited muestra mensaje y boton Reintentar', () => {
  mockSongsState.status = 'error'
  mockSongsState.error = { code: 'rate_limited', retryAfterMs: 30000 }
  render(<SongsScreen />)
  expect(screen.getAllByText(/Demasiadas búsquedas/i).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }))
  expect(mockSongsState.retry).toHaveBeenCalled()
})

test('7. AUTH_ERROR del hook → disconnect + nav /pair', () => {
  mockSongsState.status = 'error'
  mockSongsState.error = { code: 'auth_error' }
  render(<SongsScreen />)
  expect(mockDisconnect).toHaveBeenCalled()
  expect(mockNavigate).toHaveBeenCalledWith('/pair', { replace: true })
})

test('8. AUTH_ERROR del transport → disconnect + nav', () => {
  render(<SongsScreen />)
  act(() => {
    const set = mockSubscribers['auth-error']
    set && set.forEach(h => h({ code: 4001 }))
  })
  expect(mockDisconnect).toHaveBeenCalled()
  expect(mockNavigate).toHaveBeenCalledWith('/pair', { replace: true })
})

test('9. !isConnected → input disabled + banner offline', () => {
  mockConnectionState = { isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0 }
  render(<SongsScreen />)
  expect(screen.getByRole('searchbox')).toBeDisabled()
  expect(screen.getAllByText(/Sin conexión con el PC/i).length).toBeGreaterThan(0)
})

test('10. empty-catalog state', () => {
  mockSongsState.status = 'empty-catalog'
  render(<SongsScreen />)
  expect(screen.getByText(/No hay canciones en el repertorio/i)).toBeInTheDocument()
})

test('11. empty (con query) state', () => {
  mockSongsState.status = 'empty'
  render(<SongsScreen />)
  expect(screen.getByText(/No encontramos coincidencias/i)).toBeInTheDocument()
})

test('12. Esc cierra el sheet', () => {
  mockSongsState.status = 'results'
  mockSongsState.items = [{ id: 1, title: 'A', sectionsCount: 1 }]
  mockSongDetail = {
    song: { id: 1, title: 'A', sections: [{ sectionId: 's_0', label: 'X', text: 'y' }] },
    status: 'ready', error: null, retry: jest.fn(),
  }
  render(<SongsScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Canción A/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('13. PGM_UPDATE con type:song matcheando seleccion muestra EN VIVO', () => {
  mockSongsState.status = 'results'
  mockSongsState.items = [{ id: 7, title: 'Hit', sectionsCount: 1 }]
  mockSongDetail = {
    song: { id: 7, title: 'Hit', sections: [
      { sectionId: 's_0', label: 'Coro', text: 'X' },
    ]},
    status: 'ready', error: null, retry: jest.fn(),
  }
  render(<SongsScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Canción Hit/i }))
  // Disparar PGM_UPDATE matcheando.
  act(() => {
    const set = mockSubscribers['pgm-update']
    set && set.forEach(h => h({ type: 'song', text: 'X', reference: 'Hit', meta: { songId: 7, sectionId: 's_0' } }))
  })
  // Exact 'EN VIVO' (badge live de la sección). El ModeChip de C4 dice
  // "En vivo · PC" y matchearía /EN VIVO/i — por eso afirmamos el texto
  // exacto del badge en mayúsculas para no colisionar.
  expect(screen.getByText('EN VIVO')).toBeInTheDocument()
})

test('14. status=loading muestra skeleton + subtitle', () => {
  mockSongsState.status = 'loading'
  render(<SongsScreen />)
  expect(screen.getByText(/Buscando…/i)).toBeInTheDocument()
})

test('15. (C4) modo PC offline real: cross-link cloud cambia a "Mi nube"', () => {
  // useAccount real → default signedOut → cloud disponible (segmented presente).
  mockConnectionState = {
    isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0,
  }
  render(<SongsScreen />)
  // El segmented arranca en PC.
  expect(screen.getByRole('radio', { name: 'PC' })).toHaveAttribute('aria-checked', 'true')
  // El cross-link compacto está presente y al pulsarlo salta a Mi nube
  // (sin navegar a otra ruta).
  fireEvent.click(screen.getByRole('button', { name: /tus canciones en la nube/i }))
  expect(mockNavigate).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: 'Mi nube' })).toHaveAttribute('aria-checked', 'true')
})

test('16. (C4) modo PC reconectando: NO muestra el cross-link cloud', () => {
  mockConnectionState = {
    isConnected: false, isConnecting: true, latencyMs: null, signal: 'offline', queueSize: 0,
  }
  render(<SongsScreen />)
  expect(screen.queryByRole('button', { name: /tus canciones en la nube/i })).toBeNull()
})
