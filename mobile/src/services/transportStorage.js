/**
 * transportStorage.js
 *
 * Persistencia de las credenciales del transport (url + token) usando
 * @capacitor/preferences. En Android usa SharedPreferences nativo; en
 * el browser (PWA) usa localStorage como fallback automático.
 *
 * Por qué un único blob JSON: dos `Preferences.set` separados pueden
 * dejar storage inconsistente si la app muere entre la primera y la
 * segunda escritura (token sin url o viceversa). Un solo set es atómico
 * y, al leer, o tenemos el par completo o no tenemos nada.
 *
 * Ejemplo:
 *   const creds = await loadCredentials()
 *   if (creds) await transport.connect(creds.url, creds.token)
 *
 * Edge cases:
 *   - Si Preferences falla (storage corrupto, permisos), `loadCredentials`
 *     devuelve null en vez de propagar. El flujo upstream simplemente
 *     mostrará la pantalla de emparejamiento.
 *   - `saveCredentials` devuelve `true`/`false` para que el caller pueda
 *     loguear sin romperse.
 *   - `clearCredentials` no lanza nunca.
 */
import { Preferences } from '@capacitor/preferences'

const KEY = 'eclesia.transport.credentials'

/**
 * Carga credenciales persistidas (url + token).
 * @returns {Promise<{url: string, token: string} | null>}
 */
export async function loadCredentials() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return null
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed.url === 'string' && typeof parsed.token === 'string') {
      return { url: parsed.url, token: parsed.token }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Persiste credenciales como un único blob JSON (escritura atómica).
 * @param {{url: string, token: string}} creds
 * @returns {Promise<boolean>} true si la escritura fue OK.
 */
export async function saveCredentials({ url, token }) {
  try {
    await Preferences.set({
      key: KEY,
      value: JSON.stringify({ url, token }),
    })
    return true
  } catch (e) {
    console.warn('[transport] saveCredentials failed:', e?.message || e)
    return false
  }
}

/**
 * Borra credenciales. Idempotente y nunca lanza.
 * @returns {Promise<void>}
 */
export async function clearCredentials() {
  try {
    await Preferences.remove({ key: KEY })
  } catch {
    // swallow — borrar lo inexistente no debe romper el flujo
  }
}
