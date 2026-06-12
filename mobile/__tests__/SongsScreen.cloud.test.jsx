/**
 * SongsScreen.cloud.test.jsx (C2)
 *
 * Modo "Mi nube" de SongsScreen: gating x4 estados de cuenta
 * (unconfigured/signedOut/free/pro), lista cloud, delete con
 * ConfirmModal, navegación a editor y flash del editor.
 *
 * El modo PC (T10) tiene su propia suite intacta en SongsScreen.test.jsx.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mock transport (igual que SongsScreen.test.jsx) ──
const mockSubscribers = {}
jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    send: jest.fn(() => true),
    disconnect: jest.fn(),
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
    BIBLE_REF: 'bible-ref', BIBLE_PROJECT_DIRECT: 'bible-project-direct',
    SONG: 'song', SONG_PROJECT_DIRECT: 'song-project-direct',
    ANNOUNCE: 'announce', PROJECTION_CLOSE: 'projection-close',
    LIST_REORDER: 'list-reorder', PING: 'ping',
  },
  ServerEvent: {
    PGM_UPDATE: 'pgm-update', SCHEDULE_UPDATE: 'schedule-update',
    CONNECTION_STATE: 'connection-state', PONG: 'pong',
    ERROR: 'error', AUTH_ERROR: 'auth-error',
    SONGS_LIST: 'songs-list', SONGS_CHANGED: 'songs-changed',
  },
}))

jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => ({ isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0 }),
}))

jest.mock('../src/hooks/useSongs.js', () => ({
  useSongs: () => ({
    query: '', setQuery: jest.fn(), status: 'idle', items: [], total: 0,
    hasMore: false, error: null, retry: jest.fn(), reset: jest.fn(),
    invalidate: jest.fn(), lastUpdatedAt: null,
  }),
}))

jest.mock('../src/hooks/useSong.js', () => ({
  useSong: () => ({ song: null, status: 'idle', error: null, retry: jest.fn() }),
}))

jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// ─── Mock cuenta (C1) ──
let mockAccountState = {
  status: 'signedOut', email: null, user: null, plan: null, isPro: false, error: null,
}
jest.mock('../src/hooks/useAccount.js', () => ({
  useAccount: () => mockAccountState,
}))

// ─── Mock biblioteca cloud ──
let mockCloudState = {
  search: '', setSearch: jest.fn(), status: 'loading', items: [], error: null, refetch: jest.fn(),
}
jest.mock('../src/hooks/useCloudSongs.js', () => ({
  useCloudSongs: () => mockCloudState,
}))

const mockRemove = jest.fn()
jest.mock('../src/services/cloudSongs.js', () => ({
  remove: (...args) => mockRemove(...args),
}))

import SongsScreen from '../src/screens/SongsScreen.jsx'
import { setFlash, consumeFlash } from '../src/services/flashMessage.js'

const CLOUD_ITEMS = [
  { id: 'a1', title: 'Sublime Gracia', author: 'John Newton', updated_at: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: 'b2', title: 'Santo Santo Santo', author: null, updated_at: new Date(Date.now() - 3 * 86400000).toISOString() },
]

function setAccount(status, { isPro = false, plan = null } = {}) {
  mockAccountState = { status, email: 'p@x.com', user: null, plan, isPro, error: null }
}

function goCloud() {
  fireEvent.click(screen.getByRole('radio', { name: 'Mi nube' }))
}

beforeEach(() => {
  for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
  jest.clearAllMocks()
  consumeFlash() // limpiar flashes de tests previos
  mockAccountState = { status: 'signedOut', email: null, user: null, plan: null, isPro: false, error: null }
  mockCloudState = {
    search: '', setSearch: jest.fn(), status: 'loading', items: [], error: null, refetch: jest.fn(),
  }
})

/* ============ Gating x4 estados ============ */

test('1. unconfigured: NO hay segmented — solo modo PC, como antes de C2', () => {
  setAccount('unconfigured')
  render(<SongsScreen />)
  expect(screen.queryByRole('radiogroup', { name: 'Origen de canciones' })).toBeNull()
  expect(screen.queryByText('Mi nube')).toBeNull()
  expect(screen.getByRole('searchbox')).toBeInTheDocument()  // modo PC intacto
})

test('2. signedOut: card "inicia sesión" con CTA a /account', () => {
  setAccount('signedOut')
  render(<SongsScreen />)
  goCloud()
  expect(screen.getByText('Inicia sesión para tus canciones en la nube')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la pantalla de cuenta' }))
  expect(mockNavigate).toHaveBeenCalledWith('/account')
})

test('3. free: card upsell con link externo a pricing (patrón AccountScreen)', () => {
  setAccount('signedIn', { isPro: false, plan: 'free' })
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
  render(<SongsScreen />)
  goCloud()
  expect(screen.getByText('Tus canciones en la nube con Pro')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver planes Pro en el navegador' }))
  expect(openSpy).toHaveBeenCalledWith(
    'https://eclesia-presenter.vercel.app/pricing', '_blank', 'noopener',
  )
  openSpy.mockRestore()
})

test('4. pro: lista cloud con título, autor y fecha relativa', () => {
  setAccount('signedIn', { isPro: true, plan: 'pro_monthly' })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  render(<SongsScreen />)
  goCloud()
  expect(screen.getByText('Sublime Gracia')).toBeInTheDocument()
  expect(screen.getByText(/John Newton · hace 5 min/)).toBeInTheDocument()
  expect(screen.getByText(/hace 3 días/)).toBeInTheDocument()
})

/* ============ Acciones del modo pro ============ */

test('5. "+ Nueva canción" navega al editor de creación', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  render(<SongsScreen />)
  goCloud()
  fireEvent.click(screen.getByRole('button', { name: 'Crear una canción nueva en la nube' }))
  expect(mockNavigate).toHaveBeenCalledWith('/songs/cloud/new')
})

test('6. tap en una canción navega a su editor', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  render(<SongsScreen />)
  goCloud()
  fireEvent.click(screen.getByRole('button', { name: 'Editar Sublime Gracia' }))
  expect(mockNavigate).toHaveBeenCalledWith('/songs/cloud/a1')
})

test('7. delete: ConfirmModal danger → confirmar llama remove + refetch + toast', async () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  mockRemove.mockResolvedValue({ ok: true })
  render(<SongsScreen />)
  goCloud()

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Sublime Gracia' }))
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toHaveTextContent('¿Eliminar esta canción?')

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  })
  expect(mockRemove).toHaveBeenCalledWith('a1')
  expect(mockCloudState.refetch).toHaveBeenCalled()
  expect(screen.getAllByText('Canción eliminada').length).toBeGreaterThan(0)
})

test('8. delete: cancelar cierra el modal sin llamar remove', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  render(<SongsScreen />)
  goCloud()

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Sublime Gracia' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mockRemove).not.toHaveBeenCalled()
})

test('9. delete con error → toast de error mapeado, sin refetch', async () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  mockRemove.mockResolvedValue({ ok: false, error: 'network' })
  render(<SongsScreen />)
  goCloud()

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Sublime Gracia' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  })
  expect(screen.getAllByText('Sin conexión a internet. Comprueba la red.').length).toBeGreaterThan(0)
  expect(mockCloudState.refetch).not.toHaveBeenCalled()
})

/* ============ Estados de la lista cloud ============ */

test('10. buscador cloud llama setSearch', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  render(<SongsScreen />)
  goCloud()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gracia' } })
  expect(mockCloudState.setSearch).toHaveBeenCalledWith('gracia')
})

test('11. empty sin búsqueda: mensaje + hint de crear', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'empty'
  render(<SongsScreen />)
  goCloud()
  expect(screen.getByText('Aún no tienes canciones en la nube')).toBeInTheDocument()
  expect(screen.getByText('Crea la primera con "+ Nueva canción"')).toBeInTheDocument()
})

test('12. error cloud: mensaje mapeado + Reintentar llama refetch', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'error'
  mockCloudState.error = { code: 'unauthorized' }
  render(<SongsScreen />)
  goCloud()
  expect(screen.getByText('Sesión caducada. Vuelve a iniciar sesión.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(mockCloudState.refetch).toHaveBeenCalled()
})

/* ============ Default + flash del editor ============ */

test('13. default es modo PC: el contenido cloud no se monta hasta elegir Mi nube', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  render(<SongsScreen />)
  expect(screen.getByRole('radio', { name: 'PC' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByText('Sublime Gracia')).toBeNull()
})

test('14. flash del editor: arranca en modo nube + toast de guardado', () => {
  setAccount('signedIn', { isPro: true })
  mockCloudState.status = 'results'
  mockCloudState.items = CLOUD_ITEMS
  setFlash('Canción guardada')
  render(<SongsScreen />)
  expect(screen.getByRole('radio', { name: 'Mi nube' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getAllByText('Canción guardada').length).toBeGreaterThan(0)
  expect(screen.getByText('Sublime Gracia')).toBeInTheDocument()
})
