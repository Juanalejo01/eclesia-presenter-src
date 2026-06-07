/**
 * transportStorage.js
 *
 * Persistencia de las credenciales del transport (url + token) usando
 * @capacitor/preferences. En Android usa SharedPreferences nativo; en
 * el browser (PWA) usa localStorage como fallback automático.
 *
 * Por qué existe: necesitamos auto-reconnect al reabrir la app sin
 * forzar al usuario a re-emparejar. Token va aparte y se borra al
 * desconectar intencionalmente o ante un AUTH_ERROR del server.
 *
 * Ejemplo:
 *   const creds = await loadCredentials()
 *   if (creds) await transport.connect(creds.url, creds.token)
 *
 * Edge cases:
 *   - Si Preferences falla (storage corrupto, permisos), `loadCredentials`
 *     devuelve null en vez de propagar. El flujo upstream simplemente
 *     mostrará la pantalla de emparejamiento.
 *   - `clearCredentials` no lanza nunca.
 */
import { Preferences } from '@capacitor/preferences'

const KEY_URL = 'eclesia.transport.url'
const KEY_TOKEN = 'eclesia.transport.token'

/**
 * Carga credenciales persistidas (url + token).
 * @returns {Promise<{url: string, token: string} | null>}
 */
export async function loadCredentials() {
  try {
    const urlRes = await Preferences.get({ key: KEY_URL })
    const tokenRes = await Preferences.get({ key: KEY_TOKEN })
    const url = urlRes?.value
    const token = tokenRes?.value
    if (url && token) return { url, token }
    return null
  } catch {
    return null
  }
}

/**
 * Persiste credenciales. Ambas claves van por separado.
 * @param {{url: string, token: string}} creds
 * @returns {Promise<void>}
 */
export async function saveCredentials({ url, token }) {
  await Preferences.set({ key: KEY_URL, value: url })
  await Preferences.set({ key: KEY_TOKEN, value: token })
}

/**
 * Borra credenciales. Idempotente y nunca lanza.
 * @returns {Promise<void>}
 */
export async function clearCredentials() {
  try {
    await Preferences.remove({ key: KEY_URL })
    await Preferences.remove({ key: KEY_TOKEN })
  } catch {
    // swallow — borrar lo inexistente no debe romper el flujo
  }
}
