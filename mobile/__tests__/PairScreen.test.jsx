/**
 * PairScreen.test.jsx
 *
 * Tests del componente PairScreen — superficie crítica de UX donde el
 * usuario decide si pasa el primer minuto de la app o se rinde. Cubre:
 *
 *   1. Prefill desde window.location (mando servido por LAN)
 *   2. Warning ámbar inline cuando se teclea :5173 (puerto del navegador)
 *   3. Probe en onBlur muestra "✓ EclesiaPresenter vX encontrado"
 *   4. Error post-submit menciona :3434, NO menciona "WiFi"
 *
 * Mockeamos:
 *   - pairing.js entero (pairWithDesktop, probeServer)
 *   - transport.js (no debe llegar a conectar en estos tests)
 *   - QrScanner (no abrimos cámara real en jest)
 *   - react-router-dom useNavigate
 *
 * Entorno: jsdom (via "displayName": "jsdom" project en mobile/package.json)
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// Mocks ANTES del import del componente. Jest los hoist al top.
jest.mock('../src/services/transport.js', () => ({
  transport: {
    connect: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../src/components/QrScanner.jsx', () => ({
  __esModule: true,
  default: function MockQrScanner() {
    return null  // No renderizamos cámara real
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

// Después de los mocks, importamos el componente y los mocks tipados.
import PairScreen from '../src/screens/PairScreen.jsx'
import { pairWithDesktop, probeServer, PairingError } from '../src/services/pairing.js'

beforeEach(() => {
  jest.clearAllMocks()
  // Limpiamos storages entre tests.
  try { window.sessionStorage.clear() } catch { /* ignore */ }
  try { window.localStorage.clear() } catch { /* ignore */ }
  // Marcamos el banner first-run como visto para que no estorbe la mayoría
  // de los asserts. Los tests que lo quieran verificar lo borran antes.
  try { window.localStorage.setItem('eclesia.firstPairSeen', '1') } catch { /* ignore */ }
})

function setLocation({ hostname = '192.168.1.5', host, protocol = 'http:', port = '5173' } = {}) {
  // jsdom permite reasignar partes de window.location via defineProperty.
  const fullHost = host || `${hostname}:${port}`
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      hostname,
      host: fullHost,
      port,
      protocol,
      origin: `${protocol}//${fullHost}`,
    },
  })
}

// Helper: cambia a modo manual (los tests del input URL viven ahí).
function switchToManual() {
  const manualBtn = screen.getByRole('button', { name: /manual/i })
  fireEvent.click(manualBtn)
}

test('1. Prefill: window.location.hostname=192.168.1.5 → URL inicial http://192.168.1.5:3434', () => {
  setLocation({ hostname: '192.168.1.5' })
  render(<PairScreen />)
  switchToManual()
  const urlInput = screen.getByPlaceholderText(/<IP>:3434/i)
  expect(urlInput.value).toBe('http://192.168.1.5:3434')
})

test('2. Warning ámbar inline al teclear :5173 (puerto del navegador)', () => {
  setLocation({ hostname: '192.168.1.5', port: '5173' })
  render(<PairScreen />)
  switchToManual()
  const urlInput = screen.getByPlaceholderText(/<IP>:3434/i)
  // Limpiar y teclear la URL del propio navegador (host:port del mando)
  fireEvent.change(urlInput, { target: { value: 'http://192.168.1.5:5173' } })
  // El warning aparece inmediatamente (no requiere blur) gracias a detectPortIssue.
  expect(
    screen.getByText(/puerto es del mando|navegador/i),
  ).toBeTruthy()
})

test('3. Probe en onBlur → "✓ EclesiaPresenter v0.2.17 encontrado" en verde', async () => {
  setLocation({ hostname: '192.168.1.5' })
  probeServer.mockResolvedValueOnce({
    ok: true,
    app: 'EclesiaPresenter',
    version: '0.2.17',
    protocol: 1,
  })
  render(<PairScreen />)
  switchToManual()
  const urlInput = screen.getByPlaceholderText(/<IP>:3434/i)
  fireEvent.change(urlInput, { target: { value: 'http://192.168.1.10:3434' } })
  // Trigger del blur
  await act(async () => {
    fireEvent.blur(urlInput)
  })
  await waitFor(() => {
    expect(screen.getByText(/EclesiaPresenter v0\.2\.17 encontrado/i)).toBeTruthy()
  })
  expect(probeServer).toHaveBeenCalledWith('http://192.168.1.10:3434')
})

test('4. puerto_incorrecto del submit → mensaje menciona :3434, NO menciona "WiFi"', async () => {
  setLocation({ hostname: '192.168.1.5' })
  pairWithDesktop.mockRejectedValueOnce(
    new PairingError(
      'puerto_incorrecto',
      'Esa dirección responde con HTTP 404, no es EclesiaPresenter',
    ),
  )
  render(<PairScreen />)
  switchToManual()

  const urlInput = screen.getByPlaceholderText(/<IP>:3434/i)
  fireEvent.change(urlInput, { target: { value: 'http://192.168.1.10:9999' } })
  const pinInput = screen.getByPlaceholderText('123456')
  fireEvent.change(pinInput, { target: { value: '123456' } })

  const submitBtn = screen.getByRole('button', { name: /^emparejar$/i })
  await act(async () => {
    fireEvent.click(submitBtn)
  })

  // Buscamos el mensaje de error específico (no el chip "Detectado:" que
  // también contiene 3434). El texto literal contiene "(normalmente :3434)".
  await waitFor(() => {
    expect(screen.getByText(/normalmente :3434/i)).toBeTruthy()
  })
  // Crítico: el mapeo de puerto_incorrecto NO debe mencionar "WiFi".
  expect(screen.queryByText(/WiFi/i)).toBeNull()
})

test('5. Banner first-run se muestra cuando localStorage está vacío y se oculta al pulsar Entendido', () => {
  setLocation({ hostname: '192.168.1.5' })
  // Limpiar el flag que el beforeEach había puesto.
  window.localStorage.clear()
  render(<PairScreen />)
  // El banner debe estar visible al render: header + un item específico que
  // SOLO aparece dentro del banner (el "Abre EclesiaPresenter en el PC" del
  // paso 1; el texto "Ajustes → Transmisión" también lo usa el modo QR).
  expect(screen.getByText(/Cómo emparejar/i)).toBeTruthy()
  expect(screen.getByText(/Abre EclesiaPresenter en el PC/i)).toBeTruthy()
  // Dismiss — el botón tiene aria-label "Cerrar instrucciones" para SR.
  const dismissBtn = screen.getByRole('button', { name: /cerrar instrucciones/i })
  fireEvent.click(dismissBtn)
  expect(screen.queryByText(/Cómo emparejar/i)).toBeNull()
  expect(window.localStorage.getItem('eclesia.firstPairSeen')).toBe('1')
})
