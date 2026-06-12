/**
 * PlannerListScreen.test.jsx (C3a)
 *
 * Planificador de listas cloud (/plans): gating x4 estados de cuenta
 * (unconfigured/signedOut/free/pro — mismo patrón que el modo nube de
 * SongsScreen), lista de planes (fecha por locale, nº items, badge
 * plantilla), navegación a editor y delete con ConfirmModal danger.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// ─── Mock cuenta (C1) ──
let mockAccountState = {
  status: 'signedOut', email: null, user: null, plan: null, isPro: false, error: null,
}
jest.mock('../src/hooks/useAccount.js', () => ({
  useAccount: () => mockAccountState,
}))

// ─── Mock listas cloud ──
let mockSchedulesState = {
  status: 'loading', items: [], error: null, refetch: jest.fn(),
}
jest.mock('../src/hooks/useCloudSchedules.js', () => ({
  useCloudSchedules: () => mockSchedulesState,
}))

const mockRemove = jest.fn()
jest.mock('../src/services/cloudSchedules.js', () => {
  const actual = jest.requireActual('../src/services/cloudSchedules.js')
  return { ...actual, remove: (...args) => mockRemove(...args) }
})

import PlannerListScreen, { formatServiceDate } from '../src/screens/PlannerListScreen.jsx'
import { setFlash, consumeFlash } from '../src/services/flashMessage.js'

// La fecha esperada se computa con el MISMO Intl del runtime del test —
// inmune a diferencias de ICU entre máquinas.
const JUNE15 = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(2026, 5, 15))

const PLANS = [
  { id: 'p1', title: 'Culto 15 junio', service_date: '2026-06-15', is_template: false, items_count: 3, updated_at: '2026-06-12T10:00:00Z' },
  { id: 'p2', title: 'Base dominical', service_date: null, is_template: true, items_count: 1, updated_at: '2026-06-10T10:00:00Z' },
]

function setAccount(status, { isPro = false, plan = null } = {}) {
  mockAccountState = { status, email: 'p@x.com', user: null, plan, isPro, error: null }
}

beforeEach(() => {
  jest.clearAllMocks()
  consumeFlash()
  mockAccountState = { status: 'signedOut', email: null, user: null, plan: null, isPro: false, error: null }
  mockSchedulesState = { status: 'loading', items: [], error: null, refetch: jest.fn() }
})

/* ============ Gating x4 estados ============ */

test('1. unconfigured: card "no disponible en esta build" sin lista ni CTA', () => {
  setAccount('unconfigured')
  render(<PlannerListScreen />)
  expect(screen.getByText('Cuenta no disponible en esta build')).toBeInTheDocument()
  expect(screen.queryByText('+ Nueva lista')).toBeNull()
})

test('2. signedOut: card "inicia sesión" con CTA a /account', () => {
  setAccount('signedOut')
  render(<PlannerListScreen />)
  expect(screen.getByText('Inicia sesión para planificar tus cultos')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la pantalla de cuenta' }))
  expect(mockNavigate).toHaveBeenCalledWith('/account')
})

test('3. free: card upsell con link externo a pricing', () => {
  setAccount('signedIn', { isPro: false, plan: 'free' })
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
  render(<PlannerListScreen />)
  expect(screen.getByText('Planifica tus cultos con Pro')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver planes Pro en el navegador' }))
  expect(openSpy).toHaveBeenCalledWith(
    'https://eclesia-presenter.vercel.app/pricing', '_blank', 'noopener',
  )
  openSpy.mockRestore()
})

test('4. pro: lista con título, fecha por locale, nº items y badge Plantilla', () => {
  setAccount('signedIn', { isPro: true, plan: 'pro_monthly' })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  const { container } = render(<PlannerListScreen />)

  expect(screen.getByText('Culto 15 junio')).toBeInTheDocument()
  expect(container.textContent).toContain(`${JUNE15} · 3 items`)
  // Sin fecha → "Sin fecha"; 1 item → singular; plantilla → badge.
  expect(container.textContent).toContain('Sin fecha · 1 item')
  expect(screen.getByText('Plantilla')).toBeInTheDocument()
})

/* ============ Acciones del modo pro ============ */

test('5. "+ Nueva lista" navega a /plans/new', () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  render(<PlannerListScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Crear una lista nueva en la nube' }))
  expect(mockNavigate).toHaveBeenCalledWith('/plans/new')
})

test('6. tap en una lista navega a su editor', () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  render(<PlannerListScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Culto 15 junio' }))
  expect(mockNavigate).toHaveBeenCalledWith('/plans/p1')
})

test('7. delete: ConfirmModal danger → confirmar llama remove + refetch + toast', async () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  mockRemove.mockResolvedValue({ ok: true })
  render(<PlannerListScreen />)

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Culto 15 junio' }))
  expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Eliminar esta lista?')

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  })
  expect(mockRemove).toHaveBeenCalledWith('p1')
  expect(mockSchedulesState.refetch).toHaveBeenCalled()
  expect(screen.getAllByText('Lista eliminada').length).toBeGreaterThan(0)
})

test('8. delete: cancelar cierra el modal sin llamar remove', () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  render(<PlannerListScreen />)

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Culto 15 junio' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mockRemove).not.toHaveBeenCalled()
})

test('9. delete con error → toast de error mapeado, sin refetch', async () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  mockRemove.mockResolvedValue({ ok: false, error: 'network' })
  render(<PlannerListScreen />)

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Culto 15 junio' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  })
  expect(screen.getAllByText('Sin conexión a internet. Comprueba la red.').length).toBeGreaterThan(0)
  expect(mockSchedulesState.refetch).not.toHaveBeenCalled()
})

/* ============ Estados de la lista ============ */

test('10. empty: mensaje + hint de crear', () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'empty'
  render(<PlannerListScreen />)
  expect(screen.getByText('Aún no tienes listas en la nube')).toBeInTheDocument()
  expect(screen.getByText('Crea la primera con "+ Nueva lista"')).toBeInTheDocument()
})

test('11. error: mensaje mapeado + Reintentar llama refetch', () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'error'
  mockSchedulesState.error = { code: 'unauthorized' }
  render(<PlannerListScreen />)
  expect(screen.getByText('Sesión caducada. Vuelve a iniciar sesión.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(mockSchedulesState.refetch).toHaveBeenCalled()
})

/* ============ Flash del editor + helper de fecha ============ */

test('12. flash del editor: toast de guardado al volver', () => {
  setAccount('signedIn', { isPro: true })
  mockSchedulesState.status = 'results'
  mockSchedulesState.items = PLANS
  setFlash('Lista guardada')
  render(<PlannerListScreen />)
  expect(screen.getAllByText('Lista guardada').length).toBeGreaterThan(0)
})

test('13. formatServiceDate: parse LOCAL (sin shift UTC) y guards', () => {
  expect(formatServiceDate('2026-06-15', 'es')).toBe(JUNE15)
  expect(formatServiceDate(null, 'es')).toBe('')
  expect(formatServiceDate('', 'es')).toBe('')
  expect(formatServiceDate('15/06/2026', 'es')).toBe('')
  // EN formatea distinto que ES (la fecha sí pasa por el locale).
  expect(formatServiceDate('2026-06-15', 'en'))
    .toBe(new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(2026, 5, 15)))
})
