/**
 * supabaseConfig.js (C1)
 *
 * Configuración Supabase del mando móvil (URL del proyecto + anon key).
 *
 * Fuente de los valores — constantes globales inyectadas por Vite en
 * build-time via `define` en vite.config.js (__SUPABASE_URL__ /
 * __SUPABASE_ANON_KEY__), que a su vez se leen de las env vars
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (CI o .env local del
 * paquete mobile).
 *
 * Por qué define y NO import.meta.env directamente: Jest (CJS via
 * babel-jest) no puede parsear `import.meta` — mismo motivo documentado
 * en devLog.js. El patrón define + typeof-guard es el que ya usa
 * __MOBILE_VERSION__ en MoreScreen: en el bundle Vite la constante se
 * reemplaza estáticamente; en Jest el typeof-guard cae al fallback.
 *
 * Fallbacks committed: null. Las credenciales reales NO existen en este
 * working tree (web/ solo tiene .env.example con placeholders), así que
 * no embebemos nada. Nota: la anon key de Supabase es pública por diseño
 * (viaja embebida en el bundle de la web igualmente; RLS protege los
 * datos) — si algún día se decide embeberla aquí como fallback, no es
 * un problema de seguridad.
 *
 * Sin URL o sin key ⇒ isSupabaseConfigured() === false y la UI de
 * cuenta muestra "no disponible en esta build" (estado benigno, no
 * error).
 */

// eslint-disable-next-line no-undef
const URL_FROM_BUILD = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : null
// eslint-disable-next-line no-undef
const KEY_FROM_BUILD = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : null

// Fallbacks committed (null = build sin cuenta; ver doc-block).
const URL_FALLBACK = null
const KEY_FALLBACK = null

function _clean(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** URL del proyecto Supabase o null si no está configurada. */
export function getSupabaseUrl() {
  return _clean(URL_FROM_BUILD) ?? _clean(URL_FALLBACK)
}

/** Anon key (pública por diseño) o null si no está configurada. */
export function getSupabaseAnonKey() {
  return _clean(KEY_FROM_BUILD) ?? _clean(KEY_FALLBACK)
}

/**
 * true si tanto URL como anon key están presentes — gate de toda la
 * feature de cuenta. Con false, getSupabase() devuelve null y la UI
 * muestra el estado 'unconfigured'.
 */
export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}
