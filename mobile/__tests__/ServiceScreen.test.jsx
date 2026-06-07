/**
 * ServiceScreen.test.jsx
 *
 * Cobertura del componente ServiceScreen. La idea es no levantar un
 * WebSocket real (eso ya lo cubren los tests del transport), sino
 * mockear `transport` para registrar:
 *
 *   - qué eventos subscribe el componente (PGM_UPDATE, pgm-update-theme,
 *     AUTH_ERROR) y exponer los handlers para dispararlos manualmente.
 *   - qué comandos envía con `send` cuando se hace click en cada botón.
 *
 * Y mockeamos:
 *   - useConnection() para alternar isConnected/isConnecting.
 *   - haptics tapLight/tapMedium para verificar que se llaman.
 *   - react-router-dom useNavigate para asserts de navegación.
 *
 * Entorno: jsdom (por extensión .test.jsx, ver projects en package.json).
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mock del transport ──────────────────────────────────────────────
// Guardamos los handlers subscritos por tipo para poder dispararlos
// luego desde el test (simulando un mensaje del server). Jest exige
// que las vars usadas dentro de jest.mock se llamen con prefijo `mock`.
const mockSubscribers = {}
const mockSend = jest.fn(() => true)
const mockDisconnect = jest.fn()

jest.mock('../src/services/transport.js', () => {
  return {
    __esModule: true,
    transport: {
      send: (...args) => mockSend(...args),
      disconnect: (...args) => mockDisconnect(...args),
      subscribe: (eventType, handler) => {
        if (!mockSubscribers[eventType]) mockSubscribers[eventType] = new Set()
        mockSubscribers[eventType].add(handler)
        return () => {
          mockSubscribers[eventType]?.delete(handler)
        }
      },
      // No-ops para no romper si algo los toca.
      connect: jest.fn(() => Promise.resolve()),
      subscribeState: () => () => {},
      getState: () => ({
        status: 'open',
        latencyMs: 50,
        queueSize: 0,
        lastError: null,
        url: null,
        sentCount: 0,
        recvCount: 0,
      }),
    },
    ClientCommand: {
      NEXT: 'next',
      PREV: 'prev',
      BLANK: 'blank',
      BLACK: 'black',
      CLEAR: 'clear',
      BIBLE_REF: 'bible-ref',
      SONG: 'song',
      ANNOUNCE: 'announce',
      PROJECTION_CLOSE: 'projection-close',
      LIST_REORDER: 'list-reorder',
      PING: 'ping',
    },
    ServerEvent: {
      PGM_UPDATE: 'pgm-update',
      SCHEDULE_UPDATE: 'schedule-update',
      CONNECTION_STATE: 'connection-state',
      PONG: 'pong',
      ERROR: 'error',
      AUTH_ERROR: 'auth-error',
    },
  }
})

// ─── Mock de useConnection ───────────────────────────────────────────
// Mismo motivo: prefijo `mock` para pasar el guard de jest.mock.
let mockConnectionState = {
  isConnected: true,
  isConnecting: false,
  latencyMs: 50,
  signal: 'excellent',
  queueSize: 0,
}
jest.mock('../src/hooks/useConnection.js', () => ({
  useConnection: () => mockConnectionState,
}))

// ─── Mock de haptics ─────────────────────────────────────────────────
const mockTapLight = jest.fn()
const mockTapMedium = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: (...args) => mockTapLight(...args),
  tapMedium: (...args) => mockTapMedium(...args),
}))

// ─── Mock de react-router-dom useNavigate ────────────────────────────
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// Después de TODOS los mocks, importamos el componente.
import ServiceScreen from '../src/screens/ServiceScreen.jsx'

beforeEach(() => {
  // Limpiar subscribers y mocks entre tests.
  for (const key of Object.keys(mockSubscribers)) {
    delete mockSubscribers[key]
  }
  mockSend.mockClear()
  mockDisconnect.mockClear()
  mockTapLight.mockClear()
  mockTapMedium.mockClear()
  mockNavigate.mockClear()
  // Reset connection a "conectado" por defecto.
  mockConnectionState = {
    isConnected: true,
    isConnecting: false,
    latencyMs: 50,
    signal: 'excellent',
    queueSize: 0,
  }
})

// Helper: dispara un evento del server llamando a todos los handlers
// suscritos. `act()` envuelve las actualizaciones de state para que
// React no llore en la consola.
function emit(eventType, payload) {
  const set = mockSubscribers[eventType]
  if (!set) return
  act(() => {
    for (const h of set) h(payload)
  })
}

// ──────────────────────────────────────────────────────────────────────
// 1. Prev/Next deshabilitados cuando NO está conectado
// ──────────────────────────────────────────────────────────────────────
test('1. Prev/Next disabled cuando no está conectado', () => {
  mockConnectionState = {
    isConnected: false,
    isConnecting: false,
    latencyMs: null,
    signal: 'offline',
    queueSize: 0,
  }
  render(<ServiceScreen />)
  const prev = screen.getByRole('button', { name: /slide anterior/i })
  const next = screen.getByRole('button', { name: /slide siguiente/i })
  expect(prev).toBeDisabled()
  expect(next).toBeDisabled()
  // "Sin conexión con el PC" aparece en el subtítulo del header y en el
  // banner debajo del preview — getAllByText confirma >=1 ocurrencia.
  expect(screen.getAllByText(/Sin conexión con el PC/i).length).toBeGreaterThan(0)
})

// ──────────────────────────────────────────────────────────────────────
// 2. Prev/Next envían comandos y disparan tapLight cuando conectado
// ──────────────────────────────────────────────────────────────────────
test('2. Prev/Next OPEN → send + tapLight', () => {
  render(<ServiceScreen />)
  const prev = screen.getByRole('button', { name: /slide anterior/i })
  const next = screen.getByRole('button', { name: /slide siguiente/i })
  expect(prev).not.toBeDisabled()
  expect(next).not.toBeDisabled()

  fireEvent.click(prev)
  fireEvent.click(next)

  expect(mockSend).toHaveBeenCalledTimes(2)
  expect(mockSend).toHaveBeenNthCalledWith(1, { type: 'prev' })
  expect(mockSend).toHaveBeenNthCalledWith(2, { type: 'next' })
  expect(mockTapLight).toHaveBeenCalledTimes(2)
  expect(mockTapMedium).not.toHaveBeenCalled()
})

// ──────────────────────────────────────────────────────────────────────
// 3. Blank/Black/Clear envían comandos y tapMedium
// ──────────────────────────────────────────────────────────────────────
test('3. Blank/Black/Clear → send + tapMedium', () => {
  render(<ServiceScreen />)
  const blank = screen.getByRole('button', { name: /proyectar slide en blanco/i })
  const black = screen.getByRole('button', { name: /proyectar pantalla negra/i })
  const clear = screen.getByRole('button', { name: /quitar proyección en vivo/i })

  fireEvent.click(blank)
  fireEvent.click(black)
  fireEvent.click(clear)

  expect(mockSend).toHaveBeenCalledTimes(3)
  expect(mockSend).toHaveBeenNthCalledWith(1, { type: 'blank' })
  expect(mockSend).toHaveBeenNthCalledWith(2, { type: 'black' })
  expect(mockSend).toHaveBeenNthCalledWith(3, { type: 'clear' })
  expect(mockTapMedium).toHaveBeenCalledTimes(3)
  expect(mockTapLight).not.toHaveBeenCalled()
})

// ──────────────────────────────────────────────────────────────────────
// 4. PgmPreview muestra slide cuando llega pgm-update
// ──────────────────────────────────────────────────────────────────────
test('4. pgm-update → muestra texto + reference en el preview', () => {
  render(<ServiceScreen />)
  // Antes del evento: estado vacío
  expect(screen.getByText(/Sin contenido proyectado/i)).toBeTruthy()

  emit('pgm-update', { text: 'Porque de tal manera amó Dios', reference: 'Juan 3:16' })

  expect(screen.getByText(/Porque de tal manera amó Dios/i)).toBeTruthy()
  expect(screen.getByText(/Juan 3:16/i)).toBeTruthy()
  expect(screen.queryByText(/Sin contenido proyectado/i)).toBeNull()
})

// ──────────────────────────────────────────────────────────────────────
// 5. auth-error → navega a /pair y desconecta
// ──────────────────────────────────────────────────────────────────────
test('5. auth-error del server → disconnect + navigate("/pair")', () => {
  render(<ServiceScreen />)
  expect(mockNavigate).not.toHaveBeenCalled()
  expect(mockDisconnect).not.toHaveBeenCalled()

  emit('auth-error', { code: 4001, message: 'auth-error' })

  expect(mockDisconnect).toHaveBeenCalledTimes(1)
  expect(mockNavigate).toHaveBeenCalledWith('/pair', { replace: true })
})

// ──────────────────────────────────────────────────────────────────────
// 6. Desemparejar (confirm = true) → disconnect + navigate
// ──────────────────────────────────────────────────────────────────────
test('6. Click Desemparejar con confirm OK → disconnect + nav a /pair', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<ServiceScreen />)
  const unpair = screen.getByRole('button', { name: /desemparejar este mando/i })
  fireEvent.click(unpair)
  expect(confirmSpy).toHaveBeenCalled()
  expect(mockDisconnect).toHaveBeenCalledTimes(1)
  expect(mockNavigate).toHaveBeenCalledWith('/pair', { replace: true })
  confirmSpy.mockRestore()
})

// ──────────────────────────────────────────────────────────────────────
// 7. Desemparejar (confirm = false) → no hace nada
// ──────────────────────────────────────────────────────────────────────
test('7. Click Desemparejar con confirm cancel → no acción', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
  render(<ServiceScreen />)
  const unpair = screen.getByRole('button', { name: /desemparejar este mando/i })
  fireEvent.click(unpair)
  expect(mockDisconnect).not.toHaveBeenCalled()
  expect(mockNavigate).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

// ──────────────────────────────────────────────────────────────────────
// 8. pgm-update-theme → versión del server en el subtítulo del header
// ──────────────────────────────────────────────────────────────────────
test('8. pgm-update-theme con version → header muestra "EclesiaPresenter v..."', () => {
  render(<ServiceScreen />)
  // Antes: "Mando conectado" sin versión
  expect(screen.getByText(/Mando conectado$/i)).toBeTruthy()
  emit('pgm-update-theme', { version: '0.2.17', theme: 'copper' })
  expect(screen.getByText(/Mando conectado.*EclesiaPresenter v0\.2\.17/i)).toBeTruthy()
})

// ──────────────────────────────────────────────────────────────────────
// 9. Cuando NOT OPEN, los botones no envían ni vibran al click
//    (defensa en profundidad por si el atributo disabled falla)
// ──────────────────────────────────────────────────────────────────────
test('9. NOT OPEN → click en Prev no envía ni vibra', () => {
  mockConnectionState = {
    isConnected: false,
    isConnecting: true,
    latencyMs: null,
    signal: 'offline',
    queueSize: 0,
  }
  render(<ServiceScreen />)
  const prev = screen.getByRole('button', { name: /slide anterior/i })
  // disabled bloquea click en el DOM, pero forzamos llamar al handler
  // via el evento para verificar la lógica interna (cmdDisabled return).
  // En la práctica fireEvent.click respeta el disabled, así que el
  // handler nunca debería correr — assert que mockSend está vacío.
  fireEvent.click(prev)
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockTapLight).not.toHaveBeenCalled()
  // Banner reconectando aparece (junto al subtítulo del header, por eso
  // usamos getAllByText: hay >=1 nodo con ese texto en pantalla).
  expect(screen.getAllByText(/Reconectando con el PC/i).length).toBeGreaterThan(0)
})
