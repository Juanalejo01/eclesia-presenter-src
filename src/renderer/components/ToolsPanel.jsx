// Panel "Herramientas" — utilidades complementarias para el servicio.
//
// El estado de countdown y cronómetro vive en toolsStore.js (módulo) para
// que persista cuando el usuario navega a otros paneles. Si el componente
// se desmonta, los timers siguen ejecutándose; al volver, lee el estado
// actualizado y renderiza correctamente.

import { useEffect, useRef, useState } from 'react'
import { selectSlide } from '../services/slideStore.js'
import {
  getAllVersions, getActiveVersion, getBooks, getChapter, getChapterCount,
} from '../services/bibleService.js'
import {
  useCountdown, setCountdownField, startCountdown, pauseCountdown, resetCountdown,
  useStopwatch, startStopwatch, stopStopwatch, resetStopwatch, lapStopwatch,
} from '../services/toolsStore.js'
import { IconHourglass, IconTimer, IconDice, IconWheel } from './Icons.jsx'

const WIDGETS = [
  { id: 'countdown', label: 'Cuenta atrás',  Icon: IconHourglass },
  { id: 'stopwatch', label: 'Cronómetro',    Icon: IconTimer },
  { id: 'verse',     label: 'Verso al azar', Icon: IconDice },
  { id: 'wheel',     label: 'Ruleta',        Icon: IconWheel },
]

export default function ToolsPanel() {
  const [active, setActive] = useState('countdown')

  return (
    <div className="workspace">
      <div className="ws-header">
        <div className="ws-title">
          <h1 className="ws-h1">Herramientas</h1>
          <span className="ws-sub">Cuenta atrás · cronómetro · sorteos · verso aleatorio</span>
        </div>
      </div>

      <div className="ws-body">
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${WIDGETS.length}, 1fr)`,
          gap: 8, marginBottom: 22,
        }}>
          {WIDGETS.map(w => (
            <button key={w.id} onClick={() => setActive(w.id)}
              className={'btn ' + (active === w.id ? 'btn-primary' : '')}
              style={{ height: 56, display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
              <w.Icon size={20} />
              <span style={{ fontSize: 11 }}>{w.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {active === 'countdown' && <CountdownWidget />}
          {active === 'stopwatch' && <StopwatchWidget />}
          {active === 'verse'     && <VerseRandomWidget />}
          {active === 'wheel'     && <WheelWidget />}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 1. COUNTDOWN — estado persistente vía toolsStore
// ============================================================
function CountdownWidget() {
  const state = useCountdown()
  const { mode, hours, minutes, seconds, targetDate, message, endMessage, running, endsAt, autoProject, now } = state

  // Auto-proyección al live cuando está corriendo
  useEffect(() => {
    if (!running || !endsAt || !autoProject) return
    const remaining = Math.max(0, endsAt - now)
    const text = remaining > 0 ? formatCountdown(remaining) : endMessage
    selectSlide({
      type: 'countdown',
      text,
      reference: message,
    })
  }, [now, running, endsAt, autoProject, message, endMessage])

  const remaining = endsAt ? Math.max(0, endsAt - now) : (hours * 3600 + minutes * 60 + seconds) * 1000

  return (
    <>
      <div className="card" style={{ padding: 20 }}>
        <div className="section-h" style={{ marginBottom: 14 }}>
          <h3>Configuración</h3>
          <span className="sub">Modo · {mode === 'duration' ? 'duración' : 'hora destino'}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={'btn ' + (mode === 'duration' ? 'btn-primary' : '')}
            onClick={() => setCountdownField({ mode: 'duration' })} disabled={running}>Duración</button>
          <button className={'btn ' + (mode === 'target' ? 'btn-primary' : '')}
            onClick={() => setCountdownField({ mode: 'target' })} disabled={running}>Hora destino</button>
        </div>

        {mode === 'duration' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <NumberField label="Horas"    value={hours}    onChange={v => setCountdownField({ hours: v })} min={0} max={23} disabled={running} />
            <NumberField label="Minutos"  value={minutes}  onChange={v => setCountdownField({ minutes: v })} min={0} max={59} disabled={running} />
            <NumberField label="Segundos" value={seconds}  onChange={v => setCountdownField({ seconds: v })} min={0} max={59} disabled={running} />
          </div>
        )}

        {mode === 'target' && (
          <div className="field" style={{ marginBottom: 12 }}>
            <span className="label">Hora destino</span>
            <input type="datetime-local" className="field-input" disabled={running}
              value={targetDate} onChange={e => setCountdownField({ targetDate: e.target.value })} />
          </div>
        )}

        <div className="field" style={{ marginBottom: 8 }}>
          <span className="label">Mensaje principal</span>
          <input className="field-input" value={message}
            onChange={e => setCountdownField({ message: e.target.value })}
            placeholder="El servicio inicia en" />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <span className="label">Mensaje al terminar</span>
          <input className="field-input" value={endMessage}
            onChange={e => setCountdownField({ endMessage: e.target.value })}
            placeholder="¡Empezamos!" />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
          <input type="checkbox" checked={autoProject}
            onChange={e => setCountdownField({ autoProject: e.target.checked })} />
          Proyectar al live automáticamente (se actualiza cada segundo)
        </label>
      </div>

      <div className="card" style={{ padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)',
          letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>
          {running ? message : 'Vista previa'}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 64,
          color: 'var(--copper-100)', lineHeight: 1, letterSpacing: '0.04em' }}>
          {remaining > 0 ? formatCountdown(remaining) : endMessage}
        </div>
        {running && (
          <div style={{ fontSize: 10, color: 'var(--copper-200)', marginTop: 8,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            ● corriendo en segundo plano
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {!running && <button className="btn btn-primary" onClick={startCountdown} style={{ flex: 1 }}>▶ Empezar</button>}
        {running  && <button className="btn" onClick={pauseCountdown} style={{ flex: 1 }}>❚❚ Pausar</button>}
        <button className="btn btn-ghost" onClick={resetCountdown}>↻ Reset</button>
        <button className="btn" onClick={() => selectSlide({
          type: 'countdown',
          text: remaining > 0 ? formatCountdown(remaining) : endMessage,
          reference: message,
        })}>Proyectar ahora</button>
      </div>
    </>
  )
}

function formatCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// ============================================================
// 2. STOPWATCH — estado persistente vía toolsStore
// ============================================================
function StopwatchWidget() {
  const state = useStopwatch()
  const { running, current, laps } = state

  return (
    <>
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 64,
          color: 'var(--copper-100)', lineHeight: 1, letterSpacing: '0.04em', fontWeight: 600 }}>
          {formatStopwatch(current)}
        </div>
        {running && (
          <div style={{ fontSize: 10, color: 'var(--copper-200)', marginTop: 8,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            ● corriendo en segundo plano
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {!running && <button className="btn btn-primary" onClick={startStopwatch} style={{ flex: 1 }}>▶ Iniciar</button>}
        {running  && <button className="btn" onClick={stopStopwatch} style={{ flex: 1 }}>❚❚ Detener</button>}
        <button className="btn" onClick={lapStopwatch} disabled={!running}>⚐ Vuelta</button>
        <button className="btn btn-ghost" onClick={resetStopwatch}>↻ Reset</button>
        <button className="btn" onClick={() => selectSlide({
          type: 'stopwatch', text: formatStopwatch(current), reference: 'Cronómetro',
        })}>Proyectar</button>
      </div>

      {laps.length > 0 && (
        <div className="card" style={{ padding: 16, maxHeight: 280, overflowY: 'auto' }}>
          <div className="section-h" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 13 }}>Vueltas</h3>
            <span className="sub">{laps.length}</span>
          </div>
          {laps.map(lap => (
            <div key={lap.n} style={{
              display: 'flex', justifyContent: 'space-between', padding: '6px 0',
              borderBottom: '1px solid var(--line-1)', fontSize: 13, fontFamily: 'var(--font-mono)',
            }}>
              <span style={{ color: 'var(--text-3)' }}>#{lap.n}</span>
              <span style={{ color: 'var(--text-1)' }}>{formatStopwatch(lap.time)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function formatStopwatch(ms) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const cs = Math.floor((ms % 1000) / 10)
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${pad(cs)}` : `${pad(m)}:${pad(s)}.${pad(cs)}`
}

// ============================================================
// 3. VERSO ALEATORIO — FIX: usa getChapterCount + maneja versiones remotas + error visible
// ============================================================
const VERSE_SCOPES = [
  { id: 'all',         label: 'Toda la Biblia',     filterBooks: null },
  { id: 'nt',          label: 'Nuevo Testamento',   ntOnly: true },
  { id: 'ot',          label: 'Antiguo Testamento', otOnly: true },
  { id: 'psalms',      label: 'Solo Salmos',        bookNames: ['Salmos', 'Psalms'] },
  { id: 'proverbs',    label: 'Solo Proverbios',    bookNames: ['Proverbios', 'Proverbs'] },
  { id: 'gospels',     label: 'Solo Evangelios',    bookNames: ['Mateo', 'Marcos', 'Lucas', 'Juan', 'Matthew', 'Mark', 'Luke', 'John'] },
]

const NT_FIRST_BOOK_NAMES = ['Mateo', 'Matthew']

function VerseRandomWidget() {
  // Solo versiones LOCALES o importadas (no api.bible que es async por capítulo).
  const localVersions = getAllVersions().filter(v => v.type === 'local' || v.type === 'imported')
  const defaultActive = getActiveVersion()
  const defaultVersionId = (defaultActive && (defaultActive.type === 'local' || defaultActive.type === 'imported'))
    ? defaultActive.id
    : (localVersions[0]?.id || 'rvr1960')

  const [scope, setScope] = useState('all')
  const [versionId, setVersionId] = useState(defaultVersionId)
  const [books, setBooks] = useState([])
  const [booksLoading, setBooksLoading] = useState(true)
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Cargar libros cuando cambia la versión
  useEffect(() => {
    setBooksLoading(true)
    setError(null)
    getBooks(versionId)
      .then(b => { setBooks(b); setBooksLoading(false) })
      .catch(e => { setError(`No se pudieron cargar libros: ${e?.message || e}`); setBooksLoading(false) })
  }, [versionId])

  const draw = async () => {
    setError(null)
    if (booksLoading) { setError('Los libros aún se están cargando, espera un instante…'); return }
    if (books.length === 0) { setError('Esta versión no tiene libros disponibles'); return }

    setLoading(true)
    try {
      // 1. Filtrar libros según el scope
      const scopeData = VERSE_SCOPES.find(s => s.id === scope)
      let candidates = books
      if (scopeData?.bookNames) {
        candidates = books.filter(b => scopeData.bookNames.includes(b.name))
      } else if (scopeData?.ntOnly || scopeData?.otOnly) {
        const ntStart = books.findIndex(b => NT_FIRST_BOOK_NAMES.includes(b.name))
        if (ntStart > 0) {
          candidates = scopeData.ntOnly ? books.slice(ntStart) : books.slice(0, ntStart)
        }
      }
      if (candidates.length === 0) {
        setError('No hay libros que coincidan con el filtro')
        setLoading(false); return
      }

      // 2. Elegir libro al azar
      const book = candidates[Math.floor(Math.random() * candidates.length)]

      // 3. Obtener el número real de capítulos del libro
      let chapterCount = 1
      try {
        chapterCount = await getChapterCount(book.index, versionId)
      } catch {}
      if (!chapterCount || chapterCount < 1) chapterCount = 1

      // 4. Capítulo al azar
      const randomChapter = Math.floor(Math.random() * chapterCount) + 1

      // 5. Cargar capítulo + elegir versículo al azar
      const chapterData = await getChapter(book.index, randomChapter, versionId)
      if (!chapterData || !chapterData.verses || chapterData.verses.length === 0) {
        setError('El capítulo sorteado está vacío, prueba otra vez')
        setLoading(false); return
      }

      const v = chapterData.verses[Math.floor(Math.random() * chapterData.verses.length)]
      const result = {
        text: v.text,
        reference: `${chapterData.bookName} ${chapterData.chapterNum}:${v.verseNum}`,
        type: 'bible',
      }
      setCurrent(result)
      setHistory(h => [result, ...h.filter(x => x.reference !== result.reference)].slice(0, 5))
    } catch (e) {
      console.error('[verse-random]', e)
      setError(`Error al sortear: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="card" style={{ padding: 20 }}>
        <div className="section-h" style={{ marginBottom: 14 }}>
          <h3>Configuración</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <span className="label">Versión</span>
            <select className="field-input" value={versionId}
              onChange={e => setVersionId(e.target.value)}>
              {localVersions.map(v => <option key={v.id} value={v.id}>{v.short} — {v.name}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">Buscar en</span>
            <select className="field-input" value={scope} onChange={e => setScope(e.target.value)}>
              {VERSE_SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
          {booksLoading
            ? 'Cargando libros…'
            : `${books.length} libros disponibles en esta versión`}
        </p>
      </div>

      {error && (
        <div className="card" style={{ padding: 14, background: 'rgba(244,184,64,0.08)', borderColor: 'rgba(244,184,64,0.35)' }}>
          <p style={{ fontSize: 13, color: 'var(--preview)', margin: 0 }}>⚠️ {error}</p>
        </div>
      )}

      <div className="card" style={{ padding: 28, minHeight: 180 }}>
        {!current ? (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontStyle: 'italic' }}>
            Click en "Sortear" para obtener un versículo al azar.
          </p>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--copper-200)',
              letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
              {current.reference}
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.5,
              color: 'var(--text-1)', margin: 0 }}>
              {current.text}
            </p>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={draw} disabled={loading || booksLoading} style={{ flex: 1 }}>
          🎲 {loading ? 'Sorteando…' : booksLoading ? 'Cargando…' : current ? 'Otro versículo' : 'Sortear'}
        </button>
        <button className="btn" disabled={!current}
          onClick={() => current && selectSlide(current)}>
          Proyectar al live
        </button>
      </div>

      {history.length > 1 && (
        <div className="card" style={{ padding: 14 }}>
          <div className="section-h" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 13 }}>Últimos sorteados</h3>
          </div>
          {history.slice(1).map((v, i) => (
            <button key={i} onClick={() => setCurrent(v)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                background: 'transparent', border: 0, cursor: 'pointer',
                color: 'var(--text-2)', fontSize: 12,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ color: 'var(--copper-200)', fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.1em', marginRight: 8 }}>{v.reference}</span>
              {v.text.slice(0, 80)}{v.text.length > 80 && '…'}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ============================================================
// 4. RULETA
// ============================================================
function WheelWidget() {
  const [namesText, setNamesText] = useState('Juan\nMaría\nPedro\nAna\nLucas')
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [removeWinners, setRemoveWinners] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const intervalRef = useRef(null)

  const names = namesText.split('\n').map(n => n.trim()).filter(Boolean)

  const spin = () => {
    if (names.length === 0 || spinning) return
    setSpinning(true)
    setWinner(null)
    setHighlightIdx(0)

    let speed = 60
    let totalIters = 30 + Math.floor(Math.random() * 20)
    let count = 0
    const final = Math.floor(Math.random() * names.length)

    const tick = () => {
      setHighlightIdx(i => (i + 1) % names.length)
      count++
      if (count > totalIters * 0.7) speed += 20
      if (count > totalIters * 0.9) speed += 30

      if (count >= totalIters && (count - totalIters) >= ((final - (count % names.length) + names.length) % names.length)) {
        clearInterval(intervalRef.current)
        const finalName = names[final]
        setHighlightIdx(final)
        setWinner(finalName)
        setSpinning(false)
        if (removeWinners) {
          setNamesText(names.filter((_, i) => i !== final).join('\n'))
        }
        return
      }
      intervalRef.current = setTimeout(tick, speed)
    }
    intervalRef.current = setTimeout(tick, speed)
  }

  useEffect(() => () => clearTimeout(intervalRef.current), [])

  return (
    <>
      <div className="card" style={{ padding: 20 }}>
        <div className="section-h" style={{ marginBottom: 14 }}>
          <h3>Participantes</h3>
          <span className="sub">{names.length} {names.length === 1 ? 'nombre' : 'nombres'}</span>
        </div>
        <textarea className="field-input"
          rows={6}
          value={namesText}
          onChange={e => setNamesText(e.target.value)}
          placeholder="Un nombre por línea..."
          style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 13 }}
          disabled={spinning} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
          fontSize: 13, color: 'var(--text-2)' }}>
          <input type="checkbox" checked={removeWinners} onChange={e => setRemoveWinners(e.target.checked)} />
          Quitar al ganador de la lista al terminar (sorteo sin repetir)
        </label>
      </div>

      <div className="card" style={{ padding: 18, minHeight: 180 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {names.map((n, i) => {
            const isHighlight = highlightIdx === i
            const isWinner = winner === n && !spinning
            return (
              <div key={i}
                style={{
                  padding: '14px 18px', borderRadius: 10, textAlign: 'center',
                  fontSize: isWinner ? 22 : 16,
                  fontWeight: isHighlight || isWinner ? 700 : 500,
                  fontFamily: isWinner ? 'var(--font-display)' : 'inherit',
                  background: isWinner
                    ? 'linear-gradient(180deg, var(--copper-200), var(--copper-300))'
                    : isHighlight
                      ? 'linear-gradient(180deg, rgba(168,95,51,0.32), rgba(128,64,18,0.18))'
                      : 'var(--bg-2)',
                  color: isWinner ? '#1a0e08' : isHighlight ? 'var(--copper-100)' : 'var(--text-2)',
                  border: '1px solid ' + (isWinner ? 'var(--copper-200)' : isHighlight ? 'rgba(232,181,145,0.4)' : 'var(--line-1)'),
                  transition: 'all 0.1s ease',
                  boxShadow: isWinner ? 'var(--shadow-glow-copper)' : 'none',
                }}>
                {n}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={spin} disabled={names.length < 2 || spinning} style={{ flex: 1 }}>
          {spinning ? 'Girando…' : '🎡 Girar ruleta'}
        </button>
        <button className="btn" disabled={!winner || spinning}
          onClick={() => winner && selectSlide({
            type: 'wheel',
            text: winner,
            reference: '¡Ganador!',
          })}>
          Proyectar ganador
        </button>
      </div>
    </>
  )
}

// ============================================================
// HELPERS
// ============================================================
function NumberField({ label, value, onChange, min = 0, max = 99, disabled }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <input type="number" min={min} max={max} value={value}
        disabled={disabled}
        onChange={e => {
          let v = parseInt(e.target.value || '0', 10)
          if (isNaN(v)) v = 0
          v = Math.max(min, Math.min(max, v))
          onChange(v)
        }}
        className="field-input"
        style={{ fontFamily: 'var(--font-mono)', textAlign: 'center', fontSize: 18 }} />
    </div>
  )
}
