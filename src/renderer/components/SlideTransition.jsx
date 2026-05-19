import { useEffect, useRef, useState } from 'react'

/**
 * Renderiza el slide con transiciones entre cambios.
 * Mantiene 2 capas simultáneas durante la animación:
 *   - capa saliente (slide previo): se anima fuera
 *   - capa entrante (slide nuevo): se anima dentro
 * Sin dependencias externas, todo CSS + useEffect orquestado.
 */

const TRANSITIONS = {
  none: {
    entering: { opacity: 1 },
    active:   { opacity: 1 },
    exiting:  { opacity: 0 },
  },
  fade: {
    entering: { opacity: 0 },
    active:   { opacity: 1 },
    exiting:  { opacity: 0 },
  },
  'slide-left': {
    entering: { transform: 'translateX(60%)',  opacity: 0 },
    active:   { transform: 'translateX(0)',    opacity: 1 },
    exiting:  { transform: 'translateX(-60%)', opacity: 0 },
  },
  'slide-right': {
    entering: { transform: 'translateX(-60%)', opacity: 0 },
    active:   { transform: 'translateX(0)',    opacity: 1 },
    exiting:  { transform: 'translateX(60%)',  opacity: 0 },
  },
  'slide-up': {
    entering: { transform: 'translateY(40%)',  opacity: 0 },
    active:   { transform: 'translateY(0)',    opacity: 1 },
    exiting:  { transform: 'translateY(-40%)', opacity: 0 },
  },
  'slide-down': {
    entering: { transform: 'translateY(-40%)', opacity: 0 },
    active:   { transform: 'translateY(0)',    opacity: 1 },
    exiting:  { transform: 'translateY(40%)',  opacity: 0 },
  },
  'zoom-in': {
    entering: { transform: 'scale(0.82)', opacity: 0 },
    active:   { transform: 'scale(1)',    opacity: 1 },
    exiting:  { transform: 'scale(1.18)', opacity: 0 },
  },
  'zoom-out': {
    entering: { transform: 'scale(1.18)', opacity: 0 },
    active:   { transform: 'scale(1)',    opacity: 1 },
    exiting:  { transform: 'scale(0.82)', opacity: 0 },
  },
  'flip': {
    entering: { transform: 'perspective(1200px) rotateY(90deg)',  opacity: 0 },
    active:   { transform: 'perspective(1200px) rotateY(0)',      opacity: 1 },
    exiting:  { transform: 'perspective(1200px) rotateY(-90deg)', opacity: 0 },
  },
  'flip-x': {
    entering: { transform: 'perspective(1200px) rotateX(90deg)',  opacity: 0 },
    active:   { transform: 'perspective(1200px) rotateX(0)',      opacity: 1 },
    exiting:  { transform: 'perspective(1200px) rotateX(-90deg)', opacity: 0 },
  },
  'dissolve': {
    // Cross-fade con blur sutil — más cinematográfico que fade puro
    entering: { opacity: 0, filter: 'blur(8px)' },
    active:   { opacity: 1, filter: 'blur(0px)' },
    exiting:  { opacity: 0, filter: 'blur(8px)' },
  },
  'reveal': {
    // Clip-path desde abajo — útil para revelar versículos largos
    entering: { clipPath: 'inset(100% 0 0 0)', opacity: 1 },
    active:   { clipPath: 'inset(0 0 0 0)',     opacity: 1 },
    exiting:  { clipPath: 'inset(0 0 100% 0)',  opacity: 1 },
  },
  'ken-burns': {
    // Zoom muy suave + leve traslación: efecto cinematográfico contemplativo
    entering: { transform: 'scale(1.08) translate(-1%, -1%)', opacity: 0 },
    active:   { transform: 'scale(1) translate(0, 0)',         opacity: 1 },
    exiting:  { transform: 'scale(1.08) translate(1%, 1%)',    opacity: 0 },
  },
}

const slideKey = (slide) =>
  slide ? `${slide.text || ''}::${slide.reference || ''}::${slide.type || ''}` : 'blank'

export default function SlideTransition({ slide, theme, render }) {
  const type     = TRANSITIONS[theme.transitionType] ? theme.transitionType : 'fade'
  const duration = theme.transitionDuration ?? 500
  const easing   = theme.transitionEasing  || 'cubic-bezier(0.4, 0, 0.2, 1)'

  const [layers, setLayers] = useState(() =>
    slide ? [{ id: 0, slide, phase: 'active' }] : []
  )
  const idCounter = useRef(1)
  const lastKeyRef = useRef(slideKey(slide))

  useEffect(() => {
    const newKey = slideKey(slide)
    if (newKey === lastKeyRef.current) return
    lastKeyRef.current = newKey

    const id = idCounter.current++

    // Marcar capas existentes como saliendo, añadir nueva entrando
    setLayers(prev => [
      ...prev.map(l => ({ ...l, phase: 'exiting' })),
      { id, slide, phase: 'entering' },
    ])

    // Doble RAF: dar al navegador un frame para pintar el estado entering,
    // luego cambiar a active para disparar la transición CSS
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, phase: 'active' } : l))
      })
      cleanup.raf2 = raf2
    })
    const cleanup = { raf1 }

    // Después de la duración, descartar capas que estén saliendo
    const timer = setTimeout(() => {
      setLayers(prev => prev.filter(l => l.phase !== 'exiting'))
    }, duration + 60)

    return () => {
      cancelAnimationFrame(cleanup.raf1)
      if (cleanup.raf2) cancelAnimationFrame(cleanup.raf2)
      clearTimeout(timer)
    }
  }, [slide, duration])

  if (layers.length === 0) return null

  return (
    <>
      {layers.map(layer => {
        const base = TRANSITIONS[type][layer.phase] || TRANSITIONS[type].active
        // Construir lista de propiedades a animar según el tipo
        const animProps = ['opacity', 'transform']
        if (type === 'dissolve') animProps.push('filter')
        if (type === 'reveal')   animProps.push('clip-path')
        const style = {
          ...base,
          transition: animProps.map(p => `${p} ${duration}ms ${easing}`).join(', '),
          willChange: animProps.join(', '),
        }
        return (
          <div key={layer.id} className="absolute inset-0 flex" style={style}>
            {render(layer.slide)}
          </div>
        )
      })}
    </>
  )
}
