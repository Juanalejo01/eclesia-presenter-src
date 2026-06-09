/**
 * PanicButton.test.jsx (T11)
 *
 * Cubre el boton de panico (cerrar proyeccion del PC):
 *  - render con variante danger + icono
 *  - confirm cancelado NO envia
 *  - confirm aceptado envia PROJECTION_CLOSE
 *  - disabled si !isConnected
 *  - feedback "Cerrado" tras envio + reset tras timeout
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockSend = jest.fn(() => true)
jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    send: (...args) => mockSend(...args),
    disconnect: jest.fn(),
    subscribe: jest.fn(() => () => {}),
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

let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

const mockTapMedium = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: (...args) => mockTapMedium(...args),
}))

import PanicButton from '../src/components/PanicButton.jsx'

beforeEach(() => {
  mockSend.mockClear()
  mockTapMedium.mockClear()
  mockConnectionState = {
    isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
  }
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

test('1. render: boton danger con texto de emergencia', () => {
  render(<PanicButton />)
  const button = screen.getByRole('button', { name: /cerrar de emergencia/i })
  expect(button).toBeInTheDocument()
  expect(button).not.toBeDisabled()
  expect(button.textContent).toMatch(/cerrar proyecci/i)
})

test('2. click + confirm cancelado → NO envia', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
  render(<PanicButton />)
  fireEvent.click(screen.getByRole('button', { name: /cerrar de emergencia/i }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(mockSend).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('3. click + confirm OK → envia PROJECTION_CLOSE', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PanicButton />)
  fireEvent.click(screen.getByRole('button', { name: /cerrar de emergencia/i }))
  expect(confirmSpy).toHaveBeenCalled()
  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend).toHaveBeenCalledWith({ type: 'projection-close' })
  expect(mockTapMedium).toHaveBeenCalledTimes(1)
  confirmSpy.mockRestore()
})

test('4. disabled si !isConnected', () => {
  mockConnectionState = { isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0 }
  render(<PanicButton />)
  const button = screen.getByRole('button', { name: /cerrar de emergencia/i })
  expect(button).toBeDisabled()
  // Hint visible
  expect(screen.getByText(/sin conexion con el pc/i)).toBeInTheDocument()
  fireEvent.click(button)
  expect(mockSend).not.toHaveBeenCalled()
})

test('5. tras envio muestra "Cerrado" y vuelve a estado normal tras timeout', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PanicButton />)
  fireEvent.click(screen.getByRole('button', { name: /cerrar de emergencia/i }))
  // Phase 'closed' visible
  expect(screen.getByRole('button', { name: /cerrar de emergencia/i }).textContent).toMatch(/cerrado/i)
  // Avanzar 3s → vuelve al texto normal
  act(() => { jest.advanceTimersByTime(3001) })
  expect(screen.getByRole('button', { name: /cerrar de emergencia/i }).textContent).toMatch(/cerrar proyecci/i)
  confirmSpy.mockRestore()
})

test('6. doble-click rapido no envia 2 veces (modal confirm bloquea)', () => {
  // El window.confirm es sincrono. Si el user cancela el primero y luego
  // hace click otra vez tras un timeout, el segundo se procesa normal.
  // Aqui simulamos un user que confirma el primero → setea phase=closed →
  // el boton queda disabled hasta el timeout.
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PanicButton />)
  const button = screen.getByRole('button', { name: /cerrar de emergencia/i })
  fireEvent.click(button)
  fireEvent.click(button)  // disabled, no efecto
  expect(mockSend).toHaveBeenCalledTimes(1)
  confirmSpy.mockRestore()
})
