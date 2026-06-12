/**
 * account.test.js (C1)
 *
 * Unit del singleton account.js: init/requestCode/verifyCode/refreshPlan/
 * signOut + mapeo de errores Supabase → códigos estables. El cliente
 * Supabase se mockea a nivel de services/supabaseClient.js (la lazy-init
 * real se cubre en supabaseClient.test.js); supabaseConfig se mockea para
 * poder alternar configured/unconfigured.
 */

let mockConfigured = true

jest.mock('../src/services/supabaseConfig.js', () => ({
  isSupabaseConfigured: () => mockConfigured,
  getSupabaseUrl: () => (mockConfigured ? 'https://test.supabase.co' : null),
  getSupabaseAnonKey: () => (mockConfigured ? 'anon-key' : null),
}))

// ── Cliente Supabase mock (API superficial usada por account.js) ──
const mockAuth = {
  getSession: jest.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  signInWithOtp: jest.fn(async () => ({ error: null })),
  verifyOtp: jest.fn(async () => ({
    data: { user: { id: 'u1', email: 'user@mail.com' } },
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

import { account, AccountStatus, mapAuthError, sanitizeEmail } from '../src/services/account.js'

beforeEach(() => {
  account.__resetForTests()
  jest.clearAllMocks()
  mockConfigured = true
  mockLicensesResult = { data: [], error: null }
  mockAuth.getSession.mockImplementation(async () => ({ data: { session: null } }))
})

/* ============================================================== */
/* init()                                                         */
/* ============================================================== */

test('init sin credenciales de build → status unconfigured', async () => {
  mockConfigured = false
  await account.init()
  expect(account.getSnapshot().status).toBe(AccountStatus.UNCONFIGURED)
  expect(mockAuth.getSession).not.toHaveBeenCalled()
})

test('init sin sesión persistida → signedOut', async () => {
  await account.init()
  expect(account.getSnapshot().status).toBe(AccountStatus.SIGNED_OUT)
})

test('init con sesión persistida → signedIn + email + plan free sin licencias', async () => {
  mockAuth.getSession.mockImplementation(async () => ({
    data: { session: { user: { id: 'u1', email: 'pastor@iglesia.com' } } },
  }))
  await account.init()
  const s = account.getSnapshot()
  expect(s.status).toBe(AccountStatus.SIGNED_IN)
  expect(s.email).toBe('pastor@iglesia.com')
  expect(s.plan).toBe('free')
  expect(s.isPro).toBe(false)
})

test('init con sesión + licencia pro_yearly activa → isPro true', async () => {
  mockAuth.getSession.mockImplementation(async () => ({
    data: { session: { user: { id: 'u1', email: 'pro@iglesia.com' } } },
  }))
  mockLicensesResult = { data: [{ plan: 'pro_yearly', status: 'active' }], error: null }
  await account.init()
  const s = account.getSnapshot()
  expect(s.plan).toBe('pro_yearly')
  expect(s.isPro).toBe(true)
})

test('init es idempotente (segunda llamada no repite getSession)', async () => {
  await account.init()
  await account.init()
  expect(mockAuth.getSession).toHaveBeenCalledTimes(1)
})

test('evento SIGNED_OUT de onAuthStateChange → estado signedOut limpio', async () => {
  mockAuth.getSession.mockImplementation(async () => ({
    data: { session: { user: { id: 'u1', email: 'x@y.co' } } },
  }))
  mockLicensesResult = { data: [{ plan: 'lifetime', status: 'active' }], error: null }
  await account.init()
  expect(account.getSnapshot().isPro).toBe(true)

  const handler = mockAuth.onAuthStateChange.mock.calls[0][0]
  handler('SIGNED_OUT', null)
  const s = account.getSnapshot()
  expect(s.status).toBe(AccountStatus.SIGNED_OUT)
  expect(s.email).toBeNull()
  expect(s.isPro).toBe(false)
  expect(s.plan).toBeNull()
})

/* ============================================================== */
/* requestCode()                                                  */
/* ============================================================== */

test('requestCode sanitiza el email (trim + lowercase) y pide shouldCreateUser', async () => {
  const res = await account.requestCode('  Pastor@Iglesia.COM  ')
  expect(res).toEqual({ ok: true, error: null })
  expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
    email: 'pastor@iglesia.com',
    options: { shouldCreateUser: true },
  })
  const s = account.getSnapshot()
  expect(s.status).toBe(AccountStatus.PENDING_CODE)
  expect(s.email).toBe('pastor@iglesia.com')
})

test('requestCode con email inválido → invalid_email sin llamar a Supabase', async () => {
  const res = await account.requestCode('no-es-un-email')
  expect(res).toEqual({ ok: false, error: 'invalid_email' })
  expect(mockAuth.signInWithOtp).not.toHaveBeenCalled()
  expect(account.getSnapshot().error).toBe('invalid_email')
})

test('requestCode con rate limit de Supabase → código estable rate_limit', async () => {
  mockAuth.signInWithOtp.mockImplementationOnce(async () => ({
    error: { status: 429, message: 'For security purposes, you can only request this once every 60 seconds' },
  }))
  const res = await account.requestCode('a@b.co')
  expect(res.ok).toBe(false)
  expect(res.error).toBe('rate_limit')
  expect(account.getSnapshot().status).not.toBe(AccountStatus.PENDING_CODE)
})

test('requestCode con fallo de red (fetch) → código network, nunca el mensaje crudo', async () => {
  mockAuth.signInWithOtp.mockImplementationOnce(async () => {
    throw new TypeError('Failed to fetch')
  })
  const res = await account.requestCode('a@b.co')
  expect(res.error).toBe('network')
  expect(account.getSnapshot().error).toBe('network')
})

/* ============================================================== */
/* verifyCode()                                                   */
/* ============================================================== */

test('verifyCode feliz → verifyOtp type email + signedIn + plan refrescado', async () => {
  mockLicensesResult = { data: [{ plan: 'pro_monthly', status: 'trialing' }], error: null }
  await account.requestCode('user@mail.com')
  const res = await account.verifyCode('user@mail.com', '123456')
  expect(res).toEqual({ ok: true, error: null })
  expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
    email: 'user@mail.com',
    token: '123456',
    type: 'email',
  })
  const s = account.getSnapshot()
  expect(s.status).toBe(AccountStatus.SIGNED_IN)
  expect(s.email).toBe('user@mail.com')
  expect(s.plan).toBe('pro_monthly')
  expect(s.isPro).toBe(true)
})

test('verifyCode usa el email del estado si no se pasa explícito', async () => {
  await account.requestCode('user@mail.com')
  await account.verifyCode(null, '654321')
  expect(mockAuth.verifyOtp).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'user@mail.com', token: '654321' }),
  )
})

test('verifyCode con código corto → invalid_code sin llamar a Supabase', async () => {
  await account.requestCode('user@mail.com')
  const res = await account.verifyCode('user@mail.com', '123')
  expect(res).toEqual({ ok: false, error: 'invalid_code' })
  expect(mockAuth.verifyOtp).not.toHaveBeenCalled()
})

test('verifyCode con código caducado → expired_code y sigue en pendingCode', async () => {
  await account.requestCode('user@mail.com')
  mockAuth.verifyOtp.mockImplementationOnce(async () => ({
    data: {},
    error: { code: 'otp_expired', message: 'Token has expired or is invalid' },
  }))
  const res = await account.verifyCode('user@mail.com', '000000')
  expect(res.error).toBe('expired_code')
  expect(account.getSnapshot().status).toBe(AccountStatus.PENDING_CODE)
})

/* ============================================================== */
/* refreshPlan()                                                  */
/* ============================================================== */

async function signIn() {
  mockAuth.getSession.mockImplementation(async () => ({
    data: { session: { user: { id: 'u1', email: 'x@y.co' } } },
  }))
  await account.init()
}

test('refreshPlan consulta licenses con los filtros correctos', async () => {
  await signIn()
  expect(mockFrom).toHaveBeenCalledWith('licenses')
  expect(mockSelect).toHaveBeenCalledWith('plan,status,current_period_end')
  expect(mockIn).toHaveBeenCalledWith('status', ['active', 'trialing'])
  expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(mockLimit).toHaveBeenCalledWith(1)
})

test('refreshPlan con licencia plan=free explícita → isPro false', async () => {
  mockLicensesResult = { data: [{ plan: 'free', status: 'active' }], error: null }
  await signIn()
  const s = account.getSnapshot()
  expect(s.plan).toBe('free')
  expect(s.isPro).toBe(false)
})

test('refreshPlan con error de red conserva el último plan conocido', async () => {
  mockLicensesResult = { data: [{ plan: 'lifetime', status: 'active' }], error: null }
  await signIn()
  expect(account.getSnapshot().isPro).toBe(true)

  mockLicensesResult = { data: null, error: { message: 'network error' } }
  const res = await account.refreshPlan()
  expect(res).toEqual({ plan: 'lifetime', isPro: true })
  expect(account.getSnapshot().isPro).toBe(true)
})

test('refreshPlan sin sesión no consulta licenses', async () => {
  await account.init() // signedOut
  mockFrom.mockClear()
  await account.refreshPlan()
  expect(mockFrom).not.toHaveBeenCalled()
})

/* ============================================================== */
/* signOut()                                                      */
/* ============================================================== */

test('signOut llama a auth.signOut y limpia el estado', async () => {
  await signIn()
  await account.signOut()
  expect(mockAuth.signOut).toHaveBeenCalledTimes(1)
  const s = account.getSnapshot()
  expect(s.status).toBe(AccountStatus.SIGNED_OUT)
  expect(s.email).toBeNull()
  expect(s.user).toBeNull()
  expect(s.plan).toBeNull()
})

test('signOut con error remoto igualmente termina en signedOut', async () => {
  await signIn()
  mockAuth.signOut.mockImplementationOnce(async () => {
    throw new Error('boom')
  })
  await account.signOut()
  expect(account.getSnapshot().status).toBe(AccountStatus.SIGNED_OUT)
})

/* ============================================================== */
/* Observer (subscribe/getSnapshot)                               */
/* ============================================================== */

test('getSnapshot devuelve la misma referencia si no hubo cambios', async () => {
  const a = account.getSnapshot()
  const b = account.getSnapshot()
  expect(a).toBe(b)
  await account.requestCode('a@b.co')
  expect(account.getSnapshot()).not.toBe(a)
})

test('subscribe notifica cambios y unsubscribe deja de hacerlo', async () => {
  const seen = []
  const off = account.subscribe((s) => seen.push(s.status))
  await account.requestCode('a@b.co')
  expect(seen).toContain(AccountStatus.PENDING_CODE)
  const count = seen.length
  off()
  await account.signOut()
  expect(seen.length).toBe(count)
})

test('backToEmail vuelve de pendingCode a signedOut sin error', async () => {
  await account.requestCode('a@b.co')
  account.backToEmail()
  const s = account.getSnapshot()
  expect(s.status).toBe(AccountStatus.SIGNED_OUT)
  expect(s.error).toBeNull()
})

/* ============================================================== */
/* mapAuthError / sanitizeEmail                                   */
/* ============================================================== */

test('mapAuthError reduce errores Supabase a códigos estables', () => {
  expect(mapAuthError(null)).toBeNull()
  expect(mapAuthError({ status: 429, message: 'x' })).toBe('rate_limit')
  expect(mapAuthError({ code: 'over_email_send_rate_limit', message: 'x' })).toBe('rate_limit')
  expect(mapAuthError({ message: 'Email rate limit exceeded' })).toBe('rate_limit')
  expect(mapAuthError({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe('expired_code')
  expect(mapAuthError({ message: 'Invalid token' })).toBe('invalid_code')
  expect(mapAuthError(new TypeError('Failed to fetch'))).toBe('network')
  expect(mapAuthError({ message: 'algo rarísimo' })).toBe('unknown')
})

test('sanitizeEmail: trim + lowercase + valida formato', () => {
  expect(sanitizeEmail('  A@B.Co ')).toBe('a@b.co')
  expect(sanitizeEmail('sin-arroba')).toBeNull()
  expect(sanitizeEmail('dos espacios@x.co')).toBeNull()
  expect(sanitizeEmail('')).toBeNull()
  expect(sanitizeEmail(null)).toBeNull()
})
