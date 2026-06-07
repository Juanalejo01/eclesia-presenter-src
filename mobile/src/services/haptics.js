/**
 * haptics.js
 *
 * Wrapper fino sobre Capacitor Haptics. En web (PWA/dev) el plugin no
 * resuelve, así que caemos a `navigator.vibrate()` (Android Chrome lo
 * soporta, Safari iOS no). Si ninguna API está disponible, no-op.
 *
 * Por qué este wrapper: cada call-site del remoto (next/prev, blank,
 * etc.) quiere "vibra un poco" sin importarle el runtime. Centralizar la
 * detección aquí evita repetir el try/catch de import dinámico en cada
 * handler y hace que un upgrade futuro del plugin sea de una sola línea.
 *
 * Fire-and-forget: las funciones son async pero el caller no necesita
 * `await`. Una promesa pendiente del impacto no debe bloquear el envío
 * del comando WebSocket — el feedback táctil es ornamental.
 *
 * Edge cases:
 *   - El import dinámico de @capacitor/haptics puede rechazar en web
 *     sin Capacitor: lo capturamos y degradamos a vibrate().
 *   - `navigator.vibrate` lanza si el documento no tiene user gesture
 *     reciente: lo envolvemos en try/catch silencioso.
 *   - El init se memoiza: primer call paga el dynamic import, llamadas
 *     siguientes son síncronas (módulo ya en memoria).
 */

// 'capacitor' | 'web' | 'none' | null=lazy (primer call resuelve)
let _hapticsImpl = null

async function _initHaptics() {
  if (_hapticsImpl !== null) return _hapticsImpl
  try {
    const mod = await import('@capacitor/haptics')
    if (mod && mod.Haptics) {
      _hapticsImpl = {
        type: 'capacitor',
        Haptics: mod.Haptics,
        ImpactStyle: mod.ImpactStyle,
      }
      return _hapticsImpl
    }
  } catch {
    // No estamos en Capacitor o el plugin no se pudo cargar.
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    _hapticsImpl = { type: 'web' }
  } else {
    _hapticsImpl = { type: 'none' }
  }
  return _hapticsImpl
}

/**
 * Toque ligero — para acciones frecuentes (next/prev de slide).
 * Equivale a ImpactStyle.Light en Capacitor o navigator.vibrate(10).
 */
export async function tapLight() {
  try {
    const h = await _initHaptics()
    if (h.type === 'capacitor') {
      try { await h.Haptics.impact({ style: h.ImpactStyle.Light }) } catch { /* ignore */ }
    } else if (h.type === 'web') {
      try { navigator.vibrate(10) } catch { /* ignore */ }
    }
  } catch { /* never throw from haptics */ }
}

/**
 * Toque medio — para acciones de mayor compromiso (blank/black/clear).
 * Equivale a ImpactStyle.Medium en Capacitor o navigator.vibrate(20).
 */
export async function tapMedium() {
  try {
    const h = await _initHaptics()
    if (h.type === 'capacitor') {
      try { await h.Haptics.impact({ style: h.ImpactStyle.Medium }) } catch { /* ignore */ }
    } else if (h.type === 'web') {
      try { navigator.vibrate(20) } catch { /* ignore */ }
    }
  } catch { /* never throw from haptics */ }
}

/**
 * Hook para tests: resetea el cache de detección.
 * NO usar en código de producción.
 */
export function __resetHapticsForTests() {
  _hapticsImpl = null
}
