/**
 * AnnouncementForm.test.jsx (T11)
 *
 * Cubre el formulario de anuncio rapido:
 *  - render de inputs + boton + contadores
 *  - typing actualiza el contador
 *  - submit deshabilitado si campos vacios o !isConnected
 *  - submit envia con payload trimmed
 *  - maxLength duro corta a 80/500
 *  - colapsa saltos de linea excesivos
 *  - status "Anuncio enviado" aparece tras submit y desaparece tras timeout
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mock transport ──
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

// ─── Mock useConnection ──
let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

// ─── Mock haptics ──
const mockTapMedium = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: (...args) => mockTapMedium(...args),
}))

import AnnouncementForm from '../src/components/AnnouncementForm.jsx'

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

test('1. render: inputs titulo + cuerpo + boton + contadores', () => {
  render(<AnnouncementForm />)
  expect(screen.getByLabelText(/titulo del anuncio/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/cuerpo del anuncio/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /proyectar anuncio en el pc/i })).toBeInTheDocument()
  expect(screen.getByText('0/80')).toBeInTheDocument()
  expect(screen.getByText('0/500')).toBeInTheDocument()
})

test('2. typing actualiza el contador', () => {
  render(<AnnouncementForm />)
  const titleInput = screen.getByLabelText(/titulo del anuncio/i)
  fireEvent.change(titleInput, { target: { value: 'Hola' } })
  expect(screen.getByText('4/80')).toBeInTheDocument()

  const bodyInput = screen.getByLabelText(/cuerpo del anuncio/i)
  fireEvent.change(bodyInput, { target: { value: 'Cuerpo mas largo' } })
  expect(screen.getByText('16/500')).toBeInTheDocument()
})

test('3. submit deshabilitado si title o body vacios', () => {
  render(<AnnouncementForm />)
  const button = screen.getByRole('button', { name: /proyectar anuncio en el pc/i })
  expect(button).toBeDisabled()

  // Solo title
  fireEvent.change(screen.getByLabelText(/titulo del anuncio/i), { target: { value: 'Aviso' } })
  expect(button).toBeDisabled()

  // Title + body
  fireEvent.change(screen.getByLabelText(/cuerpo del anuncio/i), { target: { value: 'Mensaje' } })
  expect(button).not.toBeDisabled()
})

test('4. submit deshabilitado si !isConnected', () => {
  mockConnectionState = { isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0 }
  render(<AnnouncementForm />)
  const button = screen.getByRole('button', { name: /proyectar anuncio en el pc/i })
  // Aunque haya texto, sin conexion no envia
  fireEvent.change(screen.getByLabelText(/titulo del anuncio/i), { target: { value: 'Aviso' } })
  fireEvent.change(screen.getByLabelText(/cuerpo del anuncio/i), { target: { value: 'Mensaje' } })
  expect(button).toBeDisabled()
  // Hint visible
  expect(screen.getByText(/sin conexion con el pc/i)).toBeInTheDocument()
})

test('5. submit envia ANNOUNCE con payload trimmed', () => {
  render(<AnnouncementForm />)
  fireEvent.change(screen.getByLabelText(/titulo del anuncio/i), { target: { value: '  AVISO  ' } })
  fireEvent.change(screen.getByLabelText(/cuerpo del anuncio/i), { target: { value: '  Hola mundo  ' } })
  fireEvent.click(screen.getByRole('button', { name: /proyectar anuncio en el pc/i }))

  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend).toHaveBeenCalledWith({
    type: 'announce',
    payload: { title: 'AVISO', body: 'Hola mundo' },
  })
  expect(mockTapMedium).toHaveBeenCalledTimes(1)
})

test('6. maxLength duro corta a 80 chars en title', () => {
  render(<AnnouncementForm />)
  const longTitle = 'a'.repeat(150)
  const titleInput = screen.getByLabelText(/titulo del anuncio/i)
  // El maxLength del input fuerza el corte en el DOM
  fireEvent.change(titleInput, { target: { value: longTitle.slice(0, 80) } })
  expect(titleInput.value.length).toBe(80)
  expect(screen.getByText('80/80')).toBeInTheDocument()
})

test('7. colapsa \\n\\n\\n+ a \\n\\n en el body al enviar', () => {
  render(<AnnouncementForm />)
  fireEvent.change(screen.getByLabelText(/titulo del anuncio/i), { target: { value: 'Aviso' } })
  // 5 saltos consecutivos
  fireEvent.change(screen.getByLabelText(/cuerpo del anuncio/i), { target: { value: 'Linea1\n\n\n\n\nLinea2' } })
  fireEvent.click(screen.getByRole('button', { name: /proyectar anuncio en el pc/i }))
  expect(mockSend).toHaveBeenCalledWith({
    type: 'announce',
    payload: { title: 'Aviso', body: 'Linea1\n\nLinea2' },
  })
})

test('8. status "Anuncio enviado" aparece tras submit y desaparece tras timeout', () => {
  render(<AnnouncementForm />)
  fireEvent.change(screen.getByLabelText(/titulo del anuncio/i), { target: { value: 'Aviso' } })
  fireEvent.change(screen.getByLabelText(/cuerpo del anuncio/i), { target: { value: 'Hola' } })
  fireEvent.click(screen.getByRole('button', { name: /proyectar anuncio en el pc/i }))

  expect(screen.getByText(/anuncio enviado/i)).toBeInTheDocument()
  // Form vacio tras envio
  expect(screen.getByLabelText(/titulo del anuncio/i).value).toBe('')
  expect(screen.getByLabelText(/cuerpo del anuncio/i).value).toBe('')
  // Avanzar 3s → status vuelve a idle
  act(() => { jest.advanceTimersByTime(3001) })
  expect(screen.queryByText(/anuncio enviado/i)).toBeNull()
})
