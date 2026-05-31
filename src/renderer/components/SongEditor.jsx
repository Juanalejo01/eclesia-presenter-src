import { useMemo, useState, useRef, useEffect } from 'react'
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
  const [maxLines, setMaxLines] = useState(song?.maxLines ?? song?.max_lines ?? 4)
  const [tab, setTab] = useState('edit')

  // Snapshot del estado inicial para detectar cambios sin guardar.
  // Si el usuario escribió algo y cierra sin guardar, confirmamos antes
  // de descartar (evita perder una canción a medio escribir por un click
  // accidental fuera del modal).
  const initialRef = useRef(JSON.stringify({
    title: song?.title || '', author: song?.author || '', tags: song?.tags || '',
    sections: song?.sections?.length ? song.sections : [{ type: 'verse', label: 'Estrofa 1', text: '' }],
    maxLines: song?.maxLines ?? song?.max_lines ?? 4,
    themeOverride: song?.theme_override || null,
  }))

  const hasUnsavedChanges = () => {
    const current = JSON.stringify({ title, author, tags, sections, maxLines, themeOverride })
    return current !== initialRef.current
  }

  // Cierre seguro: si hay cambios sin guardar, pedir confirmación.
  const requestClose = () => {
    if (hasUnsavedChanges()) {
      const ok = confirm('Tienes cambios sin guardar. ¿Seguro que quieres cerrar y descartar lo escrito?')
      if (!ok) return
    }
    onCancel()
  }

  // Escape también pasa por la confirmación
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); requestClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, author, tags, sections, maxLines, themeOverride])

  // Theme override por canción. null = usa el theme global de proyección
  // (caso "Igual que en proyección"). Si el usuario configura algo aquí,
  // SOLO afecta a esta canción y no toca el theme global. Cuando se proyecta
  // la canción, SlideRenderer hace merge: override > global theme.
  const [themeOverride, setThemeOverride] = useState(song?.theme_override || null)
  const [styleOpen, setStyleOpen] = useState(false)

  const updateOverride = (patch) => {
    setThemeOverride(prev => ({ ...(prev || {}), ...patch }))
  }
  const clearOverride = () => setThemeOverride(null)
  const hasOverride = themeOverride !== null && Object.keys(themeOverride || {}).length > 0

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
    onSave({
      title: title.trim(),
      author: author.trim(),
      tags: tags.trim(),
      sections,
      maxLines,
      theme_override: hasOverride ? themeOverride : null,
    })
  }

  const sliderVal = ((maxLines - 2) / 6 * 100) + '%'

  return (
    <div className="modal-backdrop" onClick={requestClose}>
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
            <button className="btn btn-ghost" onClick={requestClose} style={{ padding: 6 }}><IconX size={16} /></button>
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
                  <TagSelector value={tags} onChange={setTags} />
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
                <div style={{
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
                  <div className="section-h">
                    <h3 style={{ fontSize: 14 }}>Letra por secciones</h3>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost" onClick={upperAll}
                        title="Convertir toda la letra a mayúsculas">
                        AA · MAYÚS
                      </button>
                      <button className="btn btn-ghost" onClick={lowerAll}
                        title="Convertir toda la letra a minúsculas">
                        aa · minús
                      </button>
                      <button
                        className={'btn ' + (hasOverride ? 'btn-primary' : 'btn-ghost')}
                        onClick={() => setStyleOpen(v => !v)}
                        title="Asignar fondo y tipografía propios a esta canción">
                        🎨 Estilo {hasOverride && '·●'}
                      </button>
                      <button className="btn btn-ghost" onClick={addSection}><IconPlus size={13} /> Sección</button>
                    </div>
                  </div>
                  {styleOpen && (
                    <ThemeOverrideBox
                      override={themeOverride}
                      onUpdate={updateOverride}
                      onClear={clearOverride}
                      onClose={() => setStyleOpen(false)}
                    />
                  )}
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
            <button className="btn" onClick={requestClose}>Cancelar</button>
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

// ============================================================
// ThemeOverrideBox — panel para asignar fondo + tipografía propios
// a la canción. Solo guarda las claves que el usuario realmente
// modifica (los unset siguen heredando del theme global).
// ============================================================
const FONT_PRESETS = [
  { id: 'cormorant', label: 'Cormorant (clásica)', value: '"Cormorant Garamond", serif' },
  { id: 'geist',     label: 'Geist (moderna)',    value: '"Geist", system-ui, sans-serif' },
  { id: 'georgia',   label: 'Georgia (sobria)',   value: 'Georgia, serif' },
  { id: 'serif',     label: 'Serif del sistema',  value: 'serif' },
  { id: 'sans',      label: 'Sans del sistema',   value: 'sans-serif' },
  { id: 'mono',      label: 'Mono (display)',     value: '"Geist Mono", monospace' },
]
const BG_PRESETS = [
  { id: 'azul-noche',   label: 'Azul noche',  gradient: ['#0a1620', '#1e3a5f'] },
  { id: 'cobre-tierra', label: 'Cobre tierra',gradient: ['#3e2411', '#804012'] },
  { id: 'verde-bosque', label: 'Verde bosque',gradient: ['#0a1a12', '#1c4029'] },
  { id: 'negro-puro',   label: 'Negro puro',  solid: '#000000' },
  { id: 'cobre-luz',    label: 'Cobre luz',   gradient: ['#db9f75', '#1a0e08'] },
]

function ThemeOverrideBox({ override, onUpdate, onClear, onClose }) {
  const ov = override || {}
  const fontVal = ov.fontFamily || ''
  const bgKind  = ov.bgType || 'inherit'  // 'inherit' = igual que proyección

  return (
    <div style={{
      marginTop: 10, padding: 14,
      background: 'var(--bg-2)',
      border: '1px solid var(--copper-300)',
      borderRadius: 'var(--r-md)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--copper-100)' }}>
            Estilo de esta canción
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Override individual del tema global. Solo afecta a esta canción al proyectarla.
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 11, padding: '2px 8px' }}>
          ▴ Cerrar
        </button>
      </div>

      {/* TIPOGRAFÍA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="label">Tipografía</span>
        <select
          className="select"
          value={fontVal}
          onChange={e => {
            const v = e.target.value
            if (!v) {
              // 'inherit' — quitar override de fontFamily
              const next = { ...ov }; delete next.fontFamily
              if (Object.keys(next).length === 0) onClear()
              else onUpdate({ fontFamily: undefined })
            } else {
              onUpdate({ fontFamily: v })
            }
          }}>
          <option value="">— Igual que en proyección —</option>
          {FONT_PRESETS.map(f => (
            <option key={f.id} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* TAMAÑO DE FUENTE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="label">
          Tamaño · {ov.fontSize ? `${ov.fontSize}px` : 'igual que proyección'}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="range" min="32" max="120"
            value={ov.fontSize || 64}
            onChange={e => onUpdate({ fontSize: +e.target.value })}
            className="slider"
            style={{ flex: 1, '--val': (((ov.fontSize || 64) - 32) / 88 * 100) + '%' }} />
          {ov.fontSize !== undefined && (
            <button className="btn btn-ghost" onClick={() => onUpdate({ fontSize: undefined })}
              style={{ fontSize: 10, padding: '2px 8px' }}
              title="Quitar override del tamaño">
              ✕ heredar
            </button>
          )}
        </div>
      </div>

      {/* FONDO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="label">Fondo</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              // Limpiar todas las claves de fondo
              const next = { ...ov }
              delete next.bgType; delete next.bgColor; delete next.bgGradient; delete next.bgImage; delete next.bgVideo
              if (Object.keys(next).length === 0) onClear()
              else onUpdate({
                bgType: undefined, bgColor: undefined, bgGradient: undefined,
                bgImage: undefined, bgVideo: undefined,
              })
            }}
            style={{
              all: 'unset', cursor: 'pointer',
              padding: '6px 12px', borderRadius: 8, fontSize: 11,
              background: bgKind === 'inherit' ? 'rgba(168,95,51,0.25)' : 'var(--bg-3)',
              border: '1px solid ' + (bgKind === 'inherit' ? 'rgba(232,181,145,0.4)' : 'var(--line-1)'),
              color: bgKind === 'inherit' ? 'var(--copper-100)' : 'var(--text-2)',
            }}>
            Igual que en proyección
          </button>
          {BG_PRESETS.map(p => {
            const active = p.solid
              ? (ov.bgType === 'solid' && ov.bgColor === p.solid)
              : (ov.bgType === 'gradient' && JSON.stringify(ov.bgGradient) === JSON.stringify(p.gradient))
            return (
              <button key={p.id}
                onClick={() => p.solid
                  ? onUpdate({ bgType: 'solid', bgColor: p.solid, bgGradient: undefined, bgImage: undefined, bgVideo: undefined })
                  : onUpdate({ bgType: 'gradient', bgGradient: p.gradient, bgColor: undefined, bgImage: undefined, bgVideo: undefined })
                }
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 8, fontSize: 11,
                  background: active
                    ? 'rgba(168,95,51,0.30)'
                    : (p.solid ? p.solid : `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`),
                  border: '1px solid ' + (active ? 'rgba(232,181,145,0.45)' : 'rgba(255,255,255,0.1)'),
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                }}>
                {active && '✓ '}{p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {Object.keys(ov).length === 0
            ? 'Sin overrides — usa el theme global'
            : `${Object.keys(ov).length} override(s) activos`}
        </span>
        {Object.keys(ov).length > 0 && (
          <button className="btn btn-ghost btn-danger" onClick={onClear}
            style={{ fontSize: 11 }}>
            Resetear · Igual que en proyección
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// TagSelector — multi-select de etiquetas con 3 presets fijos
// (Alabanza, Adoración, Himno) + opción de crear etiqueta custom.
// Las etiquetas se persisten como string CSV en song.tags para
// compatibilidad con el storage existente.
// ============================================================
const PRESET_TAGS = ['Alabanza', 'Adoración', 'Himno']

function TagSelector({ value, onChange }) {
  // value (string CSV) → array
  const tagsArr = (value || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom]   = useState(false)

  const isSelected = (tag) =>
    tagsArr.some(t => t.toLowerCase() === tag.toLowerCase())

  const toggle = (tag) => {
    if (isSelected(tag)) {
      onChange(tagsArr.filter(t => t.toLowerCase() !== tag.toLowerCase()).join(', '))
    } else {
      onChange([...tagsArr, tag].join(', '))
    }
  }

  const addCustom = () => {
    const t = customInput.trim()
    if (!t) return
    // Evitar duplicados case-insensitive
    if (isSelected(t)) { setCustomInput(''); setShowCustom(false); return }
    onChange([...tagsArr, t].join(', '))
    setCustomInput('')
    setShowCustom(false)
  }

  // Custom tags = las que NO están en los presets
  const customTags = tagsArr.filter(t =>
    !PRESET_TAGS.some(p => p.toLowerCase() === t.toLowerCase())
  )

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '8px 10px',
      background: 'var(--bg-2)',
      border: '1px solid var(--line-1)',
      borderRadius: 'var(--r-md)',
    }}>
      {/* Presets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESET_TAGS.map(tag => {
          const sel = isSelected(tag)
          return (
            <button key={tag} onClick={() => toggle(tag)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '5px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                background: sel
                  ? 'linear-gradient(180deg, rgba(168,95,51,0.30), rgba(128,64,18,0.18))'
                  : 'var(--bg-3)',
                border: '1px solid ' + (sel ? 'rgba(232,181,145,0.45)' : 'var(--line-1)'),
                color: sel ? 'var(--copper-100)' : 'var(--text-2)',
                transition: 'all 0.15s',
              }}>
              {sel && '✓ '}{tag}
            </button>
          )
        })}
        {!showCustom && (
          <button onClick={() => setShowCustom(true)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: 12, fontWeight: 500,
              background: 'transparent',
              border: '1px dashed var(--copper-300)',
              color: 'var(--copper-200)',
            }}>
            + Crear nueva
          </button>
        )}
      </div>

      {/* Tags custom ya añadidas */}
      {customTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap',
          paddingTop: 8, borderTop: '1px dashed var(--line-1)' }}>
          {customTags.map(tag => (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 8px 4px 10px',
              borderRadius: 999, fontSize: 11,
              background: 'var(--bg-3)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-1)',
            }}>
              {tag}
              <button onClick={() => toggle(tag)}
                title="Quitar etiqueta"
                style={{
                  all: 'unset', cursor: 'pointer',
                  fontSize: 14, lineHeight: 1,
                  color: 'var(--text-3)',
                  padding: '0 2px',
                }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Input para crear nueva */}
      {showCustom && (
        <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
          <input className="field-input"
            autoFocus
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addCustom() }
              if (e.key === 'Escape') { setShowCustom(false); setCustomInput('') }
            }}
            placeholder="Ej: Navidad, Resurrección, Juvenil..."
            style={{ height: 28, flex: 1, fontSize: 12 }} />
          <button className="btn btn-primary" onClick={addCustom}
            style={{ fontSize: 11, padding: '0 12px' }}>
            Añadir
          </button>
          <button className="btn btn-ghost" onClick={() => { setShowCustom(false); setCustomInput('') }}
            style={{ fontSize: 11, padding: '0 10px' }}>
            Cancelar
          </button>
        </div>
      )}
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
