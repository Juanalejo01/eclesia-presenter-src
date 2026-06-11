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
 * Accesibilidad: el container tiene `role="img"` + `aria-label`
 * descriptivo. Adicionalmente, un span sr-only con `aria-live="polite"`
 * notifica a screen readers cuando cambia el slide proyectado. El
 * texto del live region es deliberadamente DISTINTO al texto visible
 * (anuncia "Diapositiva nueva en proyección" sin el contenido literal):
 *
 *   - Evita que el SR repita versículos largos en cada update.
 *   - Evita colisiones con `getByText` en tests (el contenido visible
 *     ya está en el `<p>` y no queremos dos nodos con el mismo texto).
 *
 * Performance: memoizamos `mergeTheme(theme)` y los 3 styles derivados
 * con `useMemo` — sin esto, cada render (y cada tick del
 * ResizeObserver) volvería a validar y mergear el tema entero.
 *
 * Props:
 *   slide — { text?, reference?, type? } | null
 *   theme — objeto del server (se mergea con DEFAULT_THEME internamente)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  classifySlide,
  deriveBgStyle,
  deriveTextStyle,
  deriveReferenceStyle,
  mergeTheme,
} from '../services/slideTheme.js'
import { useT } from '../hooks/useT.js'

// Style inline para el live region — equivalente al `sr-only` de
// Tailwind/HeadlessUI. Lo dejamos inline para no depender de utilities
// y que funcione aunque el bundle de Tailwind no incluya `sr-only`.
const _SR_ONLY = Object.freeze({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
})

export default function PgmPreview({ slide, theme }) {
  const { t } = useT()
  const containerRef = useRef(null)
  const [containerW, setContainerW] = useState(0)

  // Counter que se incrementa con cada cambio de slide. Lo usamos para
  // que el live region cambie SU TEXTO en cada update, forzando al SR
  // a re-anunciar aunque dos slides consecutivos compartan referencia.
  // No mostramos el counter al usuario — sólo participa en el
  // aria-live para el screen reader.
  const [slideTick, setSlideTick] = useState(0)
  useEffect(() => {
    setSlideTick((n) => (n + 1) % 1000)
    // Sólo nos importa cuando cambia el texto o la referencia. Si
    // pivotamos a comparar también `type`, añadirlo aquí.
  }, [slide?.text, slide?.reference, slide?.type])

  // Medir el ancho real al montar y en cambios de viewport. Usamos
  // ResizeObserver (mucho más preciso que un listener de resize global)
  // y fallback a `resize` para entornos viejos. En jsdom no existe
  // ResizeObserver de serie — los tests lo mockean.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const measure = () => {
      const next = el.clientWidth || 0
      // Skip setState si el ancho no cambió — el ResizeObserver
      // puede disparar en cada layout pass aunque el ancho final
      // sea el mismo, y un setState innecesario costaría re-render
      // del subtree con sus useMemo dependientes.
      setContainerW((prev) => (prev === next ? prev : next))
    }
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

  // Memo del theme mergeado: si el server emite el mismo objeto theme
  // entre re-renders del padre, evitamos rehacer la validación de cada
  // campo. `theme` típicamente es estable porque viene de `useState`
  // en `usePgmState` — sólo cambia tras un `pgm-update-theme`.
  const mergedTheme = useMemo(() => mergeTheme(theme), [theme])
  const bgStyle = useMemo(() => deriveBgStyle(mergedTheme), [mergedTheme])
  const textStyle = useMemo(
    () => deriveTextStyle(mergedTheme, containerW),
    [mergedTheme, containerW],
  )
  const refStyle = useMemo(
    () => deriveReferenceStyle(mergedTheme, containerW),
    [mergedTheme, containerW],
  )

  if (kind === 'empty') {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-bg-3 border border-line-1 rounded-xl grid place-items-center text-ink-3 text-sm p-6 text-center"
        role="img"
        aria-label={t('pgm.noContent')}
      >
        {t('pgm.noContent')}
      </div>
    )
  }

  if (kind === 'blackout') {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-black border border-line-1 rounded-xl grid place-items-center text-ink-3 text-xs font-mono uppercase tracking-widest"
        role="img"
        aria-label={t('pgm.blackoutAria')}
      >
        {t('pgm.blackout')}
      </div>
    )
  }

  if (kind === 'blank') {
    return (
      <div
        ref={containerRef}
        className="aspect-video bg-ink-1 border border-line-1 rounded-xl grid place-items-center text-bg-1 text-xs font-mono uppercase tracking-widest opacity-70"
        role="img"
        aria-label={t('pgm.blankAria')}
      >
        {t('pgm.blank')}
      </div>
    )
  }

  // Contenido normal — aplicar tema completo.
  const aria = (slide?.reference
    ? t('pgm.projectingAriaRef', { text: slide?.text || '', ref: slide.reference })
    : t('pgm.projectingAria', { text: slide?.text || '' })
  ).trim()

  // Texto del live region — corto, sin contenido literal del slide.
  // El "·" + tick fuerza a que dos updates consecutivos generen
  // strings distintos aunque el slide tenga el mismo texto/reference.
  const liveText = t('pgm.liveRegion', { n: slideTick })

  return (
    <>
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
      {/* Live region sr-only: anuncia el cambio sin repetir el texto
          visible (que sería ruidoso y duplicaría nodes para tests). */}
      <span
        style={_SR_ONLY}
        aria-live="polite"
        aria-atomic="true"
        data-testid="pgm-preview-live"
      >
        {liveText}
      </span>
    </>
  )
}
