import { useEffect, useState } from 'react'
import MediaPicker from './MediaPicker.jsx'
import SlideRenderer from './SlideRenderer.jsx'
import LowerThirdRenderer from './LowerThirdRenderer.jsx'
import {
  useTheme, setTheme as setStoredTheme, setOverlay, applyOverlayPreset, OVERLAY_PRESETS, resetTheme,
} from '../services/themeStore.js'
import { listSystemFonts } from '../services/systemFontsService.js'
import { confirm, alert } from '../services/dialogService.js'
import {
  IconExternal, IconMonitor, IconLayers, IconRefresh,
} from './Icons.jsx'

const TRANSITION_TYPES = [
  { value: 'none',        label: 'Ninguna' },
  { value: 'fade',        label: 'Fade' },
  { value: 'dissolve',    label: 'Dissolve (cine)' },
  { value: 'slide-left',  label: 'Slide ◀' },
  { value: 'slide-right', label: 'Slide ▶' },
  { value: 'slide-up',    label: 'Slide ▲' },
  { value: 'slide-down',  label: 'Slide ▼' },
  { value: 'zoom-in',     label: 'Zoom in' },
  { value: 'zoom-out',    label: 'Zoom out' },
  { value: 'flip',        label: 'Flip horizontal' },
  { value: 'flip-x',      label: 'Flip vertical' },
  { value: 'reveal',      label: 'Reveal ↑' },
  { value: 'ken-burns',   label: 'Ken Burns' },
]

const DEMO_SLIDES = [
  { text: 'EN el principio crió Dios los cielos y la tierra.', reference: 'Génesis 1:1', type: 'bible' },
  { text: 'Jehová es mi pastor; nada me faltará.', reference: 'Salmos 23:1', type: 'bible' },
  { text: 'Todo lo puedo en Cristo que me fortalece.', reference: 'Filipenses 4:13', type: 'bible' },
]

const BG_TYPES = [
  { value: 'solid', label: 'Sólido' },
  { value: 'gradient', label: 'Gradiente' },
  { value: 'image', label: 'Imagen' },
  { value: 'video', label: 'Video' },
  { value: 'transparent', label: 'Transparente' },
]

const ALIGN = [
  { value: 'top', label: 'Arriba' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom', label: 'Abajo' },
]

const FULLSCREEN_PRESETS = [
  { id: 'azul',      label: 'Clásico azul', bg: 'linear-gradient(135deg, #0a1620 0%, #1e3a5f 60%, #0a1620 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#0a1620', '#1e3a5f'], fontColor: '#ffffff', fontSize: 64, textAlign: 'center' } },
  { id: 'atardecer', label: 'Atardecer', bg: 'linear-gradient(135deg, #3e2411 0%, #804012 50%, #1a0e08 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#3e2411', '#804012'], fontColor: '#f4e6d7', fontSize: 64, textAlign: 'center' } },
  { id: 'bosque',    label: 'Bosque', bg: 'linear-gradient(135deg, #0a1a12 0%, #1c4029 60%, #0a1a12 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#0a1a12', '#1c4029'], fontColor: '#ecfdf5', fontSize: 64, textAlign: 'center' } },
  { id: 'negro',     label: 'Negro puro', bg: '#000000',
    theme: { bgType: 'solid', bgColor: '#000000', fontColor: '#ffffff', fontSize: 72, textAlign: 'center' } },
  { id: 'marmol',    label: 'Mármol cobre', bg: 'radial-gradient(ellipse at 30% 20%, #db9f75 0%, #804012 40%, #1a0e08 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#db9f75', '#1a0e08'], fontColor: '#ffffff', fontSize: 64, textAlign: 'center' } },
  { id: 'vitral',    label: 'Vitral', bg: 'conic-gradient(from 200deg at 50% 50%, #122324, #804012, #db9f75, #2f3a32, #122324)',
    theme: { bgType: 'gradient', bgGradient: ['#122324', '#804012'], fontColor: '#ffffff', fontSize: 64, textAlign: 'center' } },
]

export default function ProjectionPanel({ slide }) {
  const [hasElectron] = useState(() => !!window.electron?.projection)
  const [openModes, setOpenModes] = useState([])
  const [displays, setDisplays]   = useState([])
  const theme   = useTheme()
  const [preview, setPreview] = useState(slide || DEMO_SLIDES[0])
  const [activePreset, setActivePreset] = useState(null)
  const [activeOverlayPreset, setActiveOverlayPreset] = useState(null)
  const [editorTab, setEditorTab] = useState('fullscreen')  // 'fullscreen' | 'overlay'

  useEffect(() => { if (slide) setPreview(slide) }, [slide])

  useEffect(() => {
    if (!hasElectron) return
    window.electron.projection.state().then(s => {
      setOpenModes(s.open); setDisplays(s.displays)
    })
  }, [hasElectron])

  const refreshState = async () => {
    if (!hasElectron) return
    const s = await window.electron.projection.state()
    setOpenModes(s.open); setDisplays(s.displays)
  }

  const updateTheme   = (patch) => setStoredTheme(patch)
  const updateOverlay = (patch) => setOverlay(patch)

  const open = async (mode, displayId) => {
    if (!hasElectron) {
      await alert({
        title: 'Modo solo preview',
        message: 'Las ventanas de proyección requieren la app nativa.',
        detail: 'En navegador solo puedes previsualizar el resultado. Usa `npm run dev` o instala la app de escritorio.',
        okLabel: 'Entendido',
        variant: 'info',
      })
      return
    }
    await window.electron.projection.open({ mode, displayId })
    refreshState()
  }
  const close = async (mode) => {
    if (!hasElectron) return
    await window.electron.projection.close(mode)
    refreshState()
  }

  if (!theme) return null

  const isOpen = (mode) => openModes.includes(mode)
  const cyclePreview = () => {
    const idx = DEMO_SLIDES.findIndex(s => s.text === preview?.text)
    setPreview(DEMO_SLIDES[(idx + 1) % DEMO_SLIDES.length])
  }
  const openAll = async () => {
    if (!isOpen('background')) await open('background')
    if (!isOpen('overlay')) await open('overlay')
  }

  // Si ambas ventanas (background + overlay) están abiertas, el botón
  // grande del header pasa a "Cerrar todas" — pulsándolo se cierran las
  // dos. Así el mismo botón sirve para abrir Y cerrar (toggle real).
  const allOpen = isOpen('background') && isOpen('overlay')
  const closeAll = async () => {
    if (isOpen('overlay')) await close('overlay')
    if (isOpen('background')) await close('background')
  }
  const toggleAll = () => allOpen ? closeAll() : openAll()

  return (
    <div className="workspace">
      <div className="ws-header">
        <div className="ws-title">
          <h1 className="ws-h1">Edición</h1>
          <span className="ws-sub">
            Ventanas nativas · capturables por OBS
            {!hasElectron && <span style={{ color: 'var(--preview)', marginLeft: 8 }}>· Solo preview en navegador</span>}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={cyclePreview}><IconRefresh size={14} /> Probar transición</button>
          <button
            className={allOpen ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={toggleAll}
            title={allOpen ? 'Cerrar el proyector y el overlay' : 'Abrir el proyector y el overlay'}>
            <IconExternal size={14} /> {allOpen ? 'Cerrar todas' : 'Abrir todas'}
          </button>
        </div>
      </div>

      <div className="ws-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Aviso suave: el control de ventanas se gestiona en Transmisión */}
          {!hasElectron && (
            <div className="card" style={{ padding: 12, fontSize: 12, color: 'var(--preview)' }}>
              ⚠ Solo previsualización en navegador. Las ventanas reales requieren la app instalada.
            </div>
          )}

          {/* Tabs editor */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', borderBottom: '1px solid var(--line-1)',
              background: 'var(--bg-1)',
            }}>
              <TabButton
                active={editorTab === 'fullscreen'}
                onClick={() => setEditorTab('fullscreen')}
                icon={<IconMonitor size={14} />}
                label="Pantalla completa"
              />
              <TabButton
                active={editorTab === 'overlay'}
                onClick={() => setEditorTab('overlay')}
                icon={<IconLayers size={14} />}
                label="Overlay (Lower-Third)"
              />
            </div>

            <div style={{ padding: 18 }}>
              {editorTab === 'fullscreen' && (
                <FullscreenEditor
                  theme={theme} preview={preview}
                  activePreset={activePreset} setActivePreset={setActivePreset}
                  updateTheme={updateTheme}
                />
              )}
              {editorTab === 'overlay' && (
                <OverlayEditor
                  theme={theme} preview={preview}
                  activePreset={activeOverlayPreset} setActivePreset={setActiveOverlayPreset}
                  updateOverlay={updateOverlay}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Editor: Pantalla completa ----------
function FullscreenEditor({ theme, preview, activePreset, setActivePreset, updateTheme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Big preview */}
      <div>
        <div className="section-h">
          <h3>Vista previa</h3>
          <span className="sub">{activePreset || theme.bgType}</span>
        </div>
        <div className="projection-preview" style={{ background: 'transparent', padding: 0 }}>
          <SlideRenderer slide={preview} theme={theme} />
        </div>
      </div>

      {/* Presets de fondo */}
      <div>
        <div className="section-h">
          <h3>Estilos predefinidos</h3>
          <span className="sub">{FULLSCREEN_PRESETS.length} plantillas · personalizables</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${FULLSCREEN_PRESETS.length}, 1fr)`, gap: 10 }}>
          {FULLSCREEN_PRESETS.map(p => (
            <div key={p.id}
              className={'style-card' + (activePreset === p.id ? ' active' : '')}
              onClick={() => {
                // Aplicar SOLO los campos visuales del preset (fondo, colores).
                // NO tocar tamaño de letra, alineación, fuente, etc. — esos son
                // ajustes personales del usuario que no deben resetearse al
                // cambiar de plantilla.
                const { fontSize, fontFamily, fontWeight, textAlign, ...visualOnly } = p.theme
                updateTheme(visualOnly)
                setActivePreset(p.id)
              }}
              style={{ background: p.bg }}>
              <span className="label-aa">Aa</span>
              <span className="label-name">{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Customization */}
      <CustomizationGrid theme={theme} updateTheme={updateTheme} />
    </div>
  )
}

function CustomizationGrid({ theme, updateTheme }) {
  const [fonts, setFonts] = useState([])
  useEffect(() => { listSystemFonts().then(setFonts) }, [])

  return (
    <div>
      <div className="section-h">
        <h3>Personalización avanzada</h3>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            const ok = await confirm({
              title: 'Restablecer tema de proyección',
              message: '¿Restablecer el tema a los valores por defecto?',
              detail: 'Vuelve al degradado azul, fuente Cormorant, texto blanco y tamaño 64, y limpia fondos de imagen/vídeo. Útil si la proyección se ve negra.',
              confirmLabel: 'Restablecer',
              cancelLabel: 'Cancelar',
              variant: 'default',
            })
            if (ok) {
              resetTheme()
            }
          }}
          title="Vuelve el fondo, la fuente y los colores a los valores por defecto"
          style={{ fontSize: 11, height: 28 }}>
          ↺ Restablecer tema
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="field">
          <span className="label">Fondo</span>
          <SegmentedControl
            options={BG_TYPES} value={theme.bgType}
            onChange={v => updateTheme({ bgType: v })} />
        </div>

        <div className="field">
          <span className="label">
            Tamaño · {theme.fontSize}px
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              · 32-240
            </span>
          </span>
          <input type="range" min="32" max="240" value={theme.fontSize}
            onChange={e => updateTheme({ fontSize: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.fontSize - 32) / 208 * 100) + '%' }} />
        </div>

        <div className="field" style={{ gridColumn: 'span 2' }}>
          <span className="label">
            Fuente · {fonts.length > 0 ? `${fonts.length} fuentes detectadas` : 'cargando…'}
          </span>
          <select className="select" style={{ width: '100%', height: 40, fontFamily: theme.fontFamily }}
            value={theme.fontFamily || ''}
            onChange={e => updateTheme({ fontFamily: e.target.value })}>
            <option value='"Cormorant Garamond", serif'>Cormorant Garamond (default)</option>
            {fonts.length === 0 && <option disabled>Cargando fuentes del sistema...</option>}
            {fonts.length > 0 && <optgroup label="── Sistema ──">
              {fonts.filter(f => !f.generic).map(f => (
                <option key={f.family} value={f.family}>
                  {f.family}
                </option>
              ))}
            </optgroup>}
            {fonts.length > 0 && <optgroup label="── Genéricas ──">
              {fonts.filter(f => f.generic).map(f => (
                <option key={f.family} value={f.family}>{f.family}</option>
              ))}
            </optgroup>}
          </select>
        </div>

        {theme.bgType === 'solid' && (
          <ColorRow label="Color del fondo" value={theme.bgColor} onChange={v => updateTheme({ bgColor: v })} />
        )}

        {theme.bgType === 'gradient' && (
          <>
            <ColorRow label="Gradiente · desde" value={theme.bgGradient[0]}
              onChange={v => updateTheme({ bgGradient: [v, theme.bgGradient[1]] })} />
            <ColorRow label="Gradiente · hasta" value={theme.bgGradient[1]}
              onChange={v => updateTheme({ bgGradient: [theme.bgGradient[0], v] })} />
          </>
        )}

        {theme.bgType === 'image' && (
          <>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <span className="label">Imagen de fondo</span>
              <MediaPicker kind="image" label="Biblioteca de imágenes"
                value={theme.bgImage} onChange={(url) => updateTheme({ bgImage: url })} />
            </div>
            <div className="field">
              <span className="label">Ajuste de imagen</span>
              <SegmentedControl
                options={[
                  { value: 'cover',   label: 'Cubrir' },
                  { value: 'contain', label: 'Contener' },
                  { value: 'fill',    label: 'Estirar' },
                ]}
                value={theme.imageFit || 'cover'}
                onChange={v => updateTheme({ imageFit: v })} />
            </div>
            {theme.imageFit === 'contain' && (
              <div className="field">
                <span className="label">Blur de relleno · {theme.bgImageBlur ?? 0}px</span>
                <input type="range" min="0" max="50" value={theme.bgImageBlur ?? 0}
                  onChange={e => updateTheme({ bgImageBlur: +e.target.value })}
                  className="slider"
                  style={{ '--val': ((theme.bgImageBlur ?? 0) / 50 * 100) + '%' }} />
              </div>
            )}
          </>
        )}

        {theme.bgType === 'video' && (
          <>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <span className="label">Video de fondo</span>
              <MediaPicker kind="video" label="Biblioteca de videos"
                value={theme.bgVideo} onChange={(url) => updateTheme({ bgVideo: url })} />
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <span className="label">Ajuste de video</span>
              <SegmentedControl
                options={[
                  { value: 'cover',   label: 'Cubrir (recorta)' },
                  { value: 'contain', label: 'Contener (con barras)' },
                  { value: 'fill',    label: 'Estirar (deforma)' },
                ]}
                value={theme.videoFit || 'cover'}
                onChange={v => updateTheme({ videoFit: v })} />
            </div>
          </>
        )}

        <ColorRow label="Color del texto" value={theme.fontColor} onChange={v => updateTheme({ fontColor: v })} />

        <div className="field">
          <span className="label">Posición vertical</span>
          <SegmentedControl
            options={ALIGN} value={theme.textAlign}
            onChange={v => updateTheme({ textAlign: v })} />
        </div>

        <div className="field" style={{ gridColumn: 'span 2' }}>
          <span className="label">Transición · {theme.transitionDuration ?? 500}ms</span>
          <SegmentedControl
            options={TRANSITION_TYPES} value={theme.transitionType}
            onChange={v => updateTheme({ transitionType: v })}
            cols={8} small />
          <input type="range" min="0" max="2000" step="50"
            value={theme.transitionDuration ?? 500}
            onChange={e => updateTheme({ transitionDuration: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.transitionDuration ?? 500) / 2000 * 100) + '%', marginTop: 8 }} />
        </div>

        <div className="field" style={{ gridColumn: 'span 2', flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
          <CheckboxLabel
            checked={(theme.fontWeight ?? 500) >= 700}
            onChange={v => updateTheme({ fontWeight: v ? 800 : 500 })}>
            <b>Negrita</b>
          </CheckboxLabel>
          <CheckboxLabel
            checked={theme.fontStyle === 'italic'}
            onChange={v => updateTheme({ fontStyle: v ? 'italic' : 'normal' })}>
            <em>Cursiva</em>
          </CheckboxLabel>
          <CheckboxLabel checked={!!theme.textShadow} onChange={v => updateTheme({ textShadow: v })}>
            Sombra de texto
          </CheckboxLabel>
          <CheckboxLabel checked={!!theme.referenceVisible} onChange={v => updateTheme({ referenceVisible: v })}>
            Mostrar referencia bíblica
          </CheckboxLabel>
        </div>

        {/* ════════════ EFECTOS DE TEXTO (v0.2.13) ════════════ */}
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <span className="label" style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            fontSize: 10, letterSpacing: '0.14em', color: 'var(--copper-200)',
          }}>
            ── Efectos del texto ──
          </span>
        </div>

        <div className="field">
          <span className="label">
            Mayús/minús
          </span>
          <SegmentedControl
            options={[
              { value: 'none',       label: 'Auto' },
              { value: 'uppercase',  label: 'MAYÚS' },
              { value: 'lowercase',  label: 'minús' },
              { value: 'capitalize', label: 'Capital.' },
            ]}
            value={theme.textTransform || 'none'}
            onChange={v => updateTheme({ textTransform: v })} />
        </div>

        <div className="field">
          <span className="label">
            Espaciado entre letras · {(theme.letterSpacing ?? 0)}
          </span>
          <input type="range" min="-10" max="50" step="1" value={theme.letterSpacing ?? 0}
            onChange={e => updateTheme({ letterSpacing: +e.target.value })}
            className="slider"
            style={{ '--val': (((theme.letterSpacing ?? 0) + 10) / 60 * 100) + '%' }} />
        </div>

        <div className="field">
          <span className="label">
            Grosor del borde · {theme.strokeWidth ?? 0}px
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              · 0 = sin borde
            </span>
          </span>
          <input type="range" min="0" max="12" step="1" value={theme.strokeWidth ?? 0}
            onChange={e => updateTheme({ strokeWidth: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.strokeWidth ?? 0) / 12 * 100) + '%' }} />
        </div>

        {(theme.strokeWidth ?? 0) > 0 && (
          <ColorRow label="Color del borde" value={theme.strokeColor || '#000000'}
            onChange={v => updateTheme({ strokeColor: v })} />
        )}

        <div className="field" style={{ gridColumn: 'span 2' }}>
          <span className="label">
            Margen lateral · {theme.textMargin ?? 40}px
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              · a 1920px base
            </span>
          </span>
          <input type="range" min="0" max="400" step="10" value={theme.textMargin ?? 40}
            onChange={e => updateTheme({ textMargin: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.textMargin ?? 40) / 400 * 100) + '%' }} />
        </div>


        {/* Selector de tamaño de la referencia — solo visible si la referencia
            está activada. 4 niveles, garantizados ≤ tamaño del texto principal. */}
        {theme.referenceVisible && (
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <span className="label">
              Tamaño de la referencia
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                · nunca supera el texto
              </span>
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 6 }}>
              {[
                { id: 'sm', label: 'Pequeño',    ratio: '1/5' },
                { id: 'md', label: 'Medio',      ratio: '1/4' },
                { id: 'lg', label: 'Grande',     ratio: '1/3' },
                { id: 'xl', label: 'Muy grande', ratio: '1/2' },
              ].map(opt => {
                const active = (theme.referenceSize || 'md') === opt.id
                return (
                  <button key={opt.id}
                    onClick={() => updateTheme({ referenceSize: opt.id })}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 'var(--r-md)',
                      cursor: 'pointer',
                      background: active
                        ? 'linear-gradient(180deg, rgba(168,95,51,0.22), rgba(128,64,18,0.12))'
                        : 'var(--bg-2)',
                      border: '1px solid ' + (active ? 'rgba(232,181,145,0.40)' : 'var(--line-1)'),
                      color: active ? 'var(--copper-100)' : 'var(--text-2)',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                      boxShadow: active ? 'var(--shadow-glow-copper)' : 'none',
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', opacity: 0.7, letterSpacing: '0.06em' }}>
                      {opt.ratio} del texto
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Editor: Overlay (Lower-Third) ----------
function OverlayEditor({ theme, preview, activePreset, setActivePreset, updateOverlay }) {
  const o = theme.overlay || {}
  const [fonts, setFonts] = useState([])
  useEffect(() => { listSystemFonts().then(setFonts) }, [])

  // Aplica un preset reemplazando TODO el overlay (no merge parcial),
  // así no quedan valores residuales del estado anterior.
  const applyPreset = (preset) => {
    applyOverlayPreset(preset.overlay)
    setActivePreset(preset.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Preview GRANDE (full-width 16:9) — simula captura OBS sobre cámara */}
      <div>
        <div className="section-h">
          <h3>Vista previa del lower-third</h3>
          <span className="sub">simula captura OBS · sobre cámara</span>
        </div>
        <div style={{
          aspectRatio: '16 / 9',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden', position: 'relative',
          background: 'linear-gradient(135deg, #2a3440 0%, #4a5260 50%, #2a3440 100%)',
          border: '1px solid var(--line-1)',
          boxShadow: 'var(--shadow-2)',
          maxHeight: 460,
          margin: '0 auto',
        }}>
          {/* Textura de "cámara" para que se note la transparencia */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.08), transparent 70%)',
            mixBlendMode: 'overlay',
          }} />
          <div style={{ position: 'absolute', inset: 0 }}>
            <LowerThirdRenderer slide={preview} theme={theme} />
          </div>
        </div>
      </div>

      {/* Presets ("baraja") en grid horizontal */}
      <div>
        <div className="section-h">
          <h3>Estilos predefinidos</h3>
          <span className="sub">{OVERLAY_PRESETS.length} plantillas · click para aplicar</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {OVERLAY_PRESETS.map(p => (
            <button key={p.id}
              className={'template-card' + (activePreset === p.id ? ' active' : '')}
              onClick={() => applyPreset(p)}
              style={{ position: 'relative', overflow: 'hidden', minHeight: 78, padding: '12px 14px' }}>
              <span style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, width: 60,
                background: p.preview.bg,
                borderLeft: p.preview.border !== 'transparent' ? `3px solid ${p.preview.border}` : 'none',
              }} />
              <span className="template-card-title" style={{ position: 'relative', zIndex: 1 }}>{p.label}</span>
              <span className="template-card-meta" style={{ position: 'relative', zIndex: 1 }}>{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Personalización fina del overlay */}
      <div>
        <div className="section-h">
          <h3>Personalización fina</h3>
          <span className="sub">en tiempo real</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {/* Toggle fondo + estilo del texto (bold/italic) */}
          <div className="field" style={{ gridColumn: 'span 2', flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
            <CheckboxLabel checked={o.bgEnabled} onChange={v => updateOverlay({ bgEnabled: v })}>
              Fondo de banda
            </CheckboxLabel>
            <CheckboxLabel checked={o.borderEnabled} onChange={v => updateOverlay({ borderEnabled: v })}>
              Borde de acento
            </CheckboxLabel>
            <CheckboxLabel checked={o.refEnabled} onChange={v => updateOverlay({ refEnabled: v })}>
              Mostrar referencia
            </CheckboxLabel>
            <CheckboxLabel checked={o.textShadow} onChange={v => updateOverlay({ textShadow: v })}>
              Sombra texto
            </CheckboxLabel>
            <CheckboxLabel
              checked={(o.fontWeight ?? 500) >= 700}
              onChange={v => updateOverlay({ fontWeight: v ? 800 : 500 })}>
              <b>Negrita</b>
            </CheckboxLabel>
            <CheckboxLabel
              checked={o.fontStyle === 'italic'}
              onChange={v => updateOverlay({ fontStyle: v ? 'italic' : 'normal' })}>
              <em>Cursiva</em>
            </CheckboxLabel>
          </div>

          {o.bgEnabled && (
            <>
              <div className="field">
                <span className="label">Tipo de fondo</span>
                <SegmentedControl
                  options={[
                    { value: 'solid', label: 'Sólido' },
                    { value: 'gradient', label: 'Gradiente' },
                    { value: 'transparent', label: 'Sin fondo' },
                  ]}
                  value={o.bgType} onChange={v => updateOverlay({ bgType: v })} />
              </div>

              <div className="field">
                <span className="label">Blur · {o.bgBlur}px</span>
                <input type="range" min="0" max="20" value={o.bgBlur}
                  onChange={e => updateOverlay({ bgBlur: +e.target.value })}
                  className="slider"
                  style={{ '--val': (o.bgBlur / 20 * 100) + '%' }} />
              </div>

              {o.bgType === 'solid' && (
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <ColorRow label="Color de fondo (rgba/hex)" value={o.bgColor}
                    onChange={v => updateOverlay({ bgColor: v })} />
                </div>
              )}

              {o.bgType === 'gradient' && (
                <>
                  <ColorRow label="Gradiente · arriba" value={o.bgGradient[0]}
                    onChange={v => updateOverlay({ bgGradient: [v, o.bgGradient[1]] })} />
                  <ColorRow label="Gradiente · abajo" value={o.bgGradient[1]}
                    onChange={v => updateOverlay({ bgGradient: [o.bgGradient[0], v] })} />
                </>
              )}
            </>
          )}

          {o.borderEnabled && (
            <>
              <ColorRow label="Color del borde" value={o.borderColor}
                onChange={v => updateOverlay({ borderColor: v })} />
              <div className="field">
                <span className="label">Lado del borde</span>
                <SegmentedControl
                  options={[
                    { value: 'left', label: 'Izquierda' },
                    { value: 'right', label: 'Derecha' },
                    { value: 'top', label: 'Arriba' },
                    { value: 'bottom', label: 'Abajo' },
                    { value: 'all', label: 'Todos' },
                  ]}
                  value={o.borderSide} onChange={v => updateOverlay({ borderSide: v })} />
              </div>
              <div className="field">
                <span className="label">Grosor · {o.borderWidth}px</span>
                <input type="range" min="0" max="20" value={o.borderWidth}
                  onChange={e => updateOverlay({ borderWidth: +e.target.value })}
                  className="slider"
                  style={{ '--val': (o.borderWidth / 20 * 100) + '%' }} />
              </div>
              <div className="field">
                <span className="label">Radio · {o.borderRadius}px</span>
                <input type="range" min="0" max="32" value={typeof o.borderRadius === 'number' ? o.borderRadius : 8}
                  onChange={e => updateOverlay({ borderRadius: +e.target.value })}
                  className="slider"
                  style={{ '--val': ((typeof o.borderRadius === 'number' ? o.borderRadius : 8) / 32 * 100) + '%' }} />
              </div>
            </>
          )}

          <div className="field">
            <span className="label">Posición</span>
            <SegmentedControl
              options={[{ value: 'bottom', label: 'Abajo' }, { value: 'top', label: 'Arriba' }]}
              value={o.position} onChange={v => updateOverlay({ position: v })} />
          </div>

          <div className="field">
            <span className="label">Margen vertical · {o.offsetY}px</span>
            <input type="range" min="0" max="300" value={o.offsetY}
              onChange={e => updateOverlay({ offsetY: +e.target.value })}
              className="slider"
              style={{ '--val': (o.offsetY / 300 * 100) + '%' }} />
          </div>

          <div className="field">
            <span className="label">Margen lateral · {o.offsetX}px</span>
            <input type="range" min="0" max="200" value={o.offsetX}
              onChange={e => updateOverlay({ offsetX: +e.target.value })}
              className="slider"
              style={{ '--val': (o.offsetX / 200 * 100) + '%' }} />
          </div>

          <div className="field">
            <span className="label">
              Tamaño texto · {o.fontSize}px
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                · 24-200
              </span>
            </span>
            <input type="range" min="24" max="200" value={o.fontSize}
              onChange={e => updateOverlay({ fontSize: +e.target.value })}
              className="slider"
              style={{ '--val': ((o.fontSize - 24) / 176 * 100) + '%' }} />
          </div>

          <ColorRow label="Color del texto" value={o.fontColor}
            onChange={v => updateOverlay({ fontColor: v })} />

          {/* ════════ Efectos del texto (overlay) ════════ */}
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <span className="label" style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              fontSize: 10, letterSpacing: '0.14em', color: 'var(--copper-200)',
            }}>
              ── Efectos del texto ──
            </span>
          </div>

          <div className="field">
            <span className="label">Mayús/minús</span>
            <SegmentedControl
              options={[
                { value: 'none',       label: 'Auto' },
                { value: 'uppercase',  label: 'MAYÚS' },
                { value: 'lowercase',  label: 'minús' },
                { value: 'capitalize', label: 'Capital.' },
              ]}
              value={o.textTransform || 'none'}
              onChange={v => updateOverlay({ textTransform: v })} />
          </div>

          <div className="field">
            <span className="label">Espaciado entre letras · {o.letterSpacing ?? 0}</span>
            <input type="range" min="-10" max="50" step="1" value={o.letterSpacing ?? 0}
              onChange={e => updateOverlay({ letterSpacing: +e.target.value })}
              className="slider"
              style={{ '--val': (((o.letterSpacing ?? 0) + 10) / 60 * 100) + '%' }} />
          </div>

          <div className="field">
            <span className="label">
              Grosor del borde · {o.strokeWidth ?? 0}px
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                · 0 = sin borde
              </span>
            </span>
            <input type="range" min="0" max="12" step="1" value={o.strokeWidth ?? 0}
              onChange={e => updateOverlay({ strokeWidth: +e.target.value })}
              className="slider"
              style={{ '--val': ((o.strokeWidth ?? 0) / 12 * 100) + '%' }} />
          </div>

          {(o.strokeWidth ?? 0) > 0 && (
            <ColorRow label="Color del borde" value={o.strokeColor || '#000000'}
              onChange={v => updateOverlay({ strokeColor: v })} />
          )}

          <div className="field" style={{ gridColumn: 'span 2' }}>
            <span className="label">
              Fuente del lower-third · {fonts.length > 0 ? `${fonts.length} fuentes` : 'cargando…'}
            </span>
            <select className="select" style={{ width: '100%', height: 40, fontFamily: o.fontFamily }}
              value={o.fontFamily || ''}
              onChange={e => updateOverlay({ fontFamily: e.target.value })}>
              <option value='"Cormorant Garamond", serif'>Cormorant Garamond (default)</option>
              {fonts.length > 0 && <optgroup label="── Sistema ──">
                {fonts.filter(f => !f.generic).map(f => (
                  <option key={f.family} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </optgroup>}
              {fonts.length > 0 && <optgroup label="── Genéricas ──">
                {fonts.filter(f => f.generic).map(f => (
                  <option key={f.family} value={f.family}>{f.family}</option>
                ))}
              </optgroup>}
            </select>
          </div>

          {o.refEnabled && (
            <>
              <ColorRow label="Color referencia" value={o.refFontColor}
                onChange={v => updateOverlay({ refFontColor: v })} />
              <div className="field">
                <span className="label">Tamaño referencia · {o.refFontSize}px</span>
                <input type="range" min="10" max="36" value={o.refFontSize}
                  onChange={e => updateOverlay({ refFontSize: +e.target.value })}
                  className="slider"
                  style={{ '--val': ((o.refFontSize - 10) / 26 * 100) + '%' }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Helpers de UI ----------
function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, padding: '14px 18px',
        background: active ? 'var(--bg-2)' : 'transparent',
        color: active ? 'var(--copper-100)' : 'var(--text-3)',
        borderBottom: active ? '2px solid var(--copper-300)' : '2px solid transparent',
        borderRadius: 0, border: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontSize: 13, fontWeight: 500,
        transition: 'all 0.15s ease',
      }}>
      {icon} {label}
    </button>
  )
}

function SegmentedControl({ options, value, onChange, cols, small }) {
  return (
    <div style={{
      display: cols ? 'grid' : 'flex',
      gridTemplateColumns: cols ? `repeat(${cols}, 1fr)` : undefined,
      gap: 4, padding: 3,
      background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)',
    }}>
      {options.map(o => (
        <button key={o.value}
          className={'modal-tab ' + (value === o.value ? 'active' : '')}
          onClick={() => onChange(o.value)}
          style={{ flex: 1, fontSize: small ? 11 : 12, padding: small ? '4px 6px' : '6px 14px' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function CheckboxLabel({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

function OutputCard({ title, subtitle, Icon, accent, isOpen, displays, onOpen, onClose }) {
  const [displayId, setDisplayId] = useState('')
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className={'song-icon ' + (accent === 'bible' ? 'bible' : '')}>
          <Icon size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{subtitle}</div>
        </div>
        {isOpen
          ? <span className="tally live"><span className="led" /> Abierta</span>
          : <span className="tally off">Cerrada</span>}
      </div>

      {displays.length > 1 && !isOpen && (
        <select value={displayId} onChange={e => setDisplayId(e.target.value)}
          className="select" style={{ width: '100%', marginBottom: 8, height: 32 }}>
          <option value="">Pantalla automática</option>
          {displays.map(d => (
            <option key={d.id} value={d.id}>
              {d.label} {d.primary ? '(principal)' : ''} · {d.bounds.width}×{d.bounds.height}
            </option>
          ))}
        </select>
      )}

      {isOpen ? (
        <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>
          Cerrar ventana
        </button>
      ) : (
        <button className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onOpen(displayId ? +displayId : undefined)}>
          <IconExternal size={14} /> Abrir
        </button>
      )}
    </div>
  )
}

function ColorRow({ label, value, onChange }) {
  // Convierte rgba(...) a hex para el color picker (best-effort)
  const hexValue = toHex(value)

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="input-wrap" style={{ height: 40 }}>
        <span style={{ width: 22, height: 22, borderRadius: 4, background: value, border: '1px solid var(--line-2)', flexShrink: 0 }} />
        <input value={value} onChange={e => onChange(e.target.value)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
        <input type="color" value={hexValue} onChange={e => onChange(e.target.value)}
          style={{ width: 32, height: 24, border: 0, background: 'transparent', cursor: 'pointer' }} />
      </div>
    </div>
  )
}

// rgba(20, 16, 13, 0.85) → #14100d (descarta alpha para el picker)
function toHex(color) {
  if (!color) return '#000000'
  if (color.startsWith('#')) return color.slice(0, 7)
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return '#000000'
  const [r, g, b] = [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0'))
  return `#${r}${g}${b}`
}
