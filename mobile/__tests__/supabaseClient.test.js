/**
 * supabaseClient.test.js (C1)
 *
 * Cubre la lazy-init del singleton (createClient NUNCA en import-time,
 * una sola instancia, null si la build no está configurada) y el adapter
 * de storage sobre @capacitor/preferences (prefijo 'eclesia.supabase.',
 * contrato async, nunca lanza). @supabase/supabase-js se mockea via
 * jest.mock — mismo enfoque que los mocks @capacitor/* del repo, pero
 * por archivo (solo esta suite lo necesita).
 */

let mockConfigured = true

jest.mock('../src/services/supabaseConfig.js', () => ({
  isSupabaseConfigured: () => mockConfigured,
  getSupabaseUrl: () => (mockConfigured ? 'https://test.supabase.co' : null),
  getSupabaseAnonKey: () => (mockConfigured ? 'anon-key' : null),
}))

const mockCreateClient = jest.fn(() => ({ __fake: 'client' }))
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClient(...args),
}))

import { Preferences } from '@capacitor/preferences'
import {
  getSupabase,
  preferencesStorageAdapter,
  __resetForTests,
} from '../src/services/supabaseClient.js'

beforeEach(async () => {
  __resetForTests()
  mockCreateClient.mockClear()
  mockConfigured = true
  await Preferences.clear()
})

/* ============================================================== */
/* Lazy singleton                                                 */
/* ============================================================== */

test('importar el módulo NO crea el cliente (lazy)', () => {
  expect(mockCreateClient).not.toHaveBeenCalled()
})

test('sin configuración → getSupabase() resuelve null sin tocar supabase-js', async () => {
  mockConfigured = false
  const client = await getSupabase()
  expect(client).toBeNull()
  expect(mockCreateClient).not.toHaveBeenCalled()
})

test('configurado → crea el cliente con url/key y opciones de auth correctas', async () => {
  const client = await getSupabase()
  expect(client).toEqual({ __fake: 'client' })
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
  const [url, key, opts] = mockCreateClient.mock.calls[0]
  expect(url).toBe('https://test.supabase.co')
  expect(key).toBe('anon-key')
  expect(opts.auth.persistSession).toBe(true)
  expect(opts.auth.autoRefreshToken).toBe(true)
  expect(opts.auth.detectSessionInUrl).toBe(false)
  expect(opts.auth.storage).toBe(preferencesStorageAdapter)
})

test('singleton: dos getSupabase() concurrentes → un solo createClient', async () => {
  const [a, b] = await Promise.all([getSupabase(), getSupabase()])
  expect(a).toBe(b)
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
})

/* ============================================================== */
/* Storage adapter (Capacitor Preferences)                        */
/* ============================================================== */

test('adapter set/get/remove con prefijo eclesia.supabase.', async () => {
  await preferencesStorageAdapter.setItem('auth-token', '{"a":1}')
  // La key real en Preferences lleva el prefijo (no choca con transport).
  const raw = await Preferences.get({ key: 'eclesia.supabase.auth-token' })
  expect(raw.value).toBe('{"a":1}')

  expect(await preferencesStorageAdapter.getItem('auth-token')).toBe('{"a":1}')
  await preferencesStorageAdapter.removeItem('auth-token')
  expect(await preferencesStorageAdapter.getItem('auth-token')).toBeNull()
})

test('adapter.getItem devuelve null para keys inexistentes', async () => {
  expect(await preferencesStorageAdapter.getItem('nope')).toBeNull()
})

test('adapter nunca lanza aunque Preferences falle', async () => {
  const getSpy = jest.spyOn(Preferences, 'get').mockRejectedValueOnce(new Error('disk'))
  const setSpy = jest.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('disk'))
  const rmSpy = jest.spyOn(Preferences, 'remove').mockRejectedValueOnce(new Error('disk'))
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

  await expect(preferencesStorageAdapter.getItem('k')).resolves.toBeNull()
  await expect(preferencesStorageAdapter.setItem('k', 'v')).resolves.toBeUndefined()
  await expect(preferencesStorageAdapter.removeItem('k')).resolves.toBeUndefined()

  getSpy.mockRestore()
  setSpy.mockRestore()
  rmSpy.mockRestore()
  warnSpy.mockRestore()
})
