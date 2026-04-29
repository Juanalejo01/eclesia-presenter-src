import { useEffect, useState } from 'react'
import SlideTransition from '../components/SlideTransition.jsx'

const DEFAULT_THEME = {
  bgType: 'solid',
  bgColor: '#000000',
  bgGradient: ['#1e3a5f', '#0f172a'],
  bgImage: null,
  bgVideo: null,
  fontFamily: 'Inter',
  fontSize: 64,
  fontColor: '#ffffff',
  fontWeight: 600,
  textShadow: true,
  textAlign: 'center',
  referenceVisible: true,
  transitionType: 'fade',
  transitionDuration: 500,
  transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
}

function buildBackground(mode, theme) {
  if (mode === 'overlay') return 'transparent'
  switch (theme.bgType) {
    case 'gradient':
      return `linear-gradient(135deg, ${theme.bgGradient[0]} 0%, ${theme.bgGradient[1]} 100%)`
    case 'image':
      return theme.bgImage ? `url("${theme.bgImage}") center/cover no-repeat` : theme.bgColor
    case 'video':
      return '#000'
    case 'transparent':
      return 'transparent'
    case 'solid':
    default:
      return theme.bgColor
  }
}

export default function ProjectionView() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const mode = params.get('mode') || 'background'

  const [slide, setSlide] = useState(window.__demoSlide || null)
  const [theme, setTheme] = useState(window.__demoTheme || DEFAULT_THEME)

  useEffect(() => {
    const proj = window.electron?.projection
    if (!proj) return
    proj.onInit(({ slide, theme }) => {
      if (slide) setSlide(slide)
      if (theme) setTheme(theme)
    })
    proj.onSlide(setSlide)
    proj.onTheme(setTheme)
  }, [])

  const isOverlay = mode === 'overlay'
  const isBlank   = !slide || slide.type === 'blank'
  const showVideo = !isOverlay && theme.bgType === 'video' && theme.bgVideo

  const containerStyle = {
    background: buildBackground(mode, theme),
    color: theme.fontColor,
    fontFamily: theme.fontFamily,
    fontWeight: theme.fontWeight,
  }

  const textStyle = {
    fontSize: `${theme.fontSize}px`,
    textShadow: theme.textShadow ? '0 4px 20px rgba(0,0,0,0.85)' : 'none',
    lineHeight: 1.35,
  }

  const refStyle = {
    fontSize: `${Math.max(18, theme.fontSize * 0.4)}px`,
    opacity: 0.85,
    textShadow: theme.textShadow ? '0 2px 12px rgba(0,0,0,0.85)' : 'none',
  }

  const alignClass = {
    top:    'items-start pt-20',
    center: 'items-center',
    bottom: 'items-end pb-16',
  }[theme.textAlign] || 'items-center'

  // Renderiza el contenido de un slide individual (usado por SlideTransition)
  const renderSlide = (s) => {
    if (!s || s.type === 'blank') return null
    return (
      <div className={`flex justify-center ${alignClass} px-12 w-full h-full`}>
        <div className="text-center max-w-[90vw]">
          <p style={textStyle} className="whitespace-pre-line">{s.text}</p>
          {s.reference && theme.referenceVisible && (
            <p className="mt-6" style={refStyle}>{s.reference}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden" style={containerStyle}>
      {showVideo && (
        <video src={theme.bgVideo} autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover"/>
      )}

      {!isBlank && (
        <SlideTransition slide={slide} theme={theme} render={renderSlide}/>
      )}
    </div>
  )
}
