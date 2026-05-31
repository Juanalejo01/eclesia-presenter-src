import { useState, useEffect, useRef } from 'react'
import SlideTransition from './SlideTransition.jsx'

// Formato idéntico al de ToolsPanel.formatCountdown.
function formatCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * Texto de countdown con RELOJ PROPIO. Recalcula el tiempo restante a partir
 * de `endsAt` (timestamp absoluto) en cada tick, en vez de depender de que
 * un componente externo envíe el texto ya formateado. Esto hace que el
 * countdown siga contando aunque el panel Herramientas esté desmontado
 * (usuario navegó a Biblia/Proyección) o la app esté minimizada.
 */
function LiveCountdown({ endsAt, endMessage, style }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const remaining = Math.max(0, (endsAt || 0) - now)
  const text = remaining > 0 ? formatCountdown(remaining) : (endMessage || '')
  return <p style={style}>{text}</p>
}

/**
 * Renderizador unificado de un slide con tema aplicado.
 *
 * El SLIDE puede traer overrides (bgType, bgImage, bgVideo, bgGradient,
 * bgColor, fontColor) que tienen prioridad sobre el tema global. Esto permite
 * que paneles como Imagen / Video / Texto fuercen su propio fondo sin alterar
 * la configuración global del tema.
 *
 * Usa container queries (cqw) para escalar tipografías proporcionalmente
 * al ancho real del contenedor, asumiendo target 1920×1080.
 *
 * Props:
 *   - slide:         { text, reference, type, ... overrides visuales }
 *   - theme:         tema global (themeStore)
 *   - isBlackout:    fuerza fondo negro
 *   - transparentBg: cuando true, bgType='transparent' usa fondo realmente
 *                    transparente (ventana overlay de OBS). Cuando false,
 *                    pinta un patrón ajedrez (preview en el panel).
 */
function SlideRendererInner({ slide, theme, isBlackout: forceBlackout = false, transparentBg = false }) {
  // Mezcla: el slide puede sobreescribir aspectos visuales del tema global.
  const eff = mergeThemeWithSlide(theme, slide)

  // Detectar blackout: por prop explícita (preview) o por el tipo del slide.
  const isBlackout = forceBlackout || slide?.type === 'blackout'

  const showVideo = eff.bgType === 'video' && eff.bgVideo
  const showImage = eff.bgType === 'image' && eff.bgImage
  // Para image/video usaremos un <img>/<video> con object-fit (más control que background-size).
  // El "fondo" del contenedor es solo el color de relleno detrás cuando object-fit:contain deja barras.
  const bg =
      isBlackout ? '#000000'
    : eff.bgType === 'transparent' && transparentBg ? 'transparent'
    : eff.bgType === 'gradient' ? `linear-gradient(135deg, ${eff.bgGradient[0]}, ${eff.bgGradient[1]})`
    : eff.bgType === 'transparent' ? 'repeating-conic-gradient(#1a1410 0 25%, #2a1f17 0 50%) 50% / 14px 14px'
    : showImage || eff.bgType === 'video' ? '#000'
    : eff.bgColor

  const imageFit = eff.imageFit || 'cover'
  const videoFit = eff.videoFit || 'cover'

  const align = eff.textAlign === 'top' ? 'flex-start'
              : eff.textAlign === 'bottom' ? 'flex-end' : 'center'

  const fontSize   = `${(eff.fontSize / 1920) * 100}cqw`
  // Tamaño de la referencia bíblica relativo al texto principal.
  // Garantizamos que NUNCA supere el tamaño del texto principal:
  //   sm → 1/5 (20%) · md → 1/4 (25%, default) · lg → 1/3 (33%) · xl → 1/2 (50%)
  const REF_RATIOS = { sm: 1 / 5, md: 1 / 4, lg: 1 / 3, xl: 1 / 2 }
  const refRatio   = REF_RATIOS[eff.referenceSize] ?? REF_RATIOS.md
  const refSize    = `${((eff.fontSize * refRatio) / 1920) * 100}cqw`
  const paddingPct = `${(40 / 1920) * 100}cqw`

  const renderContent = (s) => (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: align, justifyContent: 'center',
      padding: paddingPct, boxSizing: 'border-box',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '100%' }}>
        {/* Countdown self-contained: si el slide trae endsAt, usamos un reloj
            propio que sigue contando aunque el panel Herramientas no esté
            montado. Si no (countdown sin endsAt o slide normal), texto plano. */}
        {s.type === 'countdown' && s.endsAt ? (
          <LiveCountdown
            endsAt={s.endsAt}
            endMessage={s.endMessage}
            style={{
              color: eff.fontColor,
              fontSize,
              fontFamily: eff.fontFamily || 'var(--font-display)',
              fontWeight: eff.fontWeight ?? 500,
              textShadow: eff.textShadow ? '0 4px 20px rgba(0,0,0,0.6)' : 'none',
              lineHeight: 1.25, margin: 0, letterSpacing: '0.005em',
              whiteSpace: 'pre-line',
            }}
          />
        ) : s.text && (
          <p style={{
            color: eff.fontColor,
            fontSize,
            fontFamily: eff.fontFamily || 'var(--font-display)',
            fontWeight: eff.fontWeight ?? 500,
            textShadow: eff.textShadow ? '0 4px 20px rgba(0,0,0,0.6)' : 'none',
            lineHeight: 1.25, margin: 0, letterSpacing: '0.005em',
            whiteSpace: 'pre-line',
          }}>{s.text}</p>
        )}
        {s.reference && eff.referenceVisible !== false && (
          <p style={{
            marginTop: s.text ? refSize : 0, marginBottom: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: refSize,
            color: eff.fontColor, opacity: 0.7,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            textShadow: eff.textShadow ? '0 2px 6px rgba(0,0,0,0.6)' : 'none',
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
      {/* Fondo borroso (cuando contain/fill quiere disimular barras). Solo activo si bgImageBlur > 0 e imagen presente */}
      {showImage && eff.bgImageBlur > 0 && imageFit !== 'fill' && (
        <img src={eff.bgImage} alt="" aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            filter: `blur(${eff.bgImageBlur}px) brightness(0.6)`,
            transform: 'scale(1.1)',  // evitar bordes del blur
          }} />
      )}
      {showImage && !isBlackout && (
        <img src={eff.bgImage} alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: imageFit,            // 'cover' | 'contain' | 'fill'
            objectPosition: 'center center',
          }} />
      )}
      {showVideo && !isBlackout && (
        <video src={eff.bgVideo}
          autoPlay
          loop={slide?.videoLoop !== false}
          muted={slide?.videoMuted !== false}
          playsInline
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: videoFit,
            objectPosition: 'center center',
          }} />
      )}
      {!isBlank && <SlideTransition slide={slide} theme={eff} render={renderContent} />}
      {/* Etiqueta '⬛ BLACKOUT' solo en preview del editor (forceBlackout vía prop),
          nunca en proyección real (donde isBlackout viene del slide.type). */}
      {forceBlackout && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: 'var(--text-4)', fontFamily: 'var(--font-mono)', fontSize: 10,
          pointerEvents: 'none', opacity: 0.4,
        }}>
          ⬛ BLACKOUT
        </div>
      )}
    </div>
  )
}

/**
 * Combina el tema global con los overrides que pueda traer el slide.
 * Solo las propiedades visuales presentes en el slide reemplazan al tema.
 */
function mergeThemeWithSlide(theme, slide) {
  if (!slide) return theme
  const out = { ...theme }
  const keys = ['bgType', 'bgColor', 'bgGradient', 'bgImage', 'bgVideo',
                'imageFit', 'videoFit', 'bgImageBlur',
                'fontColor', 'fontFamily', 'fontSize', 'fontWeight',
                'textAlign', 'textShadow', 'referenceVisible', 'referenceSize']
  for (const k of keys) {
    if (slide[k] !== undefined) out[k] = slide[k]
  }
  return out
}

// ============================================================
// CROSSFADE DE TEMA
// ============================================================
// Calcula una "huella" de las propiedades VISUALES del tema efectivo
// (fondo + tipografía). Cuando esta huella cambia mientras el mismo slide
// está en vivo, hacemos un crossfade suave en vez de un cambio en seco.
function visualThemeKey(theme, slide) {
  const eff = mergeThemeWithSlide(theme, slide)
  return [
    eff.bgType, eff.bgColor,
    Array.isArray(eff.bgGradient) ? eff.bgGradient.join(',') : '',
    eff.bgImage || '', eff.bgVideo || '',
    eff.imageFit, eff.videoFit, eff.bgImageBlur,
    eff.fontColor, eff.fontFamily, eff.fontSize, eff.fontWeight, eff.textAlign,
  ].join('|')
}

/**
 * Wrapper que añade crossfade cuando cambia el TEMA (fondo/tipografía) sobre
 * el mismo contenido. La transición de SLIDE (texto) la sigue gestionando
 * SlideTransition dentro de SlideRendererInner.
 *
 * Diseño defensivo: si algo va mal, siempre renderiza al menos la capa
 * activa con el tema actual = comportamiento idéntico al anterior.
 *
 * Durante un crossfade hay 2 capas: la saliente congela el tema VIEJO,
 * la entrante usa el tema NUEVO. Ambas con el slide actual. Tras la
 * duración, se descarta la saliente.
 */
const FADE_MS = 450

export default function SlideRenderer(props) {
  const { slide, theme } = props
  const key = visualThemeKey(theme, slide)

  // Cada capa congela el theme con el que se montó.
  const [layers, setLayers] = useState(() => [{ id: 0, theme, phase: 'active' }])
  const idRef = useRef(1)
  const lastKeyRef = useRef(key)

  useEffect(() => {
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    const id = idRef.current++

    // Capas viejas → exiting (se desvanecen). Nueva capa con el theme actual.
    setLayers(prev => [
      ...prev.map(l => ({ ...l, phase: 'exiting' })),
      { id, theme, phase: 'entering' },
    ])

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, phase: 'active' } : l))
      })
    })
    const timer = setTimeout(() => {
      setLayers(prev => prev.filter(l => l.phase !== 'exiting'))
    }, FADE_MS + 60)

    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      clearTimeout(timer)
    }
  }, [key, theme])

  // Sin transición pendiente: render directo (caso normal, sin overhead).
  if (layers.length === 1 && layers[0].phase === 'active') {
    return <SlideRendererInner {...props} />
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {layers.map(layer => (
        <div
          key={layer.id}
          style={{
            position: 'absolute', inset: 0,
            opacity: layer.phase === 'active' ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
            willChange: 'opacity',
          }}
        >
          <SlideRendererInner {...props} theme={layer.theme} />
        </div>
      ))}
    </div>
  )
}
