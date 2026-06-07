/**
 * PgmPreview
 *
 * Mini-renderer fiel al SlideRenderer del desktop. Recibe el `slide`
 * (último `pgm-update`) y el `theme` (último `pgm-update-theme`) y
 * pinta una representación 16:9 que respeta:
 *
 *   - bg del tema (solid / gradient / transparent; image y video caen
 *     a gradient — no descargamos media al mando).
 *   - fuente del tema (family, size escalado al ancho real del contenedor,
 *     weight, style, color).
 *   - textAlign, letterSpacing, textTransform, márgenes laterales.
 *   - reference con su propio size (4 escalas) + uppercase opcional.
 *
 * Estados especiales (sin tema):
 *   - null/empty → "Sin contenido proyectado"
 *   - type='blackout' → bg negro plano + label discreto
 *   - type='blank' (sin texto) → bg blanco plano + label discreto
 *
 * Por qué medimos `containerW` con ResizeObserver en vez de usar `vw`:
 * el preview vive en una columna padding, no en el viewport completo;
 * vw escalaría desproporcionado al rotar o al cambiar el inset del
 * safe-area. El observer da el ancho real de la card y el font-size
 * se ajusta tras layout.
 *
 * Props:
 *   slide — { text?, reference?, type? } | null
 *   theme — objeto del server (se mergea con DEFAULT_THEME internamente)
 */
import { useLayoutEffect, useRef, useState } from 'react'
import {
  classifySlide,
  deriveBgStyle,
  deriveTextStyle,
  deriveReferenceStyle,
} from '../services/slideTheme.js'

export default function PgmPreview({ slide, theme }) {
  const containerRef = useRef(null)
  const [containerW, setContainerW] = useState(0)

  // Medir el ancho real al montar y en cambios de viewport. Usamos
  // ResizeObserver (mucho más preciso que un listener de resize global)
  // y fallback a `resize` para entornos viejos. En jsdom no existe
  // ResizeObserver de serie — los tests lo mockean.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const measure = () => setContainerW(el.clientWidth || 0)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const kind = classifySlide(slide)

  if (kind === 'empty') {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-bg-3 border border-line-1 rounded-xl grid place-items-center text-ink-3 text-sm p-6 text-center"
        role="img"
        aria-label="Sin contenido proyectado"
      >
        Sin contenido proyectado
      </div>
    )
  }

  if (kind === 'blackout') {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-black border border-line-1 rounded-xl grid place-items-center text-ink-3 text-xs font-mono uppercase tracking-widest"
        role="img"
        aria-label="Proyección en blackout"
      >
        Blackout
      </div>
    )
  }

  if (kind === 'blank') {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-ink-1 border border-line-1 rounded-xl grid place-items-center text-bg-1 text-xs font-mono uppercase tracking-widest opacity-70"
        role="img"
        aria-label="Slide en blanco proyectado"
      >
        Slide en blanco
      </div>
    )
  }

  // Contenido normal — aplicar tema completo.
  const bgStyle = deriveBgStyle(theme)
  const textStyle = deriveTextStyle(theme, containerW)
  const refStyle = deriveReferenceStyle(theme, containerW)

  const aria = `Proyectando: ${slide?.text || ''}${
    slide?.reference ? ` (${slide.reference})` : ''
  }`.trim()

  return (
    <div
      ref={containerRef}
      className="aspect-video border border-line-1 rounded-xl overflow-hidden relative flex flex-col items-center justify-center"
      style={bgStyle}
      role="img"
      aria-label={aria}
    >
      <div className="w-full" style={textStyle}>
        {slide?.text && (
          <p className="line-clamp-4 break-words m-0 leading-tight">
            {slide.text}
          </p>
        )}
        {refStyle && slide?.reference && (
          <p
            style={refStyle}
            className="m-0 mt-2 break-words"
          >
            {slide.reference}
          </p>
        )}
      </div>
    </div>
  )
}
