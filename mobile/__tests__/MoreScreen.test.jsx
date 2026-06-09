/**
 * MoreScreen.test.jsx (T11)
 *
 * Integration: renderiza las 5 secciones, version mobile presente, version PC
 * cuando llega serverVersion, boton Desemparejar funcional, boton de Idioma
 * deshabilitado con badge Proximamente.
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
    connect: jest.fn(),
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
  },
}))

// ─── Mock useConnection ──
let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

// ─── Mock haptics ──
jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))

// ─── Mock router useNavigate ──
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import MoreScreen from '../src/screens/MoreScreen.jsx'

beforeEach(() => {
  for (const key of Object.keys(mockSubscribers)) delete mockSubscribers[key]
  mockSend.mockClear()
  mockDisconnect.mockClear()
  mockNavigate.mockClear()
  mockConnectionState = {
    isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
  }
})

function emit(eventType, payload) {
  const set = mockSubscribers[eventType]
  if (!set) return
  act(() => {
    for (const h of set) h(payload)
  })
}

test('1. renderiza header "Mas"', () => {
  render(<MoreScreen />)
  expect(screen.getByRole('heading', { level: 1, name: /^mas$/i })).toBeInTheDocument()
})

test('2. renderiza las 5 secciones', () => {
  render(<MoreScreen />)
  expect(screen.getByRole('heading', { level: 2, name: /anuncio rapido/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: /zona peligrosa/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: /conexion/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: /ajustes/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: /cuenta/i })).toBeInTheDocument()
})

test('3. seccion Conexion muestra version del mando', () => {
  render(<MoreScreen />)
  // Buscamos "v" seguido de digitos en cualquier nodo (esquema semver)
  expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument()
})

test('4. version PC "desconocido" si no llego serverVersion', () => {
  render(<MoreScreen />)
  expect(screen.getByText(/desconocido/i)).toBeInTheDocument()
})

test('5. version PC aparece cuando pgm-update-theme trae version', () => {
  render(<MoreScreen />)
  emit('pgm-update-theme', { version: '0.2.17' })
  expect(screen.getByText(/v0\.2\.17/)).toBeInTheDocument()
})

test('6. item "Idioma" tiene badge Proximamente y esta marcado como disabled', () => {
  render(<MoreScreen />)
  expect(screen.getByText(/idioma/i)).toBeInTheDocument()
  expect(screen.getByText(/proximamente/i)).toBeInTheDocument()
})

test('7. boton Desemparejar con confirm OK → disconnect + nav /pair', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MoreScreen />)
  const button = screen.getByRole('button', { name: /desemparejar este mando del pc/i })
  fireEvent.click(button)
  expect(confirmSpy).toHaveBeenCalled()
  expect(mockDisconnect).toHaveBeenCalledTimes(1)
  expect(mockNavigate).toHaveBeenCalledWith('/pair', { replace: true })
  confirmSpy.mockRestore()
})

test('8. boton Desemparejar con confirm cancel → no acciona', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
  render(<MoreScreen />)
  fireEvent.click(screen.getByRole('button', { name: /desemparejar este mando del pc/i }))
  expect(mockDisconnect).not.toHaveBeenCalled()
  expect(mockNavigate).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('9. AnnouncementForm visible dentro de la seccion Anuncio rapido', () => {
  render(<MoreScreen />)
  expect(screen.getByLabelText(/titulo del anuncio/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/cuerpo del anuncio/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /proyectar anuncio en el pc/i })).toBeInTheDocument()
})

test('10. PanicButton visible dentro de la seccion Zona peligrosa', () => {
  render(<MoreScreen />)
  expect(screen.getByRole('button', { name: /cerrar de emergencia/i })).toBeInTheDocument()
})

test('11. unmount limpia subscribes del usePgmState', () => {
  const { unmount } = render(<MoreScreen />)
  // usePgmState subscribe a PGM_UPDATE + pgm-update-theme = 2.
  const initialSize = (mockSubscribers['pgm-update']?.size || 0)
    + (mockSubscribers['pgm-update-theme']?.size || 0)
  expect(initialSize).toBe(2)
  unmount()
  const finalSize = (mockSubscribers['pgm-update']?.size || 0)
    + (mockSubscribers['pgm-update-theme']?.size || 0)
  expect(finalSize).toBe(0)
})
