'use strict'

// Saneo del theme de proyección — lógica PURA (testeable sin Electron).
// Repara estados de theme que producen "pantalla negra" en el proyector.

// ¿Un color hex (#rrggbb) es casi-negro? (suma de canales muy baja)
function isNearBlack(hex) {
  if (typeof hex !== 'string') return false
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return false
  const n = parseInt(m[1], 16)
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) < 30
}

/**
 * Repara `theme` usando `defaults` para los campos que haya que resetear.
 *   · limpia media huérfana (bgVideo/bgImage de un bgType que ya no es ese)
 *   · resetea fondo efectivamente negro (sólido casi-negro, o degradado con
 *     AMBOS extremos casi-negros) o bgType image/video sin archivo
 *   · repara fontColor/fontSize ausentes o inválidos
 * Respeta elecciones válidas del usuario: un degradado oscuro pero con color
 * (p.ej. teal→marrón) NO se toca.
 */
function sanitizeTheme(theme, defaults) {
  const d = defaults || {}
  const out = { ...theme }

  // Media huérfana — no cambia nada visible, evita negro si luego cambian bgType.
  if (out.bgType !== 'video') out.bgVideo = null
  if (out.bgType !== 'image') out.bgImage = null

  const blackSolid = out.bgType === 'solid' && isNearBlack(out.bgColor)
  const blackGradient = out.bgType === 'gradient' && Array.isArray(out.bgGradient) &&
    out.bgGradient.length >= 2 && isNearBlack(out.bgGradient[0]) && isNearBlack(out.bgGradient[1])
  const missingMediaBg =
    (out.bgType === 'image' && !out.bgImage) || (out.bgType === 'video' && !out.bgVideo)

  if (!out.bgType || blackSolid || blackGradient || missingMediaBg) {
    out.bgType = d.bgType; out.bgColor = d.bgColor; out.bgGradient = d.bgGradient
    out.bgImage = null; out.bgVideo = null
  }

  if (!out.fontColor || typeof out.fontColor !== 'string') out.fontColor = d.fontColor
  if (!out.fontSize || out.fontSize < 8) out.fontSize = d.fontSize
  return out
}

module.exports = { sanitizeTheme, isNearBlack }
