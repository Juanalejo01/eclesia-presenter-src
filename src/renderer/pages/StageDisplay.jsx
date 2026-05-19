import { useEffect, useState } from 'react'
import { DEFAULT_THEME } from '../services/themeStore.js'

/**
 * Stage Display v2 — pantalla informativa para músicos/predicadores con:
 *   - Slide actual EN GRANDE (lo que el público ve)
 *   - Notas del predicador (editables desde Herramientas, solo visibles aquí)
 *   - Countdown integrado (si hay uno corriendo, se ve grande)
 *   - Reloj actual + tiempo en aire
 *   - Tipo de slide + tema activo
 *
 * No es transparente ni capturable por OBS — es la pantalla privada
 * del equipo de plataforma.
 */
export default function StageDisplay() {
  const [slide, setSlide]         = useState(null)
  const [theme, setTheme]         = useState(DEFAULT_THEME)
  const [notes, setNotes]         = useState('')
  const [countdown, setCountdown] = useState(null)
  const [now, setNow]             = useState(Date.now())
  const [start, setStart]         = useState(null)

  useEffect(() => {
    document.title = 'EclesiaPresenter — Stage Display'
    const proj = window.electron?.projection
    if (!proj) return

    proj.state().then(state => {
      if (state?.slide) { setSlide(state.slide); setStart(s => s || Date.now()) }
      if (state?.theme) setTheme(prev => ({ ...prev, ...state.theme }))
      if (state?.notes) setNotes(state.notes)
      if (state?.countdown) setCountdown(state.countdown)
    }).catch(() => {})

    const offSlide = proj.onSlide?.((s) => {
      setSlide(s); setStart(prev => prev || Date.now())
    })
    const offTheme = proj.onTheme?.((t) => setTheme(prev => ({ ...prev, ...t })))
    const offNotes = proj.onNotes?.((n) => setNotes(n || ''))
    const offCd    = proj.onCountdown?.((c) => setCountdown(c))

    return () => { offSlide?.(); offTheme?.(); offNotes?.(); offCd?.() }
  }, [])

  // Reloj — tick cada 250ms para que el countdown se vea fluido
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const elapsed = start ? Math.floor((now - start) / 1000) : 0
  const eh = pad2(Math.floor(elapsed / 3600))
  const em = pad2(Math.floor((elapsed % 3600) / 60))
  const es = pad2(elapsed % 60)

  const clockNow = new Date(now)
  const hh = pad2(clockNow.getHours())
  const mm = pad2(clockNow.getMinutes())
  const ss = pad2(clockNow.getSeconds())

  // Countdown
  const cdRemaining = countdown?.running && countdown.endsAt ? Math.max(0, countdown.endsAt - now) : null
  const cdActive = cdRemaining !== null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0d',
      color: '#f4e6d7',
      fontFamily: '"Geist", system-ui, sans-serif',
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      userSelect: 'none', overflow: 'hidden',
    }}>

      {/* HEADER: brand + clocks */}
      <header style={{
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(232,181,145,0.18)',
        background: 'linear-gradient(180deg, #1a1410 0%, #14100d 100%)',
        gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 26, fontWeight: 600, color: '#db9f75' }}>
            EclesiaPresenter
          </span>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: '0.2em', color: '#8a7866', textTransform: 'uppercase' }}>
            Stage Display
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Stat label="En aire" value={`${eh}:${em}:${es}`} accent />
          <Stat label="Hora" value={`${hh}:${mm}:${ss}`} />
        </div>
      </header>

      {/* COUNTDOWN PROMINENTE — aparece arriba en GRANDE si está corriendo */}
      {cdActive && (
        <div style={{
          gridRow: '2 / 3',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          minHeight: 0,
        }}>
          <CountdownBanner cd={countdown} remaining={cdRemaining} />

          {/* Cuerpo normal debajo del countdown */}
          <StageBody slide={slide} notes={notes} theme={theme} />
        </div>
      )}

      {/* Cuerpo normal cuando no hay countdown */}
      {!cdActive && (
        <StageBody slide={slide} notes={notes} theme={theme} />
      )}
    </div>
  )
}

// ============================================================
// Cuerpo principal: slide actual + panel lateral con notas
// ============================================================
function StageBody({ slide, notes, theme }) {
  return (
    <main style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr',
      gap: 18,
      padding: 18,
      minHeight: 0,
    }}>
      {/* Slide actual */}
      <section style={{
        background: 'linear-gradient(135deg, #0a1620 0%, #1e3a5f 60%, #0a1620 100%)',
        borderRadius: 14,
        border: '2px solid rgba(255, 61, 61, 0.4)',
        boxShadow: '0 0 0 1px rgba(255, 61, 61, 0.2), 0 0 60px rgba(255, 61, 61, 0.15)',
        padding: '52px 44px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', minHeight: 0,
      }}>
        <span style={{
          position: 'absolute', top: 14, left: 14,
          fontFamily: '"Geist Mono", monospace', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.16em', color: '#ff5252', textTransform: 'uppercase',
          background: 'rgba(255, 61, 61, 0.15)',
          padding: '3px 9px', borderRadius: 4,
          border: '1px solid rgba(255, 61, 61, 0.5)',
        }}>● ON AIR · EN VIVO</span>

        {slide ? (
          <div style={{ textAlign: 'center', overflow: 'auto', maxHeight: '100%' }}>
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: 'clamp(28px, 4.2vw, 64px)',
              lineHeight: 1.25, margin: 0, color: '#ffffff',
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
              whiteSpace: 'pre-line',
            }}>{slide.text || '—'}</p>
            {slide.reference && (
              <p style={{
                marginTop: 22, fontFamily: '"Geist Mono", monospace',
                fontSize: 16, color: 'rgba(255,255,255,0.7)',
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>{slide.reference}</p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
            <p style={{ fontSize: 22, margin: 0 }}>Sin slide activo</p>
            <p style={{ fontSize: 12, marginTop: 8, fontFamily: '"Geist Mono", monospace', letterSpacing: '0.1em' }}>
              Selecciona contenido en el panel de control
            </p>
          </div>
        )}
      </section>

      {/* Sidebar: notas grandes + info */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        {/* Notas del predicador — protagonistas */}
        <section style={{
          flex: 1, minHeight: 0,
          background: 'rgba(255, 255, 200, 0.04)',
          border: '1px solid rgba(255, 220, 100, 0.20)',
          borderRadius: 12, padding: '18px 20px',
          display: 'flex', flexDirection: 'column', minHeight: 200,
        }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontFamily: '"Geist Mono", monospace', fontSize: 10,
              letterSpacing: '0.2em', textTransform: 'uppercase', color: '#fbd76b',
            }}>📝 Notas del predicador</span>
            <span style={{ fontSize: 9, color: '#8a7866', fontFamily: '"Geist Mono", monospace' }}>
              SOLO STAGE
            </span>
          </header>
          {notes?.trim() ? (
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: 'clamp(18px, 1.6vw, 24px)',
              lineHeight: 1.55, color: '#fff9e6',
              margin: 0, whiteSpace: 'pre-line',
              overflow: 'auto', flex: 1,
            }}>{notes}</p>
          ) : (
            <p style={{
              fontStyle: 'italic', color: '#8a7866',
              fontSize: 13, margin: 0, flex: 1,
              display: 'grid', placeItems: 'center', textAlign: 'center',
              lineHeight: 1.6,
            }}>
              Sin notas activas.<br/>
              <span style={{ fontSize: 11 }}>El operador puede escribir desde Herramientas → Notas Stage</span>
            </p>
          )}
        </section>

        {/* Info compacta */}
        <InfoStrip
          slideType={slide?.type || '—'}
          themeType={theme.bgType}
        />
      </aside>
    </main>
  )
}

// ============================================================
// Banner de countdown — gigante cuando está activo
// ============================================================
function CountdownBanner({ cd, remaining }) {
  const totalSec = Math.ceil(remaining / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const text = remaining > 0
    ? (h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`)
    : cd.endMessage

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(168, 95, 51, 0.18), rgba(128, 64, 18, 0.06))',
      borderBottom: '1px solid rgba(232, 181, 145, 0.28)',
      padding: '20px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 24,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: '"Geist Mono", monospace', fontSize: 11,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: '#db9f75',
          marginBottom: 4,
        }}>⏳ Countdown activo</div>
        <div style={{
          fontFamily: '"Cormorant Garamond", serif',
          fontSize: 24, color: '#f4e6d7', fontStyle: 'italic',
        }}>{cd.message}</div>
      </div>
      <div style={{
        fontFamily: '"Geist Mono", monospace',
        fontSize: 'clamp(48px, 6vw, 88px)',
        color: '#f5dec8',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.04em', fontWeight: 600,
        textShadow: '0 0 30px rgba(232, 181, 145, 0.35)',
      }}>{text}</div>
    </div>
  )
}

// ============================================================
// Componentes auxiliares
// ============================================================
function Stat({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 9,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a7866',
      }}>{label}</span>
      <span style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 22,
        fontVariantNumeric: 'tabular-nums',
        color: accent ? '#db9f75' : '#f4e6d7',
        letterSpacing: '0.05em', fontWeight: 600,
      }}>{value}</span>
    </div>
  )
}

function InfoStrip({ slideType, themeType }) {
  return (
    <div style={{
      background: 'rgba(34, 26, 20, 0.5)',
      border: '1px solid rgba(232, 181, 145, 0.08)',
      borderRadius: 10, padding: '10px 14px',
      display: 'flex', justifyContent: 'space-between', gap: 12,
    }}>
      <Bit label="Slide" value={slideType} />
      <Bit label="Tema" value={themeType} />
    </div>
  )
}

function Bit({ label, value }) {
  return (
    <div>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 8,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a7866',
      }}>{label}</div>
      <div style={{ fontSize: 12, color: '#c9b29c', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

function pad2(n) { return String(n).padStart(2, '0') }
