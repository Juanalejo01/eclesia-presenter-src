/**
 * registerSW.js
 *
 * Registro MANUAL y gated del service worker generado por vite-plugin-pwa
 * (injectRegister: false en vite.config.js — este módulo es la ÚNICA vía
 * de registro). Dos funciones para testabilidad:
 *
 *   - shouldRegisterSW(env): guard PURO, sin side effects. Decide si
 *     procede registrar según el entorno.
 *   - registerSW(baseUrl): recoge el entorno real y, si el guard pasa,
 *     registra `${baseUrl}sw.js` con catch TOTALMENTE silencioso.
 *
 * Cobertura del guard (por qué cada condición existe):
 *   - APK Capacitor (isNative=true)  → NO registrar. El precache de Workbox
 *     persistiría en el storage del WebView y serviría bundles viejos tras
 *     actualizar el APK — bug indebugeable para el usuario.
 *   - LAN http://192.168.x.x:3434/app (isSecure=false) → NO registrar.
 *     El navegador rechaza SW en insecure context; el intento fallaría con
 *     ruido en consola. La app funciona como web normal sin SW.
 *   - Sin soporte (hasSW=false)      → NO registrar (WebViews antiguos).
 *   - Vercel https / localhost dev   → registrar.
 */
import { Capacitor } from '@capacitor/core'

/**
 * Guard puro.
 * @param {{ isNative: boolean, hasSW: boolean, isSecure: boolean }} env
 * @returns {boolean}
 */
export function shouldRegisterSW({ isNative, hasSW, isSecure }) {
  return !isNative && hasSW && isSecure
}

/**
 * Registra el service worker si el entorno lo permite. Nunca lanza.
 *
 * @param {string} [baseUrl='/'] — pasar import.meta.env.BASE_URL desde el
 *   entry (main.jsx). Bajo el build embed (--base=/app/) registra /app/sw.js,
 *   con scope /app/ derivado de la ubicación del script.
 */
export function registerSW(baseUrl = '/') {
  try {
    const env = {
      isNative: Capacitor.isNativePlatform(),
      hasSW: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      isSecure: typeof window !== 'undefined' && window.isSecureContext === true,
    }
    if (!shouldRegisterSW(env)) return

    navigator.serviceWorker
      .register(baseUrl + 'sw.js')
      .catch((e) => {
        // Silencioso a propósito: en LAN http el registro falla por insecure
        // context y NO debe ser visible para el usuario.
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[pwa] SW no registrado:', e?.message || e)
        }
      })
  } catch (e) {
    // Capacitor/navigator pueden no existir en entornos raros — invisible.
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[pwa] registerSW omitido:', e?.message || e)
    }
  }
}
