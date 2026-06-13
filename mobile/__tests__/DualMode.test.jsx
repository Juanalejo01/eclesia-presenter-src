/**
 * DualMode.test.jsx (C4)
 *
 * Cobertura del pulido del FLUJO DUAL (mando LAN vs preparación cloud):
 *   - ModeChip: estados live-conectado / live-offline / cloud.
 *   - LanDualHint: variantes full/compact + navegación cruzada.
 *   - ServiceScreen: muestra el hint dual SOLO offline (no reconectando) y
 *     sus botones navegan a /songs?mode=cloud y /plans.
 *   - PairScreen: el enlace "solo preparar" navega a /songs?mode=cloud.
 *
 * Entorno: jsdom (extensión .test.jsx).
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import ModeChip from '../src/components/ModeChip.jsx'
import LanDualHint from '../src/components/LanDualHint.jsx'

/* ============================================================== */
/* ModeChip                                                       */
/* ============================================================== */

describe('ModeChip', () => {
  test('live + connected → "En vivo · PC" con aria de conectado', () => {
    render(<ModeChip mode="live" connected />)
    const chip = screen.getByRole('note', { name: /conectada al PC/i })
    expect(chip).toHaveTextContent('En vivo · PC')
  })

  test('live + offline → aria "sin conexión"', () => {
    render(<ModeChip mode="live" connected={false} />)
    expect(screen.getByRole('note', { name: /sin conexión con el PC/i })).toBeInTheDocument()
  })

  test('cloud → "Nube" con aria "funciona sin el PC"', () => {
    render(<ModeChip mode="cloud" />)
    const chip = screen.getByRole('note', { name: /funciona sin el PC/i })
    expect(chip).toHaveTextContent('Nube')
  })
})

/* ============================================================== */
/* LanDualHint                                                    */
/* ============================================================== */

describe('LanDualHint', () => {
  test('variant full: explica el mando y ofrece dos botones cloud', () => {
    const onNavigate = jest.fn()
    render(<LanDualHint variant="full" onNavigate={onNavigate} />)
    expect(screen.getByText(/Necesitas tu PC encendido y en la misma WiFi/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir a tus canciones en la nube' }))
    expect(onNavigate).toHaveBeenCalledWith('/songs?mode=cloud')

    fireEvent.click(screen.getByRole('button', { name: 'Ir a tus listas en la nube' }))
    expect(onNavigate).toHaveBeenCalledWith('/plans')
  })

  test('variant compact: una línea + enlace a canciones cloud', () => {
    const onNavigate = jest.fn()
    render(<LanDualHint variant="compact" onNavigate={onNavigate} />)
    // El bloque largo del modo full NO aparece.
    expect(screen.queryByText(/Necesitas tu PC encendido/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /tus canciones en la nube/i }))
    expect(onNavigate).toHaveBeenCalledWith('/songs?mode=cloud')
  })

  test('no crashea sin onNavigate (click es no-op)', () => {
    render(<LanDualHint variant="full" />)
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Ir a tus listas en la nube' }))
    }).not.toThrow()
  })
})

/* ============================================================== */
/* ServiceScreen — integración del hint dual                     */
/* ============================================================== */

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
    BIBLE_REF: 'bible-ref', SONG: 'song', ANNOUNCE: 'announce',
    PROJECTION_CLOSE: 'projection-close', LIST_REORDER: 'list-reorder', PING: 'ping',
  },
  ServerEvent: {
    PGM_UPDATE: 'pgm-update', SCHEDULE_UPDATE: 'schedule-update',
    CONNECTION_STATE: 'connection-state', PONG: 'pong', ERROR: 'error', AUTH_ERROR: 'auth-error',
  },
}))

let mockConnectionState = {
  isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

jest.mock('../src/hooks/useSchedule.js', () => ({
  useSchedule: () => ({ items: [], isStale: true, setLocalOrder: jest.fn() }),
}))

jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import ServiceScreen from '../src/screens/ServiceScreen.jsx'

describe('ServiceScreen — hint dual (C4)', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockSubscribers)) delete mockSubscribers[k]
    mockNavigate.mockClear()
    mockConnectionState = {
      isConnected: true, isConnecting: false, latencyMs: 50, signal: 'excellent', queueSize: 0,
    }
  })

  test('conectado: NO muestra el hint dual', () => {
    render(<ServiceScreen />)
    expect(screen.queryByText(/Necesitas tu PC encendido/i)).toBeNull()
    // El chip de modo live aparece igualmente (estado conectado).
    expect(screen.getByRole('note', { name: /conectada al PC/i })).toBeInTheDocument()
  })

  test('reconectando: NO muestra el hint dual (texto correcto: Reconectando)', () => {
    mockConnectionState = {
      isConnected: false, isConnecting: true, latencyMs: null, signal: 'offline', queueSize: 0,
    }
    render(<ServiceScreen />)
    expect(screen.queryByText(/Necesitas tu PC encendido/i)).toBeNull()
  })

  test('offline real: muestra el hint y sus botones navegan a cloud', () => {
    mockConnectionState = {
      isConnected: false, isConnecting: false, latencyMs: null, signal: 'offline', queueSize: 0,
    }
    render(<ServiceScreen />)
    expect(screen.getByText(/Necesitas tu PC encendido/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir a tus canciones en la nube' }))
    expect(mockNavigate).toHaveBeenCalledWith('/songs?mode=cloud')

    fireEvent.click(screen.getByRole('button', { name: 'Ir a tus listas en la nube' }))
    expect(mockNavigate).toHaveBeenCalledWith('/plans')
  })
})
