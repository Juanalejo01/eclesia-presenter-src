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
 * SEGURIDAD — validación de strings:
 *   Aunque React no permite inyectar HTML al setear style (objeto),
 *   CSS-in-JS pasa el valor tal cual a `element.style[prop]`. Un valor
 *   como `'red; background-image: url(https://evil/)'` puede ser
 *   ignorado por algunos motores, pero `linear-gradient(135deg, RED,
 *   #000)` con RED = `'red; url(...)'` interpola el string dentro de
 *   un valor CSS y abre superficie de injection (background-image
 *   trackers, SSRF en algunos webviews). Validamos TODOS los strings
 *   que recibimos del server antes de aceptarlos en `mergeTheme`. Si
 *   un valor no pasa la validación cae al default — silencioso a
 *   propósito: un theme corrupto no debe tumbar el preview.
 */

// Set conocido de CSS named colors aceptados. No es exhaustivo (la
// spec tiene ~150) pero cubre los que el desktop puede emitir.
const COLOR_NAMES = new Set([
  'transparent', 'currentcolor', 'black', 'white', 'red', 'green', 'blue',
  'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'gold',
  'brown', 'navy', 'teal', 'cyan', 'magenta', 'lime', 'olive', 'maroon',
  'aqua', 'fuchsia',
])

// Whitelists de valores enum: rechazamos cualquier cosa fuera.
const ALLOWED_BG_TYPE = new Set(['solid', 'gradient', 'image', 'video', 'transparent'])
const ALLOWED_FONT_STYLE = new Set(['normal', 'italic'])
const ALLOWED_TEXT_TRANSFORM = new Set(['none', 'uppercase', 'lowercase', 'capitalize'])
const ALLOWED_TEXT_ALIGN = new Set(['left', 'center', 'right'])
const ALLOWED_REFERENCE_SIZE = new Set(['sm', 'md', 'lg', 'xl'])

// Regex que detecta caracteres prohibidos en CUALQUIER valor CSS que
// vayamos a interpolar: separadores de declaración, llaves, comparadores
// HTML, newlines y las funciones CSS peligrosas (`url()`, `expression()`,
// `image-set()` que también puede hacer fetch). `var()` también queda
// fuera porque permite indirección a tokens no controlados.
const FORBIDDEN_CSS = /[;{}<>\n\r]|url\s*\(|expression\s*\(|image-set\s*\(|var\s*\(/i

function _isValidColor(v) {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s || s.length > 100) return false
  if (FORBIDDEN_CSS.test(s)) return false
  // Hex 3/6/8 dígitos
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true
  // rgb/rgba/hsl/hsla con todo dentro de los paréntesis (no functions
  // anidadas — los chars permitidos dentro son sólo dígitos, signos
  // de porcentaje, comas, espacios, puntos, barras, signos).
  if (/^(rgb|rgba|hsl|hsla)\([0-9.,\s%/-]+\)$/i.test(s)) return true
  // CSS named color
  if (COLOR_NAMES.has(s.toLowerCase())) return true
  return false
}

function _isValidFontFamily(v) {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s || s.length > 200) return false
  if (FORBIDDEN_CSS.test(s)) return false
  // Solo caracteres "razonables" para font-family — letras, números,
  // espacios, comas, guiones, underscores y comillas (para fuentes con
  // espacios como "Cormorant Garamond"). NO permitimos paréntesis para
  // bloquear cualquier función CSS.
  return /^[a-zA-Z0-9 ,\-_'"]+$/.test(s)
}

function _isValidUrl(v) {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s || s.length > 2000) return false
  // http/https sólo, sin caracteres extraños que cierren un atributo CSS.
  if (FORBIDDEN_CSS.test(s)) return false
  return /^https?:\/\/[^\s"'<>]+$/i.test(s)
}

// Coerce a number con clamp. Rechaza NaN/Infinity → devuelve default.
function _coerceNumber(v, defaultV, { min = -Infinity, max = Infinity } = {}) {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return defaultV
  return Math.max(min, Math.min(max, n))
}

export const DEFAULT_THEME = Object.freeze({
  // Background
  bgType: 'gradient',                                  // 'solid' | 'gradient' | 'image' | 'video' | 'transparent'
  bgColor: '#0a0706',                                  // si bgType==='solid'
  bgGradient: Object.freeze(['#14100d', '#1a1410']),   // 2 colores si bgType==='gradient'
  bgImage: null,                                       // URL si bgType==='image' (no soportada todavía → fallback gradient)
  bgVideo: null,                                       // URL si bgType==='video' (idem)
  // Tipografía principal
  fontFamily: '"Cormorant Garamond", Georgia, serif',
  fontSize: 64,                                        // px en proyección 1920x1080 → escalar al preview
  fontColor: '#f4e6d7',
  fontWeight: 500,
  fontStyle: 'normal',                                 // 'normal' | 'italic'
  letterSpacing: 0,                                    // em
  textTransform: 'none',                               // 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textAlign: 'center',                                 // 'left' | 'center' | 'right'
  textShadow: false,
  strokeWidth: 0,
  strokeColor: '#000000',
  // Reference
  referenceVisible: true,
  referenceColor: '#c8794a',
  referenceUppercase: true,
  referenceSize: 'md',                                 // 'sm'|'md'|'lg'|'xl' — mismas 4 escalas que el desktop
  // Layout
  textMargin: 64,                                      // px de margen lateral en 1920 base
})

/**
 * Merge defensivo: solo claves esperadas. Cada valor se valida por tipo
 * (color, font-family, número con clamp, enum). Si no pasa, se mantiene
 * el default. Ignora claves extra y `null`/`undefined`.
 *
 * @param {object|null|undefined} partial
 * @returns {object} theme completo y seguro
 */
export function mergeTheme(partial) {
  // Empezamos copiando defaults (incluido bgGradient frozen → lo
  // descongelamos abajo si llega un override válido).
  const out = { ...DEFAULT_THEME }
  // bgGradient hereda el frozen array; siempre devolvemos una copia
  // mutable a quien consume el theme, por consistencia con el resto
  // de keys.
  out.bgGradient = [...DEFAULT_THEME.bgGradient]
  if (!partial || typeof partial !== 'object') return out

  for (const key of Object.keys(DEFAULT_THEME)) {
    const v = partial[key]
    if (v === undefined || v === null) continue

    switch (key) {
      case 'bgColor':
      case 'fontColor':
      case 'referenceColor':
      case 'strokeColor':
        if (_isValidColor(v)) out[key] = v
        break
      case 'bgGradient':
        if (Array.isArray(v) && v.length >= 2 && v.every(_isValidColor)) {
          // Copia explícita: nunca compartimos referencia con el input
          // (evita mutaciones externas posteriores).
          out[key] = [v[0], v[1]]
        }
        break
      case 'fontFamily':
        if (_isValidFontFamily(v)) out[key] = v
        break
      case 'fontSize':
        out[key] = _coerceNumber(v, DEFAULT_THEME.fontSize, { min: 8, max: 400 })
        break
      case 'strokeWidth':
        out[key] = _coerceNumber(v, DEFAULT_THEME.strokeWidth, { min: 0, max: 50 })
        break
      case 'textMargin':
        out[key] = _coerceNumber(v, DEFAULT_THEME.textMargin, { min: 0, max: 1000 })
        break
      case 'letterSpacing':
        out[key] = _coerceNumber(v, DEFAULT_THEME.letterSpacing, { min: -0.5, max: 2 })
        break
      case 'fontWeight':
        out[key] = _coerceNumber(v, DEFAULT_THEME.fontWeight, { min: 100, max: 900 })
        break
      case 'bgType':
        if (typeof v === 'string' && ALLOWED_BG_TYPE.has(v)) out[key] = v
        break
      case 'fontStyle':
        if (typeof v === 'string' && ALLOWED_FONT_STYLE.has(v)) out[key] = v
        break
      case 'textTransform':
        if (typeof v === 'string' && ALLOWED_TEXT_TRANSFORM.has(v)) out[key] = v
        break
      case 'textAlign':
        if (typeof v === 'string' && ALLOWED_TEXT_ALIGN.has(v)) out[key] = v
        break
      case 'referenceSize':
        if (typeof v === 'string' && ALLOWED_REFERENCE_SIZE.has(v)) out[key] = v
        break
      case 'textShadow':
      case 'referenceVisible':
      case 'referenceUppercase':
        if (typeof v === 'boolean') out[key] = v
        break
      case 'bgImage':
      case 'bgVideo':
        // No los usamos (fallback gradient), pero si llegan validamos
        // que sean URLs http(s) sin caracteres CSS-breakers.
        if (_isValidUrl(v)) out[key] = v
        break
      default:
        // Cualquier otra key (no debería pasar) se ignora.
        break
    }
  }
  return out
}

/**
 * Deriva el style CSS-in-JS del fondo del preview 16:9.
 *
 * IMPORTANTE: las funciones derive* asumen que reciben un theme YA
 * mergeado (post-mergeTheme). Si reciben un parcial, hacen merge
 * defensivo, pero el caller idiomático en componentes React debe
 * memoizar `mergeTheme(theme)` una sola vez y pasar ese objeto.
 *
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
  // Copia defensiva del array: nunca pasamos el frozen DEFAULT_THEME
  // como referencia al motor CSS.
  const valid =
    Array.isArray(t.bgGradient) && t.bgGradient.length >= 2 &&
    t.bgGradient.every(_isValidColor)
  const colors = valid
    ? [t.bgGradient[0], t.bgGradient[1]]
    : [DEFAULT_THEME.bgGradient[0], DEFAULT_THEME.bgGradient[1]]
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
