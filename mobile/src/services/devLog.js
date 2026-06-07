/**
 * devLog.js
 *
 * Detección de modo desarrollo + helper de logging condicional, único
 * para todo el bundle del mando. Reemplaza el patrón anterior basado
 * en `new Function('return import.meta.env')` (que viola CSP estricta
 * `script-src 'self'` y dispara warnings en algunos WebViews).
 *
 * Estrategia:
 *   - En Vite (build/dev) `import.meta.env.DEV` es reemplazado en
 *     tiempo de build por el bundler — el access path se queda como
 *     `true` o `false` literal en el JS final. No requiere runtime
 *     eval ni `new Function`.
 *   - En Jest CJS, `import.meta` no se puede parsear con
 *     `@babel/preset-env` por defecto (es ES2020+). Por eso NO usamos
 *     `import.meta` directamente en este archivo: confiamos sólo en
 *     `process.env.NODE_ENV !== 'production'` que es seguro en Jest
 *     (donde Jest setea NODE_ENV='test') y también funciona en runtime
 *     Node si algún día migramos algún módulo.
 *   - En el bundle mobile final (Capacitor WebView), `process` no
 *     existe — Vite hace tree-shake del branch porque
 *     `process.env.NODE_ENV` se reemplaza estáticamente. Si por
 *     cualquier razón no se reemplaza, el typeof guard evita
 *     ReferenceError.
 *
 * Resultado: IS_DEV === true cuando Jest corre o NODE_ENV === 'development';
 * false en producción. Sin `new Function`, sin `eval`.
 */

let _isDev = false
try {
  if (
    typeof process !== 'undefined' &&
    process &&
    process.env &&
    process.env.NODE_ENV !== 'production'
  ) {
    _isDev = true
  }
} catch {
  // Si `process` está undefined en algún WebView extraño, dejamos false.
  _isDev = false
}

export const IS_DEV = _isDev

/**
 * Log condicional — sólo imprime en DEV. Misma firma que console.log.
 * Lo usamos para trazas de debugging del transport y los hooks PGM.
 */
export function debug(...args) {
  if (_isDev) {
    // eslint-disable-next-line no-console
    console.log(...args)
  }
}
