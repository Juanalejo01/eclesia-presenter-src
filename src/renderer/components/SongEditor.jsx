import { useMemo, useState } from 'react'
import { songToSlides } from '../services/songSplit.js'
import {
  IconX, IconPlus, IconArrowUp, IconArrowDown, IconCheck, IconChevDown,
} from './Icons.jsx'

const SECTION_TYPES = [
  { value: 'verse',   label: 'Estrofa' },
  { value: 'chorus',  label: 'Coro' },
  { value: 'bridge',  label: 'Puente' },
  { value: 'intro',   label: 'Intro' },
  { value: 'outro',   label: 'Final' },
  { value: 'tag',     label: 'Tag' },
]

// ============================================================
// Helpers de split — usados para auto-dividir letras al pegar o al
// exceder el límite de líneas por sección.
// ============================================================

/**
 * Toma un texto crudo (recién pegado) y lo divide en N "estrofas"
 * basándose en líneas vacías como separador (estándar al copiar letras).
 * Si una estrofa excede maxLines, la sub-divide para que cada bloque
 * resultante sea ≤ maxLines.
 *
 * Devuelve array de strings (cada elemento = letra de una sección nueva).
 */
function splitPastedSong(rawText, maxLines = 4) {
  if (!rawText) return []
  // Normalizar saltos de línea
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Agrupar por estrofas (separador = líneas vacías consecutivas)
  const stanzas = []
  let current = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) { stanzas.push(current); current = [] }
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) stanzas.push(current)

  // Si NO hay líneas vacías, todo cae en una estrofa. La cortamos por maxLines.
  if (stanzas.length === 1 && stanzas[0].length > maxLines) {
    const single = stanzas[0]
    const out = []
    for (let i = 0; i < single.length; i += maxLines) {
      out.push(single.slice(i, i + maxLines).join('\n'))
    }
    return out
  }

  // Si una estrofa excede maxLines, la dividimos en sub-secciones
  const result = []
  for (const stanza of stanzas) {
    if (stanza.length <= maxLines) {
      result.push(stanza.join('\n'))
    } else {
      for (let i = 0; i < stanza.length; i += maxLines) {
        result.push(stanza.slice(i, i + maxLines).join('\n'))
      }
    }
  }
  return result
}

/**
 * Crea un array de secciones a partir de un texto pegado.
 * Distribuye según tipo: si hay 1 sola, "Estrofa". Si hay varias,
 * alterna heurísticamente (estrofa, coro, estrofa, coro…).
 */
function buildSectionsFromPaste(rawText, maxLines = 4) {
  const chunks = splitPastedSong(rawText, maxLines)
  return chunks.map((text, i) => ({
    type: 'verse',
    label: `Estrofa ${i + 1}`,
    text,
  }))
}

export default function SongEditor({ song, onSave, onCancel }) {
  const [title, setTitle]       = useState(song?.title || '')
  const [author, setAuthor]     = useState(song?.author || '')
  const [tags, setTags]         = useState(song?.tags || '')
  const [sections, setSections] = useState(
    song?.sections?.length ? song.sections : [{ type: 'verse', label: 'Estrofa 1', text: '' }]
  )
  const [maxLines, setMaxLines] = useState(song?.maxLines ?? 4)
  const [tab, setTab] = useState('edit')

  const presentationSlides = useMemo(
    () => songToSlides({ title, sections }, { maxLines }),
    [title, sections, maxLines]
  )

  const addSection = () => {
    const count = sections.filter(s => s.type === 'verse').length + 1
    setSections([...sections, { type: 'verse', label: `Estrofa ${count}`, text: '' }])
  }
  const updateSection = (i, patch) => setSections(sections.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const removeSection = (i) => setSections(sections.filter((_, idx) => idx !== i))

  // Convierte la letra de TODAS las secciones a mayúsculas (operación bulk).
  // Útil para canciones que se proyectan estilo broadcast/clásico.
  const upperAll = () => {
    setSections(sections.map(s => ({ ...s, text: (s.text || '').toUpperCase() })))
  }
  // Inverso: deja todo en formato normal (capitalización natural según primera letra).
  const lowerAll = () => {
    setSections(sections.map(s => ({ ...s, text: (s.text || '').toLowerCase() })))
  }
  const moveSection = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= sections.length) return
    const copy = [...sections]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    setSections(copy)
  }

  const handleSave = () => {
    if (!title.trim()) return
    onSave({ title: title.trim(), author: author.trim(), tags: tags.trim(), sections, maxLines })
  }

  const sliderVal = ((maxLines - 2) / 6 * 100) + '%'

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ width: 'min(1200px, 96vw)', maxHeight: '92vh' }}>
        <div className="modal-header">
          <div className="modal-title">{song ? 'Editar canción' : 'Nueva canción'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modal-tabs">
              <button className={'modal-tab ' + (tab === 'edit' ? 'active' : '')} onClick={() => setTab('edit')}>Editar</button>
              <button className={'modal-tab ' + (tab === 'preview' ? 'active' : '')} onClick={() => setTab('preview')}>
                Presentación · {presentationSlides.length}
              </button>
            </div>
            <button className="btn btn-ghost" onClick={onCancel} style={{ padding: 6 }}><IconX size={16} /></button>
          </div>
        </div>

        <div className="modal-body">
          {tab === 'edit' && (
            <>
              <div className="field-row">
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <span className="label">Título <span className="req">*</span></span>
                  <input className="field-input" placeholder="Nombre de la canción"
                    value={title} onChange={e => setTitle(e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <span className="label">Autor / compositor</span>
                  <input className="field-input" placeholder="Ej: Marcos Witt"
                    value={author} onChange={e => setAuthor(e.target.value)} />
                </div>
                <div className="field">
                  <span className="label">Etiquetas</span>
                  <input className="field-input" placeholder="adoración, clásica…"
                    value={tags} onChange={e => setTags(e.target.value)} />
                </div>
              </div>

              <div className="split-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Auto-split de slides largos</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                      Máximo de líneas por slide · {maxLines}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--copper-200)' }}>
                    {presentationSlides.length} slides totales
                  </span>
                </div>
                <input type="range" min="2" max="8" value={maxLines}
                  onChange={e => setMaxLines(+e.target.value)} className="slider"
                  style={{ '--val': sliderVal }} />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Si una sección excede esto, se divide en sub-slides (ej: estrofa de 8 líneas → 2 slides de 4).
                </span>
              </div>

              <div>
                {/* Barra de ajustes STICKY — siempre accesible mientras se
                    hace scroll por las secciones. */}
                <div className="section-h" style={{
                  marginBottom: 10,
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: 'linear-gradient(180deg, var(--bg-1) 70%, transparent)',
                  paddingBlock: 10,
                  marginInline: -4,
                  paddingInline: 4,
                  backdropFilter: 'blur(6px)',
                }}>
                  <h3 style={{ fontSize: 14 }}>Letra por secciones</h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" onClick={upperAll}
                      title="Convertir toda la letra a mayúsculas">
                      AA · MAYÚS
                    </button>
                    <button className="btn btn-ghost" onClick={lowerAll}
                      title="Convertir toda la letra a minúsculas">
                      aa · minús
                    </button>
                    <button className="btn btn-ghost" onClick={addSection}><IconPlus size={13} /> Sección</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sections.map((section, i) => (
                    <SectionRow key={i} section={section} index={i}
                      total={sections.length} maxLines={maxLines}
                      onChange={(patch) => updateSection(i, patch)}
                      onRemove={() => removeSection(i)}
                      onMove={(dir) => moveSection(i, dir)}
                      onPasteMultiSection={(chunks) => {
                        // Reemplaza esta sección con la primera del paste y
                        // añade el resto como secciones nuevas a continuación.
                        if (chunks.length === 0) return
                        const before = sections.slice(0, i)
                        const after  = sections.slice(i + 1)
                        const newSections = chunks.map((text, idx) => ({
                          type: 'verse',
                          label: idx === 0 && section.label
                            ? section.label
                            : `Estrofa ${before.length + idx + 1}`,
                          text,
                        }))
                        // Re-numerar las posteriores que sean estrofas auto
                        const renumbered = after.map((s, idx) => (
                          s.type === 'verse' && /^Estrofa\s+\d+$/.test(s.label || '')
                            ? { ...s, label: `Estrofa ${before.length + newSections.length + idx + 1}` }
                            : s
                        ))
                        setSections([...before, ...newSections, ...renumbered])
                      }}
                      onOverflowToNewSection={(remainingLines) => {
                        // El usuario excedió maxLines en esta sección.
                        // Mueve las líneas excedentes a una nueva sección
                        // que aparece DESPUÉS de esta.
                        const before = sections.slice(0, i + 1)
                        const after  = sections.slice(i + 1)
                        const newCount = sections.filter(s => s.type === 'verse').length + 1
                        const overflow = {
                          type: 'verse',
                          label: `Estrofa ${newCount}`,
                          text: remainingLines.join('\n'),
                        }
                        setSections([...before, overflow, ...after])
                      }} />
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'preview' && <PresentationPreview slides={presentationSlides} />}
        </div>

        <div className="modal-footer">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
            {sections.length} secciones · {presentationSlides.length} slides al proyectar
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onCancel}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!title.trim()}>
              <IconCheck size={14} /> Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionRow({
  section, index, total, maxLines,
  onChange, onRemove, onMove,
  onPasteMultiSection,    // (chunks: string[]) → reemplaza esta sección + añade el resto
  onOverflowToNewSection, // (remainingLines: string[]) → mueve líneas a sección nueva
}) {
  const lineCount = (section.text || '').split('\n').filter(l => l.trim()).length
  const willSplit = lineCount > maxLines
  const splitCount = Math.ceil(lineCount / maxLines) || 1

  // Maneja paste: si el contenido pegado tiene varias estrofas (líneas en
  // blanco como separador) o excede maxLines, lo divide automáticamente
  // en múltiples secciones.
  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || ''
    if (!pasted.trim()) return
    const chunks = splitPastedSong(pasted, maxLines)
    // Si solo hay 1 chunk y cabe en una sección, dejamos el paste normal
    if (chunks.length <= 1) return
    e.preventDefault()
    onPasteMultiSection?.(chunks)
  }

  // Maneja Enter: si el usuario añade una línea que hace que la sección
  // exceda maxLines, mueve TODA la línea nueva (y siguientes) a una
  // sección nueva automáticamente.
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
    const textarea = e.target
    const cursor = textarea.selectionStart
    const text = textarea.value
    // Líneas antes del cursor (incluyendo la actual)
    const linesBefore = text.slice(0, cursor).split('\n')
    const nonEmptyBefore = linesBefore.filter(l => l.trim()).length
    // Si ya estamos en maxLines y vamos a añadir UNA MÁS, derivamos a sección nueva
    if (nonEmptyBefore >= maxLines) {
      e.preventDefault()
      // Texto que se queda: hasta el cursor
      const keep = text.slice(0, cursor).trimEnd()
      // Texto que se va a la nueva sección: desde cursor en adelante
      const overflow = text.slice(cursor).trimStart()
      onChange({ text: keep })
      // Crear sección nueva con la parte que excede (o vacía si empezaba en Enter)
      onOverflowToNewSection?.(overflow ? overflow.split('\n') : [''])
    }
  }

  return (
    <div className="section-block">
      <div className="section-head">
        <select className="select" style={{ height: 26, fontSize: 11 }}
          value={section.type} onChange={e => onChange({ type: e.target.value })}>
          {SECTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input className="field-input" value={section.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Etiqueta..."
          style={{ height: 26, flex: 1, fontSize: 12 }} />
        {willSplit && (
          <span className="song-tag" style={{
            background: 'rgba(244,184,64,0.15)', borderColor: 'rgba(244,184,64,0.35)', color: 'var(--preview)',
          }} title={`Esta sección excede ${maxLines} líneas, se proyectará en ${splitCount} slides`}>
            {splitCount} slides
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => onMove(-1)} disabled={index === 0}><IconArrowUp size={12} /></button>
        <button className="btn btn-ghost" onClick={() => onMove(1)} disabled={index === total - 1}><IconArrowDown size={12} /></button>
        <button className="btn btn-ghost btn-danger" onClick={onRemove}><IconX size={12} /></button>
      </div>
      <textarea className="field-input"
        style={{
          border: 0, borderRadius: 0,
          minHeight: 140, width: '100%', resize: 'vertical',
          fontSize: 14, lineHeight: 1.5,
          padding: '12px 16px',
        }}
        value={section.text}
        onChange={e => onChange({ text: e.target.value })}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder="Escribe la letra aquí…&#10;Al exceder el máximo se crea una sección nueva automáticamente.&#10;Pegar una canción entera la divide por estrofas." />
      <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
        {lineCount} línea{lineCount !== 1 ? 's' : ''} · max {maxLines}
      </div>
    </div>
  )
}

function PresentationPreview({ slides }) {
  if (slides.length === 0) {
    return <p className="empty-text" style={{ textAlign: 'center', padding: 32 }}>
      Sin contenido. Añade letra a las secciones para ver la presentación.
    </p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
        Así se verá la canción al proyectarla — cada caja es un slide independiente al que se navega con ←/→.
      </p>
      {slides.map((slide, i) => (
        <div key={i} style={{
          background: 'linear-gradient(135deg, #14100d, #0a1620)',
          borderRadius: 'var(--r-md)', border: '1px solid var(--line-1)', padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--copper-200)', fontWeight: 700, letterSpacing: '0.08em' }}>
              SLIDE {i + 1} / {slides.length}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
              {slide.sectionLabel} · {slide.sectionType}
            </span>
          </div>
          <p style={{
            color: '#fff', fontSize: 14, fontFamily: 'var(--font-display)',
            whiteSpace: 'pre-line', lineHeight: 1.5, margin: 0,
          }}>{slide.text}</p>
        </div>
      ))}
    </div>
  )
}
