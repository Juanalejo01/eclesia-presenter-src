/**
 * deviceId.js
 *
 * Device ID persistente generado una sola vez por instalación. Se almacena
 * en Capacitor Preferences (SharedPreferences en Android / NSUserDefaults
 * en iOS / localStorage en web) bajo la clave `eclesia.deviceId`.
 *
 * Por qué un ID dedicado además del token de pairing: el server podrá
 * distinguir múltiples mandos del mismo usuario y, en el futuro, listar /
 * revocar dispositivos uno a uno desde el panel "Transmisión".
 *
 * Ejemplo:
 *   const id = await getDeviceId()  // 'b3f8d4...'
 *
 * Edge cases:
 *   - Storage indisponible (web sin Capacitor en SSR, Preferences corrupto):
 *     devolvemos un ID efímero generado en memoria. El server lo tratará
 *     como dispositivo nuevo en cada arranque — aceptable como fallback.
 *   - crypto.randomUUID ausente (Node < 19, navegadores muy viejos):
 *     fallback a string aleatorio con prefijo `dev-`.
 */
import { Preferences } from '@capacitor/preferences'

const KEY = 'eclesia.deviceId'

/**
 * Devuelve el deviceId persistente. Lo genera y guarda si no existe.
 * Idempotente: múltiples llamadas devuelven el mismo valor mientras
 * el storage siga vivo.
 * @returns {Promise<string>}
 */
export async function getDeviceId() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (value && typeof value === 'string') return value
    const id = _generate()
    await Preferences.set({ key: KEY, value: id })
    return id
  } catch {
    // Storage falló: devolvemos un ID efímero. No persistente, pero
    // suficiente para que el server reciba algo bien formado.
    return _generate()
  }
}

function _generate() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback inseguro para entornos sin Web Crypto. Suficiente para
  // identificación (no es un secreto), no para criptografía.
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
