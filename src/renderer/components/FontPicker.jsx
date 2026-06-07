import { useEffect, useMemo, useRef, useState } from 'react'
import { listSystemFonts } from '../services/systemFontsService.js'

/**
 * Font picker custom con preview en vivo de cada tipografía.
 *
 * Por qué NO usamos <select> nativo:
 *   Aplicar style={{fontFamily: f.family}} a cada <option> obliga a Chromium
 *   a instanciar TODAS las tipografías del sistema al desplegar (100+ en
 *   Windows). El navegador se congela varios segundos. Es el bug que hemos
 *   peleado dos veces antes.
 *
 * Solución aquí:
 *   - Popover custom.
 *   - Virtual scroll: solo se RENDERIZAN las opciones visibles en el
 *     viewport del popover (~12-16 a la vez), no las 150 a la vez.
 *   - Cada opción visible lleva su fontFamily → el usuario ve cómo se
 *     vería su texto en esa fuente. Al cargar son <20 fuentes, sin freeze.
 *   - Buscador para filtrar.
 *
 * Props:
 *   value             Familia tipográfica actual (string CSS).
 *   onChange(family)  Callback al elegir nueva fuente.
 *   placeholder       Texto cuando no hay valor (opcional).
 */
const ROW_HEIGHT   = 36     // px por opción
const VISIBLE_ROWS = 8      // ventana del virtual scroll (~8 visibles)
const OVERSCAN     = 2      // filas extra antes/después para suavizar

export default function FontPicker({ value, onChange, placeholder = 'Elige fuente…' }) {
  const [fonts, setFonts] = useState([])    // todas las fuentes (cargado async)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  // Carga las fuentes del sistema una vez
  useEffect(() => { listSystemFonts().then(setFonts).catch(() => {}) }, [])

  // Filtro por texto (case/acent-insensitive simple)
  const filtered = useMemo(() => {
    if (!query.trim()) return fonts
    const q = query.toLowerCase().trim()
    return fonts.filter(f => f.family.toLowerCase().includes(q))
  }, [fonts, query])

  // Etiqueta del estado cerrado (intentamos mostrarla en su propia fuente
  // sin disparar la carga masiva — una sola fuente está OK).
  const currentLabel = useMemo(() => {
    if (!value) return placeholder
    // value puede ser '"Cormorant Garamond", serif' — extraemos la primera familia
    const m = String(value).match(/^["']?([^"',]+)/)
    return m ? m[1] : String(value)
  }, [value, placeholder])

  // Cerrar al clicar fuera o al pulsar Esc
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Auto-focus al abrir + reset de query y scroll
  useEffect(() => {
    if (open) {
      setQuery('')
      setScrollTop(0)
      // pequeño delay para que el popover esté en DOM
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Cálculo del slice visible (virtual scroll)
  const total = filtered.length
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx   = Math.min(total, startIdx + VISIBLE_ROWS + OVERSCAN * 2)
  const padTop    = startIdx * ROW_HEIGHT
  const padBottom = (total - endIdx) * ROW_HEIGHT
  const slice     = filtered.slice(startIdx, endIdx)

  const handleChoose = (family) => {
    onChange?.(family)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="font-picker">
      <button
        type="button"
        className="font-picker-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={currentLabel}
        style={{
          // Preview de la fuente seleccionada en el botón cerrado.
          // Una sola fuente — sin riesgo de freeze.
          fontFamily: value || 'inherit',
        }}>
        <span className="font-picker-current">{currentLabel}</span>
        <span className="font-picker-chev" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="font-picker-popover" role="dialog">
          <input
            ref={inputRef}
            className="font-picker-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Buscar entre ${fonts.length} fuentes…`}
            aria-label="Buscar fuente"
          />
          {/* Lista virtualizada */}
          <div
            ref={listRef}
            className="font-picker-list"
            style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS }}
            onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            role="listbox"
            aria-label="Tipografías disponibles">
            {total === 0 ? (
              <div className="font-picker-empty">Sin resultados</div>
            ) : (
              <>
                {/* Spacer superior para no romper el scroll virtual */}
                <div style={{ height: padTop }} aria-hidden="true" />
                {slice.map((f) => {
                  const isActive = value && value.includes(f.family)
                  return (
                    <button
                      key={f.family}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={'font-picker-option' + (isActive ? ' active' : '')}
                      onClick={() => handleChoose(f.family)}
                      // El truco clave: aquí SÍ aplicamos fontFamily porque solo
                      // hay ~12 opciones renderizadas. Sin congelación.
                      style={{
                        fontFamily: f.generic ? 'inherit' : f.family,
                        height: ROW_HEIGHT,
                      }}>
                      <span className="font-picker-option-name">{f.family}</span>
                      {!f.generic && (
                        <span className="font-picker-option-sample" aria-hidden="true">
                          Aa
                        </span>
                      )}
                      {f.generic && (
                        <span className="font-picker-option-tag">genérica</span>
                      )}
                    </button>
                  )
                })}
                <div style={{ height: padBottom }} aria-hidden="true" />
              </>
            )}
          </div>
          <div className="font-picker-footer">
            {filtered.length} de {fonts.length} fuentes
          </div>
        </div>
      )}
    </div>
  )
}
