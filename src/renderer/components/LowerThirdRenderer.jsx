import SlideTransition from './SlideTransition.jsx'
import { DEFAULT_OVERLAY } from '../services/themeStore.js'

/**
 * Renderizador del lower-third.
 *
 * Usa container queries (cqw) para escalar proporcionalmente al contenedor padre.
 * Los valores numéricos del overlay (fontSize, offsets, borderWidth, etc.) están
 * calibrados para 1920×1080 (la ventana real de proyección). En el preview del
 * editor (ej. 720×405), todo escala automáticamente al ratio del contenedor.
 *
 * IMPORTANTE: el wrapper top-level usa `position: absolute, inset: 0`
 * (NO fixed) para funcionar tanto dentro del preview como en la ventana real.
 */
export default function LowerThirdRenderer({ slide, theme }) {
  const o = { ...DEFAULT_OVERLAY, ...(theme?.overlay || {}) }
  const isBlank = !slide || slide.type === 'blank' || slide.type === 'blackout'

  // px de diseño (1920px ref) → cqw (% del ancho del contenedor)
  const px = (n) => `${(n / 1920) * 100}cqw`

  // Fondo de la banda
  const bandBackground = !o.bgEnabled
    ? 'transparent'
    : o.bgType === 'gradient'
      ? `linear-gradient(180deg, ${o.bgGradient[0]} 0%, ${o.bgGradient[1]} 100%)`
      : o.bgType === 'solid'
        ? o.bgColor
        : 'transparent'

  // Borde de acento según borderSide
  const borderStyle = !o.borderEnabled || o.borderSide === 'none'
    ? {}
    : o.borderSide === 'all'
      ? { border: `${px(o.borderWidth)} solid ${o.borderColor}` }
      : o.borderSide === 'top'
        ? { borderTop: `${px(o.borderWidth)} solid ${o.borderColor}` }
        : o.borderSide === 'right'
          ? { borderRight: `${px(o.borderWidth)} solid ${o.borderColor}` }
          : o.borderSide === 'bottom'
            ? { borderBottom: `${px(o.borderWidth)} solid ${o.borderColor}` }
            : { borderLeft: `${px(o.borderWidth)} solid ${o.borderColor}` }

  // Posición vertical
  const vPosStyle = o.position === 'top'
    ? { top: px(o.offsetY), bottom: 'auto' }
    : { bottom: px(o.offsetY), top: 'auto' }

  const renderContent = (s) => (
    <div style={{
      position: 'absolute',
      ...vPosStyle,
      left: px(o.offsetX),
      right: px(o.offsetX),
      paddingTop: px(32),
      paddingBottom: px(32),
      paddingLeft: px(56),
      paddingRight: px(48),
      background: bandBackground,
      borderRadius: px(typeof o.borderRadius === 'number' ? o.borderRadius : 8),
      boxShadow: o.bgEnabled
        ? `0 ${px(12)} ${px(40)} rgba(0, 0, 0, 0.45), 0 0 0 ${px(1)} rgba(232, 181, 145, 0.1)`
        : 'none',
      backdropFilter: o.bgEnabled && o.bgBlur > 0 ? `blur(${px(o.bgBlur)})` : undefined,
      WebkitBackdropFilter: o.bgEnabled && o.bgBlur > 0 ? `blur(${px(o.bgBlur)})` : undefined,
      ...borderStyle,
    }}>
      {s.reference && o.refEnabled && (
        <p style={{
          margin: `0 0 ${px(12)}`,
          fontFamily: '"Geist Mono", "SF Mono", monospace',
          fontSize: px(o.refFontSize),
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: o.refUppercase ? 'uppercase' : 'none',
          color: o.refFontColor,
          textShadow: o.textShadow ? `0 ${px(2)} ${px(8)} rgba(0, 0, 0, 0.9)` : 'none',
        }}>{s.reference}</p>
      )}

      <p style={{
        margin: 0,
        color: o.fontColor,
        fontFamily: o.fontFamily,
        fontSize: px(o.fontSize),
        fontWeight: o.fontWeight,
        fontStyle: o.fontStyle === 'italic' ? 'italic' : 'normal',
        lineHeight: 1.2,
        letterSpacing: typeof o.letterSpacing === 'number' && o.letterSpacing !== 0
          ? `${o.letterSpacing * 0.01}em`
          : '0.005em',
        textTransform: ['uppercase', 'lowercase', 'capitalize'].includes(o.textTransform)
          ? o.textTransform : 'none',
        WebkitTextStroke: (typeof o.strokeWidth === 'number' && o.strokeWidth > 0)
          ? `${o.strokeWidth}px ${o.strokeColor || '#000000'}`
          : 'initial',
        textShadow: o.textShadow
          ? `0 ${px(4)} ${px(20)} rgba(0, 0, 0, 0.85), 0 ${px(2)} ${px(6)} rgba(0, 0, 0, 0.95)`
          : 'none',
        whiteSpace: 'pre-line',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>{s.text}</p>
    </div>
  )

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'transparent',
      overflow: 'hidden',
      pointerEvents: 'none',
      containerType: 'inline-size',  // habilita unidades cqw para los descendientes
    }}>
      {!isBlank && <SlideTransition slide={slide} theme={theme} render={renderContent} />}
    </div>
  )
}
