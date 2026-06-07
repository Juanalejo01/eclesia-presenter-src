/**
 * slideTheme.js
 *
 * Defaults + helpers PUROS para reconstruir el look del slide proyectado
 * dentro del mando móvil. El server (desktop) emite `pgm-update-theme`
 * con la misma shape que maneja /src/renderer del desktop; aquí
 * mantenemos un subset (sin image/video, sin shadows complejos) porque
 * el preview vive en una card de ~320 px de ancho.
 *
 * Por qué este módulo es puro: queremos testearlo en el project "node"
 * de Jest sin DOM. El componente `PgmPreview` se encarga del layout y
 * la medida del contenedor; este módulo SOLO calcula estilos.
 *
 * Edge cases cubiertos:
 *   - Theme parcial → se mergea con DEFAULT_THEME, claves null se ignoran.
 *   - bgType `image` / `video` → fallback al gradient (no descargamos
 *     media en el mando: ahorro de batería + privacidad).
 *   - bgType desconocido → gradient default (defensivo).
 *   - containerW no provisto o 0 → fallback a 360 px (viewport mobile típico).
 *
 * NO hace XSS sanitization de strings de color: React escapa al setear
 * style (no inyecta literalmente), y los strings llegan del server
 * autenticado vía WebSocket — confiamos en él.
 */

export const DEFAULT_THEME = Object.freeze({
  // Background
  bgType: 'gradient',                    // 'solid' | 'gradient' | 'image' | 'video' | 'transparent'
  bgColor: '#0a0706',                    // si bgType==='solid'
  bgGradient: ['#14100d', '#1a1410'],    // 2 colores si bgType==='gradient'
  bgImage: null,                         // URL si bgType==='image' (no soportada todavía → fallback gradient)
  bgVideo: null,                         // URL si bgType==='video' (idem)
  // Tipografía principal
  fontFamily: '"Cormorant Garamond", Georgia, serif',
  fontSize: 64,                          // px en proyección 1920x1080 → escalar al preview
  fontColor: '#f4e6d7',
  fontWeight: 500,
  fontStyle: 'normal',                   // 'normal' | 'italic'
  letterSpacing: 0,                      // em
  textTransform: 'none',                 // 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textAlign: 'center',                   // 'left' | 'center' | 'right'
  textShadow: false,
  strokeWidth: 0,
  strokeColor: '#000000',
  // Reference
  referenceVisible: true,
  referenceColor: '#c8794a',
  referenceUppercase: true,
  referenceSize: 'md',                   // 'sm'|'md'|'lg'|'xl' — mismas 4 escalas que el desktop
  // Layout
  textMargin: 64,                        // px de margen lateral en 1920 base
})

/**
 * Merge defensivo: solo claves esperadas. Ignora extras inesperados y
 * descarta `null`/`undefined` (preservan default). Devuelve un objeto
 * nuevo (no muta DEFAULT_THEME).
 *
 * @param {object|null|undefined} partial
 * @returns {object} theme completo
 */
export function mergeTheme(partial) {
  const merged = { ...DEFAULT_THEME }
  if (!partial || typeof partial !== 'object') return merged
  for (const key of Object.keys(DEFAULT_THEME)) {
    if (partial[key] !== undefined && partial[key] !== null) {
      merged[key] = partial[key]
    }
  }
  return merged
}

/**
 * Deriva el style CSS-in-JS del fondo del preview 16:9.
 * @param {object} theme — full o parcial; se mergea internamente.
 * @returns {object} style listo para spread en JSX.
 */
export function deriveBgStyle(theme) {
  const t = mergeTheme(theme)
  switch (t.bgType) {
    case 'solid':
      return { background: t.bgColor || DEFAULT_THEME.bgColor }
    case 'transparent':
      // Checkerboard sutil para indicar "transparente" sin confundir
      // con un slide en blanco.
      return {
        background:
          'repeating-conic-gradient(#222 0% 25%, #2d2d2d 0% 50%) 50% / 16px 16px',
      }
    case 'image':
    case 'video':
      // Fallback al gradient: no descargamos media en el mando.
      return _gradientStyle(t)
    case 'gradient':
    default:
      return _gradientStyle(t)
  }
}

function _gradientStyle(t) {
  const colors =
    Array.isArray(t.bgGradient) && t.bgGradient.length >= 2
      ? t.bgGradient
      : DEFAULT_THEME.bgGradient
  return {
    background: `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
  }
}

// Factor de visibilidad: el preview es chico, queremos legibilidad.
// 64 px @ 1920 → 64/1920 ≈ 3.33% del slide. En un preview de ~320 px
// resulta ~10.6 px que es muy pequeño en mobile; multiplicamos x1.4
// para que la sensación de tamaño relativo se mantenga sin que el
// texto se vuelva ilegible.
const VISIBILITY_FACTOR = 1.4
const FALLBACK_CONTAINER_W = 360

/**
 * Calcula el style del texto principal del slide proporcional al
 * contenedor real medido del preview.
 *
 * @param {object} theme
 * @param {number} containerW — ancho del contenedor en px (0/undefined
 *                              cae al fallback).
 * @returns {object} style listo para spread en JSX.
 */
export function deriveTextStyle(theme, containerW) {
  const t = mergeTheme(theme)
  const w =
    typeof containerW === 'number' && containerW > 0
      ? containerW
      : FALLBACK_CONTAINER_W
  const fontSizePx = (t.fontSize / 1920) * w * VISIBILITY_FACTOR
  const strokePx =
    t.strokeWidth > 0
      ? (t.strokeWidth / 1920) * w * VISIBILITY_FACTOR
      : 0
  const marginPct = (t.textMargin / 1920) * 100
  return {
    fontFamily: t.fontFamily,
    color: t.fontColor,
    fontSize: `${fontSizePx.toFixed(1)}px`,
    fontWeight: t.fontWeight,
    fontStyle: t.fontStyle,
    letterSpacing: `${t.letterSpacing}em`,
    textTransform: t.textTransform,
    textAlign: t.textAlign,
    paddingLeft: `${marginPct.toFixed(2)}%`,
    paddingRight: `${marginPct.toFixed(2)}%`,
    textShadow: t.textShadow ? '0 2px 8px rgba(0,0,0,0.6)' : 'none',
    WebkitTextStroke:
      strokePx > 0 ? `${strokePx.toFixed(1)}px ${t.strokeColor}` : 'none',
  }
}

// Mismas proporciones que el desktop SlideRenderer.
const REF_RATIO = Object.freeze({ sm: 0.20, md: 0.25, lg: 0.33, xl: 0.50 })

/**
 * Style de la línea de referencia. Devuelve null si el theme la oculta.
 *
 * @param {object} theme
 * @param {number} containerW
 * @returns {object|null}
 */
export function deriveReferenceStyle(theme, containerW) {
  const t = mergeTheme(theme)
  if (!t.referenceVisible) return null
  const w =
    typeof containerW === 'number' && containerW > 0
      ? containerW
      : FALLBACK_CONTAINER_W
  const baseSize = (t.fontSize / 1920) * w * VISIBILITY_FACTOR
  const ratio = REF_RATIO[t.referenceSize] || REF_RATIO.md
  const refSize = baseSize * ratio
  return {
    color: t.referenceColor,
    fontSize: `${refSize.toFixed(1)}px`,
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    textTransform: t.referenceUppercase ? 'uppercase' : 'none',
    letterSpacing: '0.10em',
    opacity: 0.92,
  }
}

/**
 * Clasifica el slide para decidir qué renderer aplicar:
 *   - 'empty'    → null o sin texto/reference (y no es estado especial)
 *   - 'blackout' → type === 'blackout'
 *   - 'blank'    → type === 'blank' (sin texto)
 *   - 'content'  → tiene texto o reference
 *
 * @param {object|null|undefined} slide
 * @returns {'empty'|'blackout'|'blank'|'content'}
 */
export function classifySlide(slide) {
  if (!slide) return 'empty'
  if (slide.type === 'blackout') return 'blackout'
  if (slide.type === 'blank' && !slide.text) return 'blank'
  if (!slide.text && !slide.reference) return 'empty'
  return 'content'
}
