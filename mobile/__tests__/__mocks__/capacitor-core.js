/**
 * capacitor-core.js (mock)
 *
 * Sustituye a `@capacitor/core` en Jest (via moduleNameMapper en ambos
 * projects de package.json — mismo patrón que capacitor-preferences).
 * Por defecto simula plataforma WEB (isNativePlatform() === false); los
 * tests que necesiten simular el APK llaman a __setNativePlatform(true)
 * y deben resetear en afterEach con __setNativePlatform(false).
 */
let _native = false

export const Capacitor = {
  isNativePlatform: () => _native,
  getPlatform: () => (_native ? 'android' : 'web'),
}

export function __setNativePlatform(value) {
  _native = Boolean(value)
}
