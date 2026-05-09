import SlideTransition from './SlideTransition.jsx'
import { DEFAULT_OVERLAY } from '../services/themeStore.js'

/**
 * Renderizador del lower-third totalmente personalizable desde theme.overlay.
 *
 * El usuario puede editar desde ProjectionPanel:
 *   - Fondo: solid/gradient/transparent + opacidad + blur
 *   - Posición: top / bottom + offsets
 *   - Borde de acento: lado, color, grosor, radio
 *   - Tipografía: familia, tamaño, color, sombra
 *   - Referencia: color, tamaño, mayúsculas
 *
 * Todo el resto de la ventana es transparente — solo se ve la banda.
 */
export default function LowerThirdRenderer({ slide, theme }) {
  const o = { ...DEFAULT_OVERLAY, ...(theme?.overlay || {}) }
  const isBlank = !slide || slide.type === 'blank' || slide.type === 'blackout'

  // Construye el fondo según bgType + bgEnabled
  const bandBackground = !o.bgEnabled
    ? 'transparent'
    : o.bgType === 'gradient'
      ? `linear-gradient(180deg, ${o.bgGradient[0]} 0%, ${o.bgGradient[1]} 100%)`
      : o.bgType === 'solid'
        ? o.bgColor
        : 'transparent'

  // Construye los bordes según borderSide
  const borderStyle = !o.borderEnabled || o.borderSide === 'none'
    ? {}
    : o.borderSide === 'all'
      ? { border: `${o.borderWidth}px solid ${o.borderColor}` }
      : o.borderSide === 'top'
        ? { borderTop: `${o.borderWidth}px solid ${o.borderColor}` }
        : o.borderSide === 'right'
          ? { borderRight: `${o.borderWidth}px solid ${o.borderColor}` }
          : o.borderSide === 'bottom'
            ? { borderBottom: `${o.borderWidth}px solid ${o.borderColor}` }
            : { borderLeft: `${o.borderWidth}px solid ${o.borderColor}` }

  // Posición vertical
  const vPosStyle = o.position === 'top'
    ? { top: o.offsetY, bottom: 'auto' }
    : { bottom: o.offsetY, top: 'auto' }

  const renderContent = (s) => (
    <div style={{
      position: 'absolute',
      ...vPosStyle,
      left: o.offsetX,
      right: o.offsetX,
      padding: o.padding,
      background: bandBackground,
      borderRadius: o.borderRadius,
      boxShadow: o.bgEnabled ? '0 12px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(232, 181, 145, 0.1)' : 'none',
      backdropFilter: o.bgEnabled && o.bgBlur > 0 ? `blur(${o.bgBlur}px)` : undefined,
      WebkitBackdropFilter: o.bgEnabled && o.bgBlur > 0 ? `blur(${o.bgBlur}px)` : undefined,
      ...borderStyle,
    }}>
      {s.reference && o.refEnabled && (
        <p style={{
          margin: '0 0 12px',
          fontFamily: '"Geist Mono", "SF Mono", monospace',
          fontSize: o.refFontSize,
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: o.refUppercase ? 'uppercase' : 'none',
          color: o.refFontColor,
          textShadow: o.textShadow ? '0 2px 8px rgba(0, 0, 0, 0.9)' : 'none',
        }}>{s.reference}</p>
      )}

      <p style={{
        margin: 0,
        color: o.fontColor,
        fontFamily: o.fontFamily,
        fontSize: o.fontSize,
        fontWeight: o.fontWeight,
        lineHeight: 1.2,
        letterSpacing: '0.005em',
        textShadow: o.textShadow ? '0 4px 20px rgba(0, 0, 0, 0.85), 0 2px 6px rgba(0, 0, 0, 0.95)' : 'none',
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
      position: 'fixed', inset: 0,
      background: 'transparent',
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      {!isBlank && <SlideTransition slide={slide} theme={theme} render={renderContent} />}
    </div>
  )
}
