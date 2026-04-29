import SlideTransition from './SlideTransition.jsx'

/**
 * Renderizador unificado de un slide con tema aplicado.
 * Usa container queries (cqw) para escalar tipografías proporcionalmente
 * al ancho real del contenedor, asumiendo target 1920×1080.
 *
 * Esto garantiza que la "vista previa del estilo" en ProjectionPanel y la
 * pantalla "EN VIVO" del monitor PGM rendericen idénticamente, solo a
 * diferentes tamaños físicos.
 */
export default function SlideRenderer({ slide, theme, isBlackout = false }) {
  const showVideo = theme.bgType === 'video' && theme.bgVideo
  const bg =
      isBlackout ? '#000000'
    : theme.bgType === 'gradient' ? `linear-gradient(135deg, ${theme.bgGradient[0]}, ${theme.bgGradient[1]})`
    : theme.bgType === 'transparent' ? 'repeating-conic-gradient(#1a1410 0 25%, #2a1f17 0 50%) 50% / 14px 14px'
    : theme.bgType === 'image' && theme.bgImage ? `url("${theme.bgImage}") center/cover`
    : theme.bgType === 'video' ? '#000'
    : theme.bgColor

  const align = theme.textAlign === 'top' ? 'flex-start'
              : theme.textAlign === 'bottom' ? 'flex-end' : 'center'

  // 1920px = ancho de referencia de la proyección.
  // cqw = % del ancho del contenedor → escala proporcional automática.
  const fontSize     = `${(theme.fontSize / 1920) * 100}cqw`
  const refSize      = `${((theme.fontSize / 4) / 1920) * 100}cqw`
  const paddingPct   = `${(40 / 1920) * 100}cqw`

  const renderContent = (s) => (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: align, justifyContent: 'center',
      padding: paddingPct, boxSizing: 'border-box',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '100%' }}>
        <p style={{
          color: theme.fontColor,
          fontSize,
          fontFamily: theme.fontFamily || 'var(--font-display)',
          fontWeight: theme.fontWeight ?? 500,
          textShadow: theme.textShadow ? '0 4px 20px rgba(0,0,0,0.6)' : 'none',
          lineHeight: 1.25,
          margin: 0,
          letterSpacing: '0.005em',
        }}>{s.text}</p>
        {s.reference && theme.referenceVisible && (
          <p style={{
            marginTop: refSize, marginBottom: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: refSize,
            color: theme.fontColor, opacity: 0.7,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            textShadow: theme.textShadow ? '0 2px 6px rgba(0,0,0,0.6)' : 'none',
          }}>{s.reference}</p>
        )}
      </div>
    </div>
  )

  const isBlank = !slide || slide.type === 'blank' || slide.type === 'blackout'

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: bg,
      overflow: 'hidden',
      containerType: 'size',
    }}>
      {showVideo && !isBlackout && (
        <video src={theme.bgVideo} autoPlay loop muted playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!isBlank && <SlideTransition slide={slide} theme={theme} render={renderContent} />}
      {isBlackout && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: 'var(--text-4)', fontFamily: 'var(--font-mono)', fontSize: 10,
        }}>
          ⬛ BLACKOUT
        </div>
      )}
    </div>
  )
}
