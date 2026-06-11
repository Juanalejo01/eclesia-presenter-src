/**
 * registerSW.test.js
 *
 * Guard del registro del service worker (T12). El gate es la ÚNICA barrera
 * que impide que el APK Capacitor registre el SW (lo que serviría bundles
 * viejos tras actualizar el APK) — por eso cada condición tiene test propio.
 *
 * @capacitor/core se redirige al mock via moduleNameMapper (capacitor-core.js)
 * con __setNativePlatform() para simular el APK.
 */
import { shouldRegisterSW, registerSW } from '../src/pwa/registerSW.js'
import { __setNativePlatform } from '@capacitor/core'

// Entorno node: window/navigator no existen (o existen parcialmente en Node
// moderno). defineProperty con configurable para poder limpiarlos.
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

function setupBrowserEnv({ secure = true, withSW = true, register } = {}) {
  const registerFn = register || jest.fn(() => Promise.resolve({ scope: '/' }))
  setGlobal('navigator', withSW ? { serviceWorker: { register: registerFn } } : {})
  setGlobal('window', { isSecureContext: secure })
  return registerFn
}

afterEach(() => {
  __setNativePlatform(false)
  try { delete globalThis.navigator } catch { /* ignore */ }
  try { delete globalThis.window } catch { /* ignore */ }
})

// ---------------- shouldRegisterSW (guard puro) ----------------

test('shouldRegisterSW false cuando isNative=true (APK Capacitor)', () => {
  expect(shouldRegisterSW({ isNative: true, hasSW: true, isSecure: true })).toBe(false)
})

test("shouldRegisterSW false sin 'serviceWorker' in navigator", () => {
  expect(shouldRegisterSW({ isNative: false, hasSW: false, isSecure: true })).toBe(false)
})

test('shouldRegisterSW false con isSecureContext=false (LAN http :3434/app)', () => {
  expect(shouldRegisterSW({ isNative: false, hasSW: true, isSecure: false })).toBe(false)
})

test('shouldRegisterSW true en web + secure context', () => {
  expect(shouldRegisterSW({ isNative: false, hasSW: true, isSecure: true })).toBe(true)
})

// ---------------- registerSW (entorno real + side effects) ----------------

test("registerSW registra BASE_URL + 'sw.js' (path correcto bajo /app/)", () => {
  const register = setupBrowserEnv()
  registerSW('/app/')
  expect(register).toHaveBeenCalledTimes(1)
  expect(register).toHaveBeenCalledWith('/app/sw.js')
})

test('registerSW con base raíz registra /sw.js', () => {
  const register = setupBrowserEnv()
  registerSW('/')
  expect(register).toHaveBeenCalledWith('/sw.js')
})

test('registerSW NO registra en plataforma nativa (APK)', () => {
  const register = setupBrowserEnv()
  __setNativePlatform(true)
  registerSW('/')
  expect(register).not.toHaveBeenCalled()
})

test('registerSW NO registra en insecure context (LAN http)', () => {
  const register = setupBrowserEnv({ secure: false })
  registerSW('/app/')
  expect(register).not.toHaveBeenCalled()
})

test('registerSW no lanza si register() rechaza (catch silencioso)', async () => {
  const register = jest.fn(() => Promise.reject(new Error('insecure context')))
  setupBrowserEnv({ register })
  expect(() => registerSW('/app/')).not.toThrow()
  // Drena la microtask del .catch — sin unhandled rejection.
  await new Promise((r) => setTimeout(r, 0))
  expect(register).toHaveBeenCalledWith('/app/sw.js')
})

test('registerSW no lanza si navigator/window no existen (entorno raro)', () => {
  // Sin setupBrowserEnv: globals ausentes.
  expect(() => registerSW('/')).not.toThrow()
})
