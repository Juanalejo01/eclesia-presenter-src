/**
 * account.js (C1)
 *
 * Estado de cuenta Supabase del mando móvil (login OTP por email +
 * plan Free/Pro). Singleton imperativo con patrón observer manual —
 * mismo esquema que transport.js / i18n.js: subscribe/getSnapshot para
 * useSyncExternalStore (hooks/useAccount.js).
 *
 * Máquina de estados (state.status):
 *   'unconfigured' — la build no trae credenciales Supabase (gate de
 *                    supabaseConfig). Estado terminal benigno.
 *   'loading'      — init() restaurando la sesión persistida.
 *   'signedOut'    — sin sesión. UI: form de email.
 *   'pendingCode'  — signInWithOtp OK, esperando el código de 6 dígitos.
 *   'signedIn'     — sesión activa. state.user/email/plan/isPro pueblan.
 *
 * Flujo (idéntico a web/app/login/login-form.jsx):
 *   requestCode(email)        → auth.signInWithOtp({ shouldCreateUser: true })
 *   verifyCode(email, code)   → auth.verifyOtp({ type: 'email' })
 *   refreshPlan()             → SELECT de licenses (RLS: solo las propias)
 *
 * Errores: SIEMPRE códigos estables ('rate_limit' | 'invalid_code' |
 * 'expired_code' | 'invalid_email' | 'network' | 'unknown') — la UI los
 * traduce via i18n (account.err.*). Jamás exponemos el message crudo de
 * Supabase al usuario.
 *
 * Plan gating: isPro = existe una licencia active/trialing con plan
 * distinto de 'free' (pro_monthly | pro_yearly | lifetime). Sin licencia
 * o con plan 'free' ⇒ Free. Si el SELECT falla (red), conservamos el
 * último plan conocido — degradar a Free por un blip de red castigaría
 * a un usuario Pro legítimo.
 */
import { getSupabase } from './supabaseClient.js'
import { isSupabaseConfigured } from './supabaseConfig.js'

export const AccountStatus = Object.freeze({
  UNCONFIGURED: 'unconfigured',
  LOADING: 'loading',
  SIGNED_OUT: 'signedOut',
  PENDING_CODE: 'pendingCode',
  SIGNED_IN: 'signedIn',
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const _initialState = Object.freeze({
  status: AccountStatus.SIGNED_OUT,
  email: null,
  user: null,
  plan: null,
  isPro: false,
  error: null,
})

let _state = { ..._initialState }
let _snapshot = _state
const _listeners = new Set()
let _initPromise = null
let _authSubscription = null

function _notify() {
  _snapshot = { ..._state }
  for (const fn of _listeners) {
    try {
      fn(_snapshot)
    } catch {
      // un listener roto no rompe el resto
    }
  }
}

function _set(patch) {
  _state = { ..._state, ...patch }
  _notify()
}

/* ============================================================== */
/* Mapeo de errores Supabase → códigos estables                   */
/* ============================================================== */

/**
 * Reduce cualquier error (AuthApiError, TypeError de fetch, ...) a un
 * código estable para i18n. Exportada para tests.
 */
export function mapAuthError(err) {
  if (!err) return null
  const status = typeof err.status === 'number' ? err.status : null
  const code = typeof err.code === 'string' ? err.code : ''
  const msg = String(err.message || '').toLowerCase()

  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit'
    || msg.includes('rate limit') || msg.includes('too many')) {
    return 'rate_limit'
  }
  if (code === 'otp_expired' || msg.includes('expired')) return 'expired_code'
  if (code === 'otp_disabled' || msg.includes('otp') || msg.includes('token')
    || msg.includes('invalid login') || msg.includes('invalid code')) {
    return 'invalid_code'
  }
  if (err.name === 'TypeError' || code === 'network_error'
    || msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network'
  }
  return 'unknown'
}

/* ============================================================== */
/* API pública                                                    */
/* ============================================================== */

/** Snapshot inmutable para useSyncExternalStore. */
function getSnapshot() {
  return _snapshot
}

/**
 * Suscripción a cambios de estado.
 * @returns {() => void} unsubscribe
 */
function subscribe(cb) {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

/**
 * Restaura la sesión persistida + plan, y engancha onAuthStateChange.
 * Idempotente (la 2.ª llamada devuelve la misma promesa). Nunca lanza —
 * useBootstrap lo dispara fire-and-forget sin bloquear `ready`.
 */
function init() {
  // La memoizacion incluye el camino de error: un fallo transitorio del
  // restore NO se reintenta en la vida de la app (queda en signedOut).
  // Tradeoff deliberado de idempotencia para un fire-and-forget de boot.
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    if (!isSupabaseConfigured()) {
      _set({ status: AccountStatus.UNCONFIGURED })
      return
    }
    _set({ status: AccountStatus.LOADING })
    try {
      const supabase = await getSupabase()
      if (!supabase) {
        _set({ status: AccountStatus.UNCONFIGURED })
        return
      }
      const { data } = await supabase.auth.getSession()
      const session = data?.session ?? null
      if (session?.user) {
        _set({
          status: AccountStatus.SIGNED_IN,
          user: session.user,
          email: session.user.email ?? null,
          error: null,
        })
        await refreshPlan()
      } else {
        _set({ status: AccountStatus.SIGNED_OUT })
      }
      // Mantener el estado sincronizado con refresh de token / signOut
      // en otra pestaña (PWA). El listener vive lo que viva la app.
      const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT') {
          _set({ ..._initialState, status: AccountStatus.SIGNED_OUT })
        } else if (newSession?.user) {
          const wasSignedIn = _state.status === AccountStatus.SIGNED_IN
          _set({
            status: AccountStatus.SIGNED_IN,
            user: newSession.user,
            email: newSession.user.email ?? null,
          })
          // Primer sign-in detectado fuera de verifyCode (p.ej. restore
          // tardío) → poblar plan en background.
          if (!wasSignedIn) refreshPlan()
        }
      })
      _authSubscription = sub?.subscription ?? null
    } catch (e) {
      console.warn('[account] init failed:', e?.message || e)
      _set({ status: AccountStatus.SIGNED_OUT, error: mapAuthError(e) })
    }
  })()
  return _initPromise
}

/**
 * Sanitiza el email (trim + lowercase + formato). null si es inválido.
 * Exportada para tests.
 */
export function sanitizeEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : null
}

/**
 * Paso 1 del login: pide a Supabase que envíe el código de 6 dígitos.
 * Éxito ⇒ status 'pendingCode' (state.email queda fijado para verify).
 * @returns {Promise<{ok: boolean, error: string|null}>}
 */
async function requestCode(rawEmail) {
  const email = sanitizeEmail(rawEmail)
  if (!email) {
    _set({ error: 'invalid_email' })
    return { ok: false, error: 'invalid_email' }
  }
  try {
    const supabase = await getSupabase()
    if (!supabase) {
      _set({ status: AccountStatus.UNCONFIGURED })
      return { ok: false, error: 'unknown' }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    if (error) {
      const code = mapAuthError(error)
      _set({ error: code })
      return { ok: false, error: code }
    }
    _set({ status: AccountStatus.PENDING_CODE, email, error: null })
    return { ok: true, error: null }
  } catch (e) {
    const code = mapAuthError(e)
    _set({ error: code })
    return { ok: false, error: code }
  }
}

/**
 * Paso 2: verifica el código OTP. Éxito ⇒ 'signedIn' + refreshPlan().
 * @returns {Promise<{ok: boolean, error: string|null}>}
 */
async function verifyCode(rawEmail, rawCode) {
  const email = sanitizeEmail(rawEmail ?? _state.email)
  const token = String(rawCode ?? '').replace(/\D/g, '')
  if (!email || token.length !== 6) {
    _set({ error: 'invalid_code' })
    return { ok: false, error: 'invalid_code' }
  }
  try {
    const supabase = await getSupabase()
    if (!supabase) {
      _set({ status: AccountStatus.UNCONFIGURED })
      return { ok: false, error: 'unknown' }
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      const code = mapAuthError(error)
      _set({ error: code })
      return { ok: false, error: code }
    }
    const user = data?.user ?? data?.session?.user ?? null
    _set({
      status: AccountStatus.SIGNED_IN,
      user,
      email: user?.email ?? email,
      error: null,
    })
    await refreshPlan()
    return { ok: true, error: null }
  } catch (e) {
    const code = mapAuthError(e)
    _set({ error: code })
    return { ok: false, error: code }
  }
}

/**
 * Lee la licencia vigente del usuario (RLS limita a las propias):
 * la más reciente con status active/trialing. Sin filas ⇒ plan 'free'.
 * Fallo de red ⇒ conserva el último plan conocido (ver doc-block).
 * @returns {Promise<{plan: string, isPro: boolean}>}
 */
async function refreshPlan() {
  try {
    const supabase = await getSupabase()
    if (!supabase || _state.status !== AccountStatus.SIGNED_IN) {
      return { plan: _state.plan ?? 'free', isPro: _state.isPro }
    }
    const { data, error } = await supabase
      .from('licenses')
      .select('plan,status,current_period_end')
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    const plan = row?.plan ?? 'free'
    const isPro = Boolean(row) && plan !== 'free'
    _set({ plan, isPro })
    return { plan, isPro }
  } catch (e) {
    console.warn('[account] refreshPlan failed:', e?.message || e)
    return { plan: _state.plan ?? 'free', isPro: _state.isPro }
  }
}

/**
 * Cierra la sesión local y remota. Aunque la llamada remota falle,
 * el estado local SIEMPRE termina en 'signedOut' (el usuario pidió
 * salir; no lo dejamos atrapado por un blip de red).
 */
async function signOut() {
  try {
    const supabase = await getSupabase()
    if (supabase) await supabase.auth.signOut()
  } catch (e) {
    console.warn('[account] signOut failed:', e?.message || e)
  }
  _set({ ..._initialState, status: AccountStatus.SIGNED_OUT })
}

/** Vuelve de 'pendingCode' al form de email (cambiar de correo). */
function backToEmail() {
  _set({ status: AccountStatus.SIGNED_OUT, error: null })
}

/** Solo tests: estado prístino + sin listeners ni init memoizado. */
function __resetForTests() {
  try {
    _authSubscription?.unsubscribe?.()
  } catch {
    // ignore
  }
  _authSubscription = null
  _initPromise = null
  _state = { ..._initialState }
  _snapshot = _state
  _listeners.clear()
}

export const account = {
  subscribe,
  getSnapshot,
  init,
  requestCode,
  verifyCode,
  refreshPlan,
  signOut,
  backToEmail,
  __resetForTests,
}
