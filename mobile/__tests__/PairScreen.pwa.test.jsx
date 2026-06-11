/**
 * PairScreen.pwa.test.jsx
 *
 * Extiende la suite de PairScreen con los dos modos nuevos de T12:
 *   1. Banner cloud persistente cuando la PWA se sirve por https (Vercel):
 *      informativo, no error — desde https el navegador bloquea fetch http://
 *      a la LAN (mixed content) hasta el relay de T15.
 *   2. Modo same-origin (servida desde el desktop en /app): el campo URL se
 *      OCULTA y solo se pide el PIN (serverUrl = window.location.origin).
 *
 * Mocks idénticos a PairScreen.test.jsx (transport, QrScanner, router,
 * pairing). @capacitor/core va por moduleNameMapper (isNativePlatform=false:
 * el banner https NO debe aparecer en el WebView Android, que sirve desde
 * https://localhost).
 */
import { render, screen, fireEvent } from '@testing-library/react'

jest.mock('../src/services/transport.js', () => ({
  transport: {
    connect: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../src/components/QrScanner.jsx', () => ({
  __esModule: true,
  default: function MockQrScanner() {
    return null
  },
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

jest.mock('../src/services/pairing.js', () => {
  class PairingError extends Error {
    constructor(code, message, extra) {
      super(message)
      this.name = 'PairingError'
      this.code = code
      this.extra = extra
    }
  }
  return {
    __esModule: true,
    PairingError,
    pairWithDesktop: jest.fn(),
    probeServer: jest.fn(),
    checkServer: jest.fn(),
  }
})

import PairScreen from '../src/screens/PairScreen.jsx'
import * as urlHelpers from '../src/services/urlHelpers.js'

beforeEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
  try { window.sessionStorage.clear() } catch { /* ignore */ }
  try { window.localStorage.clear() } catch { /* ignore */ }
  try { window.localStorage.setItem('eclesia.firstPairSeen', '1') } catch { /* ignore */ }
})

function setLocation({
  hostname = '192.168.1.5',
  host,
  protocol = 'http:',
  port = '5173',
  pathname = '/',
} = {}) {
  const fullHost = host || (port ? `${hostname}:${port}` : hostname)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      hostname,
      host: fullHost,
      port,
      protocol,
      pathname,
      origin: `${protocol}//${fullHost}`,
    },
  })
}

function switchToManual() {
  fireEvent.click(screen.getByRole('button', { name: /manual/i }))
}

test('banner cloud visible con protocol https (Vercel) — informativo, menciona QR/Transmisión y T15', () => {
  setLocation({ hostname: 'm.eclesia.app', port: '', protocol: 'https:', pathname: '/' })
  render(<PairScreen />)

  expect(screen.getByText(/Estás en la versión web/i)).toBeTruthy()
  expect(screen.getByText(/panel Transmisión/i)).toBeTruthy()
  expect(screen.getByText(/T15/i)).toBeTruthy()
})

test('sin https (LAN http) el banner cloud NO aparece', () => {
  setLocation({ hostname: '192.168.1.5', port: '5173', protocol: 'http:' })
  render(<PairScreen />)

  expect(screen.queryByText(/Estás en la versión web/i)).toBeNull()
})

test('campo URL oculto en modo same-origin (servida desde el desktop /app): solo PIN', () => {
  setLocation({ hostname: '192.168.1.10', port: '3434', protocol: 'http:', pathname: '/app/' })
  jest.spyOn(urlHelpers, 'isServedFromDesktop').mockReturnValue(true)
  render(<PairScreen />)
  switchToManual()

  // El campo URL no se renderiza…
  expect(screen.queryByPlaceholderText(/<IP>:3434/i)).toBeNull()
  // …pero el PIN sí, junto con la nota de same-origin.
  expect(screen.getByPlaceholderText('123456')).toBeTruthy()
  expect(screen.getByText(/Solo necesitas el PIN/i)).toBeTruthy()
  expect(screen.getByText(/http:\/\/192\.168\.1\.10:3434/i)).toBeTruthy()
})
