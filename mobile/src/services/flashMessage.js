/**
 * flashMessage.js (C2)
 *
 * Mensaje one-shot entre pantallas (patrón "flash" clásico): el editor
 * de canciones lo setea antes de navegar a /songs y SongsScreen lo
 * consume al montar para mostrar el toast de éxito.
 *
 * Por qué NO location.state: los tests existentes de SongsScreen mockean
 * react-router-dom solo con useNavigate; añadir useLocation a la pantalla
 * rompería 14 tests verdes por una sola string. Un módulo de 10 líneas
 * es más barato y igual de fiable (misma sesión de JS, no persiste).
 */
let _message = null

/** Deja un mensaje para la próxima pantalla que lo consuma. */
export function setFlash(message) {
  _message = typeof message === 'string' && message ? message : null
}

/** Devuelve el mensaje pendiente (o null) y lo limpia. */
export function consumeFlash() {
  const m = _message
  _message = null
  return m
}
