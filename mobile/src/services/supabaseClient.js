/**
 * supabaseClient.js (C1)
 *
 * Singleton lazy del cliente Supabase del mando móvil.
 *
 * Decisiones:
 *   - createClient NUNCA corre en import-time: getSupabase() hace un
 *     dynamic import('@supabase/supabase-js') la primera vez que alguien
 *     lo necesita. Beneficios: (1) los tests que montan pantallas no
 *     necesitan mock global del paquete, (2) Vite parte supabase-js en
 *     un chunk aparte que solo se descarga si la build está configurada.
 *   - auth.storage es un adapter custom sobre @capacitor/preferences
 *     (supabase-js soporta getItem/setItem/removeItem async): en Android
 *     la sesión persiste en SharedPreferences nativo, en PWA cae a
 *     localStorage. Prefijo 'eclesia.supabase.' para no chocar con las
 *     keys del transport ('eclesia.transport.*') ni el locale.
 *   - detectSessionInUrl: false — el mando no usa magic links con
 *     redirect; el login es SIEMPRE por código OTP de 6 dígitos
 *     (verifyOtp), así que no hay tokens en la URL que parsear.
 *   - Si isSupabaseConfigured() es false ⇒ resolve(null). Los callers
 *     (account.js) tratan null como estado 'unconfigured'.
 *
 * Edge cases:
 *   - Dos getSupabase() concurrentes comparten la MISMA promesa (cacheamos
 *     la promesa, no solo el cliente) — jamás se crean dos clientes.
 *   - El adapter de storage nunca lanza: un Preferences roto degrada a
 *     "sesión no persistida", no a crash del login.
 */
import { Preferences } from '@capacitor/preferences'
import { getSupabaseUrl, getSupabaseAnonKey, isSupabaseConfigured } from './supabaseConfig.js'

const STORAGE_PREFIX = 'eclesia.supabase.'

// Adapter async sobre Capacitor Preferences (contrato de supabase-js:
// getItem → string|null, setItem/removeItem → void; los tres pueden ser
// async). Nunca lanza — ver doc-block.
export const preferencesStorageAdapter = {
  async getItem(key) {
    try {
      const { value } = await Preferences.get({ key: STORAGE_PREFIX + key })
      return value ?? null
    } catch {
      return null
    }
  },
  async setItem(key, value) {
    try {
      await Preferences.set({ key: STORAGE_PREFIX + key, value })
    } catch (e) {
      console.warn('[supabase] storage setItem failed:', e?.message || e)
    }
  },
  async removeItem(key) {
    try {
      await Preferences.remove({ key: STORAGE_PREFIX + key })
    } catch {
      // borrar lo inexistente no debe romper el signOut
    }
  },
}

let _clientPromise = null

/**
 * Devuelve el cliente Supabase singleton, o null si la build no trae
 * credenciales (isSupabaseConfigured() === false).
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient | null>}
 */
export function getSupabase() {
  if (!isSupabaseConfigured()) return Promise.resolve(null)
  if (!_clientPromise) {
    _clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        auth: {
          storage: preferencesStorageAdapter,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }),
    )
    // Si el import o createClient fallan, limpiamos la promesa cacheada
    // para que el siguiente intento pueda reintentar (no memoizar errores).
    _clientPromise = _clientPromise.catch((e) => {
      _clientPromise = null
      throw e
    })
  }
  return _clientPromise
}

/** Solo tests: descarta el singleton para aislar suites. */
export function __resetForTests() {
  _clientPromise = null
}
