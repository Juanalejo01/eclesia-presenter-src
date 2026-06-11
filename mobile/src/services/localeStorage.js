/**
 * localeStorage.js (T13)
 *
 * Persistencia del idioma elegido por el usuario usando
 * @capacitor/preferences (SharedPreferences en Android, NSUserDefaults
 * en iOS, localStorage en web). Mismas convenciones que
 * transportStorage.js: try/catch en todo, loadLocale() devuelve null en
 * cualquier fallo, saveLocale() devuelve boolean, nada lanza nunca.
 *
 * La lista VALID vive aqui (y no se importa de i18n.js) para evitar un
 * ciclo de imports: i18n.js importa este modulo. i18n.js re-valida
 * contra Object.keys(DICT) de todas formas.
 */
import { Preferences } from '@capacitor/preferences'

const KEY = 'eclesia.locale'
const VALID = ['es', 'en', 'pt']

/**
 * Carga el locale persistido. Devuelve 'es' | 'en' | 'pt' o null.
 * @returns {Promise<string | null>}
 */
export async function loadLocale() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (typeof value === 'string' && VALID.includes(value)) return value
    return null
  } catch {
    return null
  }
}

/**
 * Persiste el locale elegido explicitamente por el usuario.
 * @param {string} locale
 * @returns {Promise<boolean>} true si la escritura fue OK.
 */
export async function saveLocale(locale) {
  try {
    if (!VALID.includes(locale)) return false
    await Preferences.set({ key: KEY, value: locale })
    return true
  } catch (e) {
    console.warn('[i18n] saveLocale failed:', e?.message || e)
    return false
  }
}

/**
 * Borra el locale persistido. Idempotente y nunca lanza.
 * @returns {Promise<void>}
 */
export async function clearLocale() {
  try {
    await Preferences.remove({ key: KEY })
  } catch {
    // swallow
  }
}
