// Clasificación de errores del auto-updater a mensajes amigables.
//
// electron-updater lanza errores con mensajes CRUDOS multilínea (HttpError con
// URL, JSON de headers y stack trace). Eso no se puede enseñar al usuario en
// Ajustes → Acerca de. Este módulo es PURO (sin dependencias de Electron) para
// poder testearlo con Jest sin mocks.
//
// Devuelve { code, friendly, detail }:
//   - code:     identificador corto estable ('no_feed' | 'offline' | 'rate_limited' | 'unknown')
//   - friendly: 1 frase en español, sin saltos de línea, lista para renderizar
//   - detail:   el mensaje crudo completo (para el <details> "Detalles técnicos")

const FRIENDLY = {
  no_feed:
    'No se pudo comprobar la actualización. Inténtalo más tarde o descarga la última versión desde la página de descargas.',
  offline:
    'Sin conexión a internet. Comprueba tu red e inténtalo de nuevo.',
  rate_limited:
    'Demasiadas comprobaciones seguidas. Espera unos minutos.',
  unknown:
    'No se pudo comprobar la actualización.',
}

/**
 * Saca la primera línea no vacía de un mensaje crudo, truncada a maxLen chars.
 * Usada para dar UN detalle técnico breve en el caso 'unknown' (nunca el stack).
 */
function firstLine(raw, maxLen = 120) {
  const line = String(raw || '').split('\n').map(s => s.trim()).find(Boolean) || ''
  return line.length > maxLen ? line.slice(0, maxLen - 1) + '…' : line
}

/**
 * Clasifica un error de electron-updater (Error | string | cualquier cosa).
 * @returns {{ code: string, friendly: string, detail: string }}
 */
function classifyUpdaterError(err) {
  const raw = (err && (err.message || (typeof err === 'string' ? err : String(err)))) || ''

  // Feed de updates roto: el release "latest" de GitHub no tiene latest.yml
  // (ej. un release mobile-v* marcado como Latest). electron-updater dice
  // "HttpError: 404 ... latest.yml" o "Cannot find latest.yml ...".
  const mentionsFeed = /latest\.yml|app-update\.yml/i.test(raw)
  if (mentionsFeed && (/\b404\b/.test(raw) || /cannot find/i.test(raw))) {
    return { code: 'no_feed', friendly: FRIENDLY.no_feed, detail: raw }
  }

  // Errores de red — sin DNS, sin conexión, timeouts, errores net:: de Chromium.
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_CONNECTION|net::/i.test(raw)) {
    return { code: 'offline', friendly: FRIENDLY.offline, detail: raw }
  }

  // Rate limit de GitHub (API anónima) o 403 genérico.
  if (/\b403\b|rate limit/i.test(raw)) {
    return { code: 'rate_limited', friendly: FRIENDLY.rate_limited, detail: raw }
  }

  // Default: mensaje genérico + 1 línea de detalle técnico (NUNCA el stack).
  const brief = firstLine(raw)
  return {
    code: 'unknown',
    friendly: brief ? `${FRIENDLY.unknown} (${brief})` : FRIENDLY.unknown,
    detail: raw,
  }
}

module.exports = { classifyUpdaterError, firstLine, FRIENDLY }
