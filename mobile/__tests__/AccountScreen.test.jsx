/**
 * AccountScreen.test.jsx (C1)
 *
 * Integration de la pantalla /account contra el account.js REAL (solo se
 * mockean supabaseConfig/supabaseClient, igual que account.test.js):
 * estados unconfigured / signedOut / pendingCode / signedIn (free y pro),
 * flujo completo email → código → sesión, errores con live region,
 * links externos y logout con ConfirmModal.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

let mockConfigured = true

jest.mock('../src/services/supabaseConfig.js', () => ({
  isSupabaseConfigured: () => mockConfigured,
  getSupabaseUrl: () => (mockConfigured ? 'https://test.supabase.co' : null),
  getSupabaseAnonKey: () => (mockConfigured ? 'anon-key' : null),
}))

const mockAuth = {
  getSession: jest.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  signInWithOtp: jest.fn(async () => ({ error: null })),
  verifyOtp: jest.fn(async () => ({
    data: { user: { id: 'u1', email: 'pastor@iglesia.com' } },
    error: null,
  })),
  signOut: jest.fn(async () => ({ error: null })),
}
let mockLicensesResult = { data: [], error: null }
const mockLimit = jest.fn(async () => mockLicensesResult)
const mockOrder = jest.fn(() => ({ limit: mockLimit }))
const mockIn = jest.fn(() => ({ order: mockOrder }))
const mockSelect = jest.fn(() => ({ in: mockIn }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
const mockClient = { auth: mockAuth, from: mockFrom }

jest.mock('../src/services/supabaseClient.js', () => ({
  getSupabase: jest.fn(async () => (mockConfigured ? mockClient : null)),
  __resetForTests: jest.fn(),
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import AccountScreen from '../src/screens/AccountScreen.jsx'
import { account } from '../src/services/account.js'

beforeEach(() => {
  account.__resetForTests()
  jest.clearAllMocks()
  mockConfigured = true
  mockLicensesResult = { data: [], error: null }
  mockAuth.getSession.mockImplementation(async () => ({ data: { session: null } }))
})

async function initAs(session) {
  mockAuth.getSession.mockImplementation(async () => ({ data: { session } }))
  await act(async () => {
    await account.init()
  })
}

const USER = { id: 'u1', email: 'pastor@iglesia.com' }

test('1. unconfigured: mensaje benigno, sin formularios ni error', async () => {
  mockConfigured = false
  await initAs(null)
  render(<AccountScreen />)
  expect(screen.getByText('Cuenta no disponible en esta build')).toBeInTheDocument()
  expect(screen.queryByLabelText(/correo electrónico/i)).toBeNull()
  expect(screen.queryByRole('button', { name: /enviar/i })).toBeNull()
})

test('2. signedOut: card brand con beneficio + email + CTA deshabilitado sin email', async () => {
  await initAs(null)
  render(<AccountScreen />)
  expect(screen.getByText('Guarda tus canciones y listas en la nube')).toBeInTheDocument()
  expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument()
  const cta = screen.getByRole('button', { name: 'Enviar código de acceso al correo' })
  expect(cta).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'pastor@iglesia.com' },
  })
  expect(cta).toBeEnabled()
})

test('3. enviar código → pendingCode con input OTP correcto (numeric + one-time-code)', async () => {
  await initAs(null)
  render(<AccountScreen />)
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: ' Pastor@Iglesia.COM ' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código de acceso al correo' }))
  })
  expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
    email: 'pastor@iglesia.com',
    options: { shouldCreateUser: true },
  })
  expect(screen.getByText(/enviamos un código de 6 dígitos a pastor@iglesia\.com/i)).toBeInTheDocument()
  const codeInput = screen.getByLabelText('Código de 6 dígitos')
  expect(codeInput).toHaveAttribute('inputmode', 'numeric')
  expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')
  expect(codeInput).toHaveAttribute('maxlength', '6')
})

test('4. verificar código → signedIn FREE: email + badge Free + upsell + cerrar sesión', async () => {
  await initAs(null)
  render(<AccountScreen />)
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'pastor@iglesia.com' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código de acceso al correo' }))
  })
  const codeInput = screen.getByLabelText('Código de 6 dígitos')
  const verifyBtn = screen.getByRole('button', { name: 'Verificar el código y entrar' })
  expect(verifyBtn).toBeDisabled() // sin 6 dígitos no hay verify
  fireEvent.change(codeInput, { target: { value: '123456' } })
  expect(verifyBtn).toBeEnabled()
  await act(async () => {
    fireEvent.click(verifyBtn)
  })
  expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
    email: 'pastor@iglesia.com',
    token: '123456',
    type: 'email',
  })
  expect(screen.getByText('pastor@iglesia.com')).toBeInTheDocument()
  expect(screen.getByTestId('plan-badge')).toHaveTextContent('Free')
  expect(screen.getByRole('button', { name: 'Ver planes Pro en el navegador' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cerrar sesión de la cuenta' })).toBeInTheDocument()
})

test('5. signedIn PRO: badge PRO cobre y sin upsell', async () => {
  mockLicensesResult = { data: [{ plan: 'pro_monthly', status: 'active' }], error: null }
  await initAs({ user: USER })
  render(<AccountScreen />)
  expect(screen.getByTestId('plan-badge')).toHaveTextContent('PRO')
  expect(screen.queryByRole('button', { name: 'Ver planes Pro en el navegador' })).toBeNull()
})

test('6. "Gestionar cuenta" abre la web de cuenta en el navegador', async () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
  await initAs({ user: USER })
  render(<AccountScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Abrir la gestión de cuenta en el navegador' }))
  expect(openSpy).toHaveBeenCalledWith(
    'https://eclesia-presenter.vercel.app/cuenta', '_blank', 'noopener',
  )
  openSpy.mockRestore()
})

test('7. upsell free → abre /pricing de la web', async () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
  await initAs({ user: USER })
  render(<AccountScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver planes Pro en el navegador' }))
  expect(openSpy).toHaveBeenCalledWith(
    'https://eclesia-presenter.vercel.app/pricing', '_blank', 'noopener',
  )
  openSpy.mockRestore()
})

test('8. código caducado → mensaje traducido en el live region (no string crudo)', async () => {
  await initAs(null)
  render(<AccountScreen />)
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'pastor@iglesia.com' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código de acceso al correo' }))
  })
  mockAuth.verifyOtp.mockImplementationOnce(async () => ({
    data: {},
    error: { code: 'otp_expired', message: 'Token has expired or is invalid' },
  }))
  fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Verificar el código y entrar' }))
  })
  // El mensaje crudo de Supabase NUNCA aparece; sí el código traducido.
  expect(screen.queryByText(/token has expired/i)).toBeNull()
  expect(screen.getAllByText('El código caducó. Pide uno nuevo.').length).toBeGreaterThan(0)
  expect(screen.getByRole('status')).toHaveTextContent('El código caducó. Pide uno nuevo.')
})

test('9. reenviar código → nuevo signInWithOtp + confirmación visible', async () => {
  await initAs(null)
  render(<AccountScreen />)
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'pastor@iglesia.com' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código de acceso al correo' }))
  })
  mockAuth.signInWithOtp.mockClear()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))
  })
  expect(mockAuth.signInWithOtp).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Código reenviado')).toBeInTheDocument()
})

test('10. cambiar correo vuelve al form de email', async () => {
  await initAs(null)
  render(<AccountScreen />)
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'pastor@iglesia.com' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código de acceso al correo' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }))
  })
  expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument()
  expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull()
})

test('11. cerrar sesión: ConfirmModal → confirmar → signOut + form de email', async () => {
  await initAs({ user: USER })
  render(<AccountScreen />)
  expect(screen.queryByRole('alertdialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión de la cuenta' }))
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toHaveTextContent('¿Cerrar sesión?')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
  })
  expect(mockAuth.signOut).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument()
})

test('12. cerrar sesión: cancelar NO cierra la sesión', async () => {
  await initAs({ user: USER })
  render(<AccountScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión de la cuenta' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(mockAuth.signOut).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByTestId('plan-badge')).toBeInTheDocument()
})

test('13. botón volver navega a /more', async () => {
  await initAs(null)
  render(<AccountScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Volver a Más' }))
  expect(mockNavigate).toHaveBeenCalledWith('/more')
})
