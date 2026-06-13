/**
 * screens.i18n-en.smoke.test.jsx (T13)
 *
 * Smoke por pantalla con locale 'en':
 *   1. NINGUN text node visible parece una key cruda (/^[a-z]+\.[a-zA-Z.]+$/)
 *      — atrapa strings que alguien olvido anadir al dict.
 *   2. Al menos un string EN esperado esta presente — atrapa pantallas
 *      que quedaron fuera del refactor (renderizando ES hardcodeado).
 *
 * Los textos de BibleQuickChips quedan en ES literal a proposito (son
 * queries del resolver RVR1960 del server) — no disparan el regex porque
 * empiezan con mayuscula/numero.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

// ─── Mock transport ──
const mockSubscribers = {}
const mockSend = jest.fn(() => true)
jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    send: (...args) => mockSend(...args),
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

// ─── Mock useConnection ──
let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

// ─── Mock hooks de datos ──
jest.mock('../src/hooks/useBibleSearch.js', () => ({
  useBibleSearch: () => ({
    query: '', setQuery: jest.fn(), status: 'idle', results: [], mode: null,
    error: null, retry: jest.fn(), reset: jest.fn(),
  }),
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
jest.mock('../src/hooks/useSchedule.js', () => ({
  useSchedule: () => ({ items: [], isStale: true, setLocalOrder: jest.fn() }),
}))

// ─── Mock haptics / router / QrScanner ──
jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '' }),
}))
jest.mock('../src/components/QrScanner.jsx', () => ({
  __esModule: true,
  default: () => null,
}))

import ServiceScreen from '../src/screens/ServiceScreen.jsx'
import BibleScreen from '../src/screens/BibleScreen.jsx'
import SongsScreen from '../src/screens/SongsScreen.jsx'
import MoreScreen from '../src/screens/MoreScreen.jsx'
import PairScreen from '../src/screens/PairScreen.jsx'
import { setLocale } from '../src/services/i18n.js'

// Regex de key cruda: 'service.title', 'bible.errMsg.unknown', etc.
const RAW_KEY_RE = /^[a-z]+\.[a-zA-Z.]+$/

function findRawKeyTextNodes(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const offenders = []
  let node
  while ((node = walker.nextNode())) {
    const txt = node.textContent.trim()
    if (txt && RAW_KEY_RE.test(txt)) offenders.push(txt)
  }
  return offenders
}

beforeEach(() => {
  for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
  mockNavigate.mockClear()
  mockSend.mockClear()
  window.localStorage.clear()
  mockConnectionState = {
    isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
  }
  setLocale('en', { persist: false })
})

afterEach(() => {
  setLocale('es', { persist: false })
})

test('ServiceScreen en EN: sin keys crudas + strings EN presentes', () => {
  const { container } = render(<ServiceScreen />)
  expect(findRawKeyTextNodes(container)).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'Service' })).toBeInTheDocument()
  expect(screen.getByText('Remote connected')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous slide' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Project black screen' })).toBeInTheDocument()
  expect(screen.getByText('Loading service list...')).toBeInTheDocument()
})

test('BibleScreen en EN: sin keys crudas + strings EN presentes', () => {
  const { container } = render(<BibleScreen />)
  expect(findRawKeyTextNodes(container)).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'Bible' })).toBeInTheDocument()
  expect(screen.getByText('Search and project verses')).toBeInTheDocument()
  expect(screen.getByText('Type a reference or keywords')).toBeInTheDocument()
  // Los chips siguen en ES literal (queries del server) — documentado.
  expect(screen.getByText('Juan 3:16')).toBeInTheDocument()
})

test('SongsScreen en EN: sin keys crudas + strings EN presentes', () => {
  const { container } = render(<SongsScreen />)
  expect(findRawKeyTextNodes(container)).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument()
  expect(screen.getByText('Songbook · Search and project')).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Search song' })).toBeInTheDocument()
})

test('MoreScreen en EN: sin keys crudas + LanguageSwitcher visible', () => {
  const { container } = render(<MoreScreen />)
  expect(findRawKeyTextNodes(container)).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'More' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Quick announcement' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Project announcement on the PC' })).toBeInTheDocument()
  // LanguageSwitcher montado, con EN activo en este render.
  expect(screen.getByRole('radiogroup', { name: 'Select language' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('button', { name: 'Unpair this remote from the PC' })).toBeInTheDocument()
})

test('PairScreen en EN: sin keys crudas + banner first-run y form manual en EN', () => {
  const { container } = render(<PairScreen />)
  expect(findRawKeyTextNodes(container)).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'Pair' })).toBeInTheDocument()
  // Banner first-run (localStorage limpio).
  expect(screen.getByText('How to pair')).toBeInTheDocument()
  expect(screen.getByText('Open EclesiaPresenter on the PC')).toBeInTheDocument()
  // Cambiar a modo manual → labels del form en EN.
  fireEvent.click(screen.getByRole('button', { name: 'Manual' }))
  expect(findRawKeyTextNodes(container)).toEqual([])
  expect(screen.getByText('PC address')).toBeInTheDocument()
  expect(screen.getByText('6-digit PIN')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pair' })).toBeInTheDocument()
})
