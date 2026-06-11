/**
 * PanicButton.test.jsx (T11; PanicModal en T13)
 *
 * Cubre el boton de panico (cerrar proyeccion del PC):
 *  - render con variante danger + icono
 *  - tap abre PanicModal; cancelar NO envia y devuelve el foco al trigger
 *  - confirmar envia PROJECTION_CLOSE una vez + feedback "Cerrado"
 *  - disabled si !isConnected (modal ni se abre)
 *  - Escape cierra sin enviar
 *  - doble-click rapido en confirmar → 1 solo send
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

function getTrigger() {
  return screen.getByRole('button', { name: /cerrar de emergencia/i })
}

test('1. render: boton danger con texto de emergencia, sin modal', () => {
  render(<PanicButton />)
  const button = getTrigger()
  expect(button).toBeInTheDocument()
  expect(button).not.toBeDisabled()
  expect(button.textContent).toMatch(/cerrar proyecci/i)
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('2. tap abre el modal; Cancelar cierra, NO envia y restaura el foco al trigger', () => {
  render(<PanicButton />)
  fireEvent.click(getTrigger())
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(mockTapMedium).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mockSend).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(getTrigger())
})

test('3. tap + confirmar → envia PROJECTION_CLOSE una vez y cierra el modal', () => {
  render(<PanicButton />)
  fireEvent.click(getTrigger())
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar proyección' }))
  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend).toHaveBeenCalledWith({ type: 'projection-close' })
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('4. disabled si !isConnected: el modal no se abre y hay hint offline', () => {
  mockConnectionState = { isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0 }
  render(<PanicButton />)
  const button = getTrigger()
  expect(button).toBeDisabled()
  expect(screen.getByText(/sin conexion con el pc/i)).toBeInTheDocument()
  fireEvent.click(button)
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mockSend).not.toHaveBeenCalled()
})

test('5. tras confirmar muestra "Cerrado" y vuelve al estado normal tras 3s', () => {
  render(<PanicButton />)
  fireEvent.click(getTrigger())
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar proyección' }))
  expect(getTrigger().textContent).toMatch(/cerrado/i)
  expect(getTrigger()).toBeDisabled()
  act(() => { jest.advanceTimersByTime(3001) })
  expect(getTrigger().textContent).toMatch(/cerrar proyecci/i)
  expect(getTrigger()).not.toBeDisabled()
})

test('6. doble-click rapido en Confirmar no envia 2 veces (guard del modal)', () => {
  render(<PanicButton />)
  fireEvent.click(getTrigger())
  const confirm = screen.getByRole('button', { name: 'Cerrar proyección' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(mockSend).toHaveBeenCalledTimes(1)
})

test('7. Escape cierra el modal sin enviar', () => {
  render(<PanicButton />)
  fireEvent.click(getTrigger())
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mockSend).not.toHaveBeenCalled()
})
