import { useMemo, useState, useRef, useEffect } from 'react'
import { songToSlides } from '../services/songSplit.js'
import {
  parseCanvas, sectionsToCanvas, getHashContext, SECTION_SUGGESTIONS,
} from '../services/songCanvas.js'
import { confirm } from '../services/dialogService.js'
import { IconX, IconCheck } from './Icons.jsx'

export default function SongEditor({ song, onSave, onCancel }) {
  const [title, setTitle]   = useState(song?.title || '')
  const [author, setAuthor] = useState(song?.author || '')
  const [tags, setTags]     = useState(song?.tags || '')
  // Lienzo único: toda la letra en un solo texto. Doble Enter = nuevo
  // slide, "#Coro" etiqueta secciones. Se parsea a sections[] al vuelo.
  const [canvas, setCanvas] = useState(
    song?.sections?.length ? sectionsToCanvas(song.sections) : ''
  )
  const [maxLines, setMaxLines] = useState(song?.maxLines ?? song?.max_lines ?? 4)
  const [tab, setTab] = useState('edit')

  // El menú "#" vive en LyricsCanvas; estos refs dejan que el handler
  // global de Escape cierre el menú en vez del modal.
  const hashMenuOpenRef = useRef(false)
  const closeHashMenuRef = useRef(null)
  const insertHeaderRef = useRef(null)

  // Theme override por canción. null = usa el theme global de proyección.
  // DECLARADO AQUÍ ARRIBA (antes de los useEffect/helpers que lo usan) para
  // evitar un ReferenceError TDZ que dejaba la app en pantalla negra al abrir
  // el editor.
  const [themeOverride, setThemeOverride] = useState(song?.theme_override || null)
  const [styleOpen, setStyleOpen] = useState(false)

  // Snapshot del estado inicial para detectar cambios sin guardar.
  // Si el usuario escribió algo y cierra sin guardar, confirmamos antes
  // de descartar (evita perder una canción a medio escribir por un click
  // accidental fuera del modal).
  const initialRef = useRef(JSON.stringify({
    title: song?.title || '', author: song?.author || '', tags: song?.tags || '',
    canvas: song?.sections?.length ? sectionsToCanvas(song.sections) : '',
    maxLines: song?.maxLines ?? song?.max_lines ?? 4,
    themeOverride: song?.theme_override || null,
  }))

  const hasUnsavedChanges = () => {
    const current = JSON.stringify({ title, author, tags, canvas, maxLines, themeOverride })
    return current !== initialRef.current
  }

  // Cierre seguro: si hay cambios sin guardar, pedir confirmación.
  const requestClose = async () => {
    if (hasUnsavedChanges()) {
      const ok = await confirm({
        title: 'Cambios sin guardar',
        message: '¿Cerrar y descartar lo que has escrito?',
        detail: 'Los cambios en esta canción se perderán y no podrás recuperarlos.',
        confirmLabel: 'Descartar y cerrar',
        cancelLabel: 'Seguir editando',
        variant: 'danger',
      })
      if (!ok) return
    }
    onCancel()
  }

  // Escape también pasa por la confirmación. Si el menú "#" está abierto,
  // Escape lo cierra a él (no al modal).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (hashMenuOpenRef.current) { closeHashMenuRef.current?.(); return }
      requestClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, author, tags, canvas, maxLines, themeOverride])

  // (themeOverride y styleOpen se declaran arriba, junto a los otros useState,
  //  para evitar el TDZ que rompía el render del editor.)
  const updateOverride = (patch) => {
    setThemeOverride(prev => ({ ...(prev || {}), ...patch }))
  }
  const clearOverride = () => setThemeOverride(null)
  const hasOverride = themeOverride !== null && Object.keys(themeOverride || {}).length > 0

  // sections[] derivadas del lienzo — mismo modelo que BD/proyección/móvil.
  const parsedSections = useMemo(() => parseCanvas(canvas), [canvas])

  const presentationSlides = useMemo(
    () => songToSlides({ title, sections: parsedSections }, { maxLines }),
    [title, parsedSections, maxLines]
  )

  // Mayús/minús sobre la letra; los encabezados "#..." no se tocan para
  // que el parser los siga reconociendo tal cual los escribió el usuario.
  const mapLyricLines = (fn) => {
    setCanvas(canvas.split('\n')
      .map(l => l.trimStart().startsWith('#') ? l : fn(l))
      .join('\n'))
  }
  const upperAll = () => mapLyricLines(l => l.toUpperCase())
  const lowerAll = () => mapLyricLines(l => l.toLowerCase())

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      author: author.trim(),
      tags: tags.trim(),
      sections: parsedSections,
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
                    <h3 style={{ fontSize: 14 }}>Letra</h3>
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
                      <button className="btn btn-ghost"
                        onClick={() => insertHeaderRef.current?.()}
                        title="Insertar etiqueta de sección (Coro, Estrofa, Puente…)">
                        # Etiqueta
                      </button>
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
                <LyricsCanvas
                  value={canvas}
                  onChange={setCanvas}
                  menuOpenRef={hashMenuOpenRef}
                  closeMenuRef={closeHashMenuRef}
                  insertHeaderRef={insertHeaderRef}
                />
                <div style={{
                  padding: '6px 4px', fontSize: 10, color: 'var(--text-4)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {parsedSections.length} secci{parsedSections.length === 1 ? 'ón' : 'ones'} ·
                  {' '}doble Enter = nuevo slide · escribe <b>#</b> para etiquetar (Coro, Estrofa…)
                </div>
              </div>
            </>
          )}

          {tab === 'preview' && <PresentationPreview slides={presentationSlides} />}
        </div>

        <div className="modal-footer">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
            {parsedSections.length} secciones · {presentationSlides.length} slides al proyectar
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

// ============================================================
// LyricsCanvas — el lienzo único de la letra.
//
// Un solo textarea con toda la canción. Doble Enter separa slides;
// al escribir "#" a inicio de línea se abre un menú con las partes
// (Coro, Estrofa, Puente…) navegable con ↑/↓ + Enter, o click.
// La posición del menú se aproxima por número de línea (fuente y
// line-height fijos), suficiente sin recurrir a un mirror div.
// ============================================================
const CANVAS_FONT_SIZE = 14
const CANVAS_LINE_HEIGHT = 1.5
const CANVAS_PADDING = 12

function LyricsCanvas({ value, onChange, menuOpenRef, closeMenuRef, insertHeaderRef }) {
  const taRef = useRef(null)
  const [menu, setMenu] = useState(null)   // { start, query, top } | null
  const [selIdx, setSelIdx] = useState(0)
  const pendingCaretRef = useRef(null)

  const matches = useMemo(() => {
    if (!menu) return []
    const q = menu.query.trim().toLowerCase()
    return SECTION_SUGGESTIONS.filter(s => s.label.toLowerCase().startsWith(q))
  }, [menu])
  const open = !!menu && matches.length > 0

  // Estado compartido con SongEditor (Escape global + botón "# Etiqueta").
  useEffect(() => { menuOpenRef.current = open }, [open, menuOpenRef])
  useEffect(() => {
    closeMenuRef.current = () => setMenu(null)
    return () => { closeMenuRef.current = null }
  }, [closeMenuRef])

  // Recoloca el caret tras una inserción programática (menú o botón).
  useEffect(() => {
    if (pendingCaretRef.current == null || !taRef.current) return
    const pos = pendingCaretRef.current
    pendingCaretRef.current = null
    taRef.current.focus()
    taRef.current.setSelectionRange(pos, pos)
  }, [value])

  const refreshMenu = (text, caret) => {
    const ctx = getHashContext(text, caret)
    if (!ctx) { setMenu(null); return }
    const ta = taRef.current
    const lineHeight = CANVAS_FONT_SIZE * CANVAS_LINE_HEIGHT
    const linesBefore = text.slice(0, caret).split('\n').length
    const top = CANVAS_PADDING + linesBefore * lineHeight - (ta?.scrollTop || 0)
    setMenu({ ...ctx, top: Math.max(8, top) })
    setSelIdx(0)
  }

  const apply = (suggestion) => {
    if (!menu) return
    const ta = taRef.current
    const caret = ta ? ta.selectionStart : menu.start + 1 + menu.query.length
    const next = value.slice(0, menu.start) + '#' + suggestion.label + '\n' + value.slice(caret)
    pendingCaretRef.current = menu.start + suggestion.label.length + 2
    setMenu(null)
    onChange(next)
  }

  // Botón "# Etiqueta" de la barra del editor: inserta "#" en un bloque
  // nuevo (con la separación de línea en blanco que haga falta) y abre el menú.
  useEffect(() => {
    insertHeaderRef.current = () => {
      const ta = taRef.current
      if (!ta) return
      const caret = ta.selectionStart
      const before = value.slice(0, caret)
      const ins = !before ? '#' : /\n\n$/.test(before) ? '#' : /\n$/.test(before) ? '\n#' : '\n\n#'
      const next = before + ins + value.slice(ta.selectionEnd)
      const newCaret = caret + ins.length
      pendingCaretRef.current = newCaret
      onChange(next)
      refreshMenu(next, newCaret)
    }
    return () => { insertHeaderRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, insertHeaderRef])

  const handleKeyDown = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => (i + 1) % matches.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => (i - 1 + matches.length) % matches.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); apply(matches[selIdx]) }
    // Escape lo gestiona el handler global del modal (cierra solo el menú).
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea ref={taRef} className="field-input"
        style={{
          minHeight: 320, width: '100%', resize: 'vertical',
          fontSize: CANVAS_FONT_SIZE, lineHeight: CANVAS_LINE_HEIGHT,
          padding: `${CANVAS_PADDING}px 16px`,
        }}
        value={value}
        onChange={e => { onChange(e.target.value); refreshMenu(e.target.value, e.target.selectionStart) }}
        onSelect={e => refreshMenu(e.target.value, e.target.selectionStart)}
        onScroll={() => { if (menu && taRef.current) refreshMenu(value, taRef.current.selectionStart) }}
        onBlur={() => setMenu(null)}
        spellCheck={false}
        placeholder={'Escribe aquí toda la letra…\n\nDeja una línea en blanco (doble Enter) para empezar un slide nuevo.\nEscribe # para etiquetar una parte: #Coro, #Estrofa, #Puente…'}
        onKeyDown={handleKeyDown} />
      {open && (
        <div style={{
          position: 'absolute', top: menu.top, left: 18, zIndex: 30,
          minWidth: 180, overflow: 'hidden',
          background: 'var(--bg-2)',
          border: '1px solid var(--copper-300)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>
          {matches.map((s, i) => (
            <div key={s.label}
              onMouseDown={e => { e.preventDefault(); apply(s) }}
              onMouseEnter={() => setSelIdx(i)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                background: i === selIdx ? 'rgba(168,95,51,0.25)' : 'transparent',
                color: i === selIdx ? 'var(--copper-100)' : 'var(--text-1)',
              }}>
              <span><span style={{ color: 'var(--copper-200)' }}>#</span> {s.label}</span>
            </div>
          ))}
          <div style={{
            padding: '5px 12px', fontSize: 10, color: 'var(--text-4)',
            fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--line-1)',
          }}>
            ↑↓ navegar · Enter elegir
          </div>
        </div>
      )}
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
