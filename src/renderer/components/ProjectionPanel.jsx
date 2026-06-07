import { useEffect, useState } from 'react'
import MediaPicker from './MediaPicker.jsx'
import SlideRenderer from './SlideRenderer.jsx'
import LowerThirdRenderer from './LowerThirdRenderer.jsx'
import EditorCanvas from './EditorCanvas.jsx'
import PropertySection from './PropertySection.jsx'
import FontPicker from './FontPicker.jsx'
import {
  useTheme, setTheme as setStoredTheme, setOverlay, applyOverlayPreset, OVERLAY_PRESETS, resetTheme,
} from '../services/themeStore.js'
import { useUserPresets } from '../services/userPresetsStore.js'
import { confirm, alert } from '../services/dialogService.js'
import {
  IconExternal, IconMonitor, IconLayers, IconRefresh,
} from './Icons.jsx'

// ════════════════════════════════════════════════════════════════
// Constantes
// ════════════════════════════════════════════════════════════════

const TRANSITION_TYPES = [
  { value: 'none',        label: 'Ninguna' },
  { value: 'fade',        label: 'Fade' },
  { value: 'dissolve',    label: 'Dissolve' },
  { value: 'slide-left',  label: 'Slide ◀' },
  { value: 'slide-right', label: 'Slide ▶' },
  { value: 'slide-up',    label: 'Slide ▲' },
  { value: 'slide-down',  label: 'Slide ▼' },
  { value: 'zoom-in',     label: 'Zoom in' },
  { value: 'zoom-out',    label: 'Zoom out' },
  { value: 'flip',        label: 'Flip H' },
  { value: 'flip-x',      label: 'Flip V' },
  { value: 'reveal',      label: 'Reveal' },
  { value: 'ken-burns',   label: 'Ken Burns' },
]

const DEMO_SLIDES = [
  { text: 'EN el principio crió Dios los cielos y la tierra.', reference: 'Génesis 1:1', type: 'bible' },
  { text: 'Jehová es mi pastor; nada me faltará.', reference: 'Salmos 23:1', type: 'bible' },
  { text: 'Todo lo puedo en Cristo que me fortalece.', reference: 'Filipenses 4:13', type: 'bible' },
]

const BG_TYPES = [
  { value: 'solid',       label: 'Color' },
  { value: 'gradient',    label: 'Degradado' },
  { value: 'image',       label: 'Imagen' },
  { value: 'video',       label: 'Video' },
  { value: 'transparent', label: 'Transp.' },
]

const ALIGN = [
  { value: 'top', label: 'Arriba' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom', label: 'Abajo' },
]

const FULLSCREEN_PRESETS = [
  { id: 'azul',      label: 'Clásico azul', bg: 'linear-gradient(135deg, #0a1620 0%, #1e3a5f 60%, #0a1620 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#0a1620', '#1e3a5f'], fontColor: '#ffffff' } },
  { id: 'atardecer', label: 'Atardecer', bg: 'linear-gradient(135deg, #3e2411 0%, #804012 50%, #1a0e08 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#3e2411', '#804012'], fontColor: '#f4e6d7' } },
  { id: 'bosque',    label: 'Bosque', bg: 'linear-gradient(135deg, #0a1a12 0%, #1c4029 60%, #0a1a12 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#0a1a12', '#1c4029'], fontColor: '#ecfdf5' } },
  { id: 'negro',     label: 'Negro', bg: '#000000',
    theme: { bgType: 'solid', bgColor: '#000000', fontColor: '#ffffff' } },
  { id: 'marmol',    label: 'Mármol cobre', bg: 'radial-gradient(ellipse at 30% 20%, #db9f75 0%, #804012 40%, #1a0e08 100%)',
    theme: { bgType: 'gradient', bgGradient: ['#db9f75', '#1a0e08'], fontColor: '#ffffff' } },
  { id: 'vitral',    label: 'Vitral', bg: 'conic-gradient(from 200deg at 50% 50%, #122324, #804012, #db9f75, #2f3a32, #122324)',
    theme: { bgType: 'gradient', bgGradient: ['#122324', '#804012'], fontColor: '#ffffff' } },
]

// ════════════════════════════════════════════════════════════════
// ProjectionPanel — contenedor + header + tabs + grid layout
// ════════════════════════════════════════════════════════════════

export default function ProjectionPanel({ slide }) {
  const [hasElectron] = useState(() => !!window.electron?.projection)
  const [openModes, setOpenModes] = useState([])
  const theme   = useTheme()
  const [preview, setPreview] = useState(slide || DEMO_SLIDES[0])
  const [activePreset, setActivePreset] = useState(null)
  const [activeOverlayPreset, setActiveOverlayPreset] = useState(null)
  const [editorTab, setEditorTab] = useState('fullscreen')  // 'fullscreen' | 'overlay'

  // Presets del usuario (persistidos en localStorage)
  const userFs = useUserPresets('fullscreen')
  const userOv = useUserPresets('overlay')

  useEffect(() => { if (slide) setPreview(slide) }, [slide])

  useEffect(() => {
    if (!hasElectron) return
    window.electron.projection.state().then(s => setOpenModes(s.open))
  }, [hasElectron])

  const refreshState = async () => {
    if (!hasElectron) return
    const s = await window.electron.projection.state()
    setOpenModes(s.open)
  }

  const updateTheme   = (patch) => setStoredTheme(patch)
  const updateOverlay = (patch) => setOverlay(patch)

  const open = async (mode) => {
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
    await window.electron.projection.open({ mode })
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
  const allOpen = isOpen('background') && isOpen('overlay')
  const openAll = async () => {
    if (!isOpen('background')) await open('background')
    if (!isOpen('overlay')) await open('overlay')
  }
  const closeAll = async () => {
    if (isOpen('overlay')) await close('overlay')
    if (isOpen('background')) await close('background')
  }
  const toggleAll = () => allOpen ? closeAll() : openAll()

  const handleReset = async () => {
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
      setActivePreset(null)
      setActiveOverlayPreset(null)
    }
  }

  return (
    <div className="workspace">
      <div className="ws-header">
        <div className="ws-title">
          <h1 className="ws-h1">Edición</h1>
          <span className="ws-sub">
            Diseña el aspecto del slide en pantalla completa y del lower-third
            {!hasElectron && <span style={{ color: 'var(--preview)', marginLeft: 8 }}>· Solo preview en navegador</span>}
          </span>
        </div>
        <div className="editor-header-actions">
          <button className="editor-reset-btn" onClick={handleReset}
            title="Vuelve fondo, fuente y colores a sus valores por defecto">
            ↺ Restablecer tema
          </button>
          <button className="btn" onClick={cyclePreview}>
            <IconRefresh size={14} /> Probar transición
          </button>
          <button
            className={allOpen ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={toggleAll}
            title={allOpen ? 'Cerrar el proyector y el overlay' : 'Abrir el proyector y el overlay'}>
            <IconExternal size={14} /> {allOpen ? 'Cerrar todas' : 'Abrir todas'}
          </button>
        </div>
      </div>

      <div className="ws-body">
        {/* Tabs Pantalla completa / Lower-third */}
        <div className="editor-tabs">
          <button
            className={'editor-tab' + (editorTab === 'fullscreen' ? ' active' : '')}
            onClick={() => setEditorTab('fullscreen')}>
            <IconMonitor size={13} /> Pantalla completa
          </button>
          <button
            className={'editor-tab' + (editorTab === 'overlay' ? ' active' : '')}
            onClick={() => setEditorTab('overlay')}>
            <IconLayers size={13} /> Lower-third
          </button>
        </div>

        {!hasElectron && (
          <div className="card" style={{ padding: 12, fontSize: 12, color: 'var(--preview)', marginBottom: 16 }}>
            ⚠ Solo previsualización en navegador. Las ventanas reales requieren la app instalada.
          </div>
        )}

        {/* Layout 2 cols: canvas | propiedades */}
        <div className="editor-grid">
          {editorTab === 'fullscreen' && (
            <>
              <EditorCanvas
                renderPreview={() => <SlideRenderer slide={preview} theme={theme} />}
                subtitle={activePreset || theme.bgType}
                presets={FULLSCREEN_PRESETS}
                activePresetId={activePreset}
                presetSubtitle="Click para aplicar"
                onPresetClick={(p) => {
                  // Aplicar SOLO los campos visuales del preset (fondo, colores).
                  // NO tocar tamaño de letra, alineación, fuente, etc.
                  const { fontSize, fontFamily, fontWeight, textAlign, ...visualOnly } = p.theme
                  updateTheme(visualOnly)
                  setActivePreset(p.id)
                }}
                userPresets={userFs.presets}
                onUserPresetClick={(p) => {
                  updateTheme(p.theme)
                  setActivePreset(p.id)
                }}
                onSaveCurrent={(label) => userFs.save(label, theme)}
                onDeleteUserPreset={userFs.remove}
                onRenameUserPreset={userFs.rename}
              />
              <FullscreenProperties theme={theme} updateTheme={updateTheme} />
            </>
          )}

          {editorTab === 'overlay' && (
            <>
              <EditorCanvas
                renderPreview={() => (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(135deg, #2a3440 0%, #4a5260 50%, #2a3440 100%)',
                  }}>
                    {/* Textura sutil para indicar transparencia/cámara */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.08), transparent 70%)',
                      mixBlendMode: 'overlay',
                    }} />
                    <LowerThirdRenderer slide={preview} theme={theme} />
                  </div>
                )}
                subtitle="Simula captura OBS · sobre cámara"
                // OVERLAY_PRESETS expone el background en .preview.bg (no en .bg)
                // — adaptamos aquí para que EditorCanvas pueda pintar la mini-card
                // uniformemente.
                presets={OVERLAY_PRESETS.map(p => ({ ...p, bg: p.preview?.bg }))}
                activePresetId={activeOverlayPreset}
                presetSubtitle="Click para aplicar"
                onPresetClick={(p) => {
                  applyOverlayPreset(p.overlay)
                  setActiveOverlayPreset(p.id)
                }}
                userPresets={userOv.presets}
                onUserPresetClick={(p) => {
                  // Para overlay, los presets de usuario guardan SOLO los
                  // campos visuales — no aplicamos applyOverlayPreset (que
                  // reemplaza TODO el overlay) sino un patch parcial.
                  setOverlay(p.overlay)
                  setActiveOverlayPreset(p.id)
                }}
                onSaveCurrent={(label) => userOv.save(label, theme.overlay || {})}
                onDeleteUserPreset={userOv.remove}
                onRenameUserPreset={userOv.rename}
              />
              <OverlayProperties theme={theme} updateOverlay={updateOverlay} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// FullscreenProperties — Panel de propiedades para pantalla completa
// Secciones plegables: FONDO / TIPOGRAFÍA / EFECTOS / POSICIÓN / TRANSICIÓN
// ════════════════════════════════════════════════════════════════

function FullscreenProperties({ theme, updateTheme }) {
  return (
    <div className="editor-prop-panel">
      {/* ─── FONDO ─── */}
      <PropertySection
        title="Fondo"
        subtitle={theme.bgType}
        storageKey="fs.fondo"
        defaultOpen>
        <div className="field span-2">
          <span className="label">Tipo</span>
          {/* cols=5 + small evita truncamiento de labels en 400px de panel.
              Sin cols los segments se distribuyen con padding generoso y la
              5ª etiqueta ("Transp.") sale cortada del cell. */}
          <SegmentedControl
            options={BG_TYPES} value={theme.bgType}
            onChange={v => updateTheme({ bgType: v })}
            cols={5} small />
        </div>

        {theme.bgType === 'solid' && (
          <ColorRow span2 label="Color de fondo" value={theme.bgColor}
            onChange={v => updateTheme({ bgColor: v })} />
        )}

        {theme.bgType === 'gradient' && (
          <>
            <ColorRow label="Desde" value={theme.bgGradient[0]}
              onChange={v => updateTheme({ bgGradient: [v, theme.bgGradient[1]] })} />
            <ColorRow label="Hasta" value={theme.bgGradient[1]}
              onChange={v => updateTheme({ bgGradient: [theme.bgGradient[0], v] })} />
          </>
        )}

        {theme.bgType === 'image' && (
          <>
            <div className="field span-2">
              <span className="label">Imagen</span>
              <MediaPicker kind="image" label="Biblioteca de imágenes"
                value={theme.bgImage} onChange={(url) => updateTheme({ bgImage: url })} />
            </div>
            <div className="field span-2">
              <span className="label">Ajuste</span>
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
              <div className="field span-2">
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
            <div className="field span-2">
              <span className="label">Video</span>
              <MediaPicker kind="video" label="Biblioteca de videos"
                value={theme.bgVideo} onChange={(url) => updateTheme({ bgVideo: url })} />
            </div>
            <div className="field span-2">
              <span className="label">Ajuste</span>
              <SegmentedControl
                options={[
                  { value: 'cover',   label: 'Cubrir' },
                  { value: 'contain', label: 'Contener' },
                  { value: 'fill',    label: 'Estirar' },
                ]}
                value={theme.videoFit || 'cover'}
                onChange={v => updateTheme({ videoFit: v })} />
            </div>
          </>
        )}
      </PropertySection>

      {/* ─── TIPOGRAFÍA ─── */}
      <PropertySection
        title="Tipografía"
        subtitle={`${theme.fontSize}px`}
        storageKey="fs.tipo"
        defaultOpen>
        <div className="field span-2">
          <span className="label">Fuente</span>
          <FontPicker
            value={theme.fontFamily}
            onChange={family => updateTheme({ fontFamily: family })} />
        </div>
        <div className="field span-2">
          <span className="label">
            Tamaño · {theme.fontSize}px
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              32-240
            </span>
          </span>
          <input type="range" min="32" max="240" value={theme.fontSize}
            onChange={e => updateTheme({ fontSize: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.fontSize - 32) / 208 * 100) + '%' }} />
        </div>
        <ColorRow span2 label="Color del texto" value={theme.fontColor}
          onChange={v => updateTheme({ fontColor: v })} />
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
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
        </div>
      </PropertySection>

      {/* ─── EFECTOS DE TEXTO ─── */}
      <PropertySection
        title="Efectos de texto"
        subtitle={effectsSubtitle(theme)}
        storageKey="fs.efectos">
        <div className="field span-2">
          <span className="label">Mayús/minús</span>
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
        <div className="field span-2">
          <span className="label">Espaciado entre letras · {theme.letterSpacing ?? 0}</span>
          <input type="range" min="-10" max="50" step="1" value={theme.letterSpacing ?? 0}
            onChange={e => updateTheme({ letterSpacing: +e.target.value })}
            className="slider"
            style={{ '--val': (((theme.letterSpacing ?? 0) + 10) / 60 * 100) + '%' }} />
        </div>
        <div className="field span-2">
          <span className="label">
            Grosor del borde · {theme.strokeWidth ?? 0}px
            {(theme.strokeWidth ?? 0) === 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                sin borde
              </span>
            )}
          </span>
          <input type="range" min="0" max="12" step="1" value={theme.strokeWidth ?? 0}
            onChange={e => updateTheme({ strokeWidth: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.strokeWidth ?? 0) / 12 * 100) + '%' }} />
        </div>
        {(theme.strokeWidth ?? 0) > 0 && (
          <ColorRow span2 label="Color del borde" value={theme.strokeColor || '#000000'}
            onChange={v => updateTheme({ strokeColor: v })} />
        )}
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <CheckboxLabel checked={!!theme.textShadow} onChange={v => updateTheme({ textShadow: v })}>
            Sombra de texto
          </CheckboxLabel>
        </div>
      </PropertySection>

      {/* ─── POSICIÓN Y MARGEN ─── */}
      <PropertySection
        title="Posición y margen"
        subtitle={theme.textAlign}
        storageKey="fs.posicion">
        <div className="field span-2">
          <span className="label">Alineación vertical</span>
          <SegmentedControl
            options={ALIGN} value={theme.textAlign}
            onChange={v => updateTheme({ textAlign: v })} />
        </div>
        <div className="field span-2">
          <span className="label">
            Margen lateral · {theme.textMargin ?? 40}px
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              base 1920
            </span>
          </span>
          <input type="range" min="0" max="400" step="10" value={theme.textMargin ?? 40}
            onChange={e => updateTheme({ textMargin: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.textMargin ?? 40) / 400 * 100) + '%' }} />
        </div>
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <CheckboxLabel checked={!!theme.referenceVisible} onChange={v => updateTheme({ referenceVisible: v })}>
            Mostrar referencia bíblica
          </CheckboxLabel>
        </div>
        {theme.referenceVisible && (
          <div className="field span-2">
            <span className="label">
              Tamaño de la referencia
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                nunca supera el texto
              </span>
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 6 }}>
              {[
                { id: 'sm', label: 'Pequeño',    short: 'S',  ratio: '1/5' },
                { id: 'md', label: 'Medio',      short: 'M',  ratio: '1/4' },
                { id: 'lg', label: 'Grande',     short: 'L',  ratio: '1/3' },
                { id: 'xl', label: 'Muy grande', short: 'XL', ratio: '1/2' },
              ].map(opt => {
                const active = (theme.referenceSize || 'md') === opt.id
                return (
                  <button key={opt.id}
                    onClick={() => updateTheme({ referenceSize: opt.id })}
                    title={`${opt.label} — referencia a ${opt.ratio} del texto principal`}
                    style={{
                      padding: '8px 6px',
                      borderRadius: 'var(--r-md)',
                      cursor: 'pointer',
                      background: active
                        ? 'linear-gradient(180deg, rgba(168,95,51,0.22), rgba(128,64,18,0.12))'
                        : 'var(--bg-1)',
                      border: '1px solid ' + (active ? 'rgba(232,181,145,0.40)' : 'var(--line-1)'),
                      color: active ? 'var(--copper-100)' : 'var(--text-2)',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                      minHeight: 44,
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1 }}>{opt.label}</div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', opacity: 0.7, letterSpacing: '0.06em', marginTop: 2 }}>
                      {opt.ratio} · {opt.short}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </PropertySection>

      {/* ─── TRANSICIÓN ─── */}
      <PropertySection
        title="Transición"
        subtitle={`${theme.transitionType || 'fade'} · ${theme.transitionDuration ?? 500}ms`}
        storageKey="fs.transicion">
        <div className="field span-2">
          <span className="label">Tipo</span>
          <SegmentedControl
            options={TRANSITION_TYPES} value={theme.transitionType}
            onChange={v => updateTheme({ transitionType: v })}
            cols={4} small />
        </div>
        <div className="field span-2">
          <span className="label">Duración · {theme.transitionDuration ?? 500}ms</span>
          <input type="range" min="0" max="2000" step="50"
            value={theme.transitionDuration ?? 500}
            onChange={e => updateTheme({ transitionDuration: +e.target.value })}
            className="slider"
            style={{ '--val': ((theme.transitionDuration ?? 500) / 2000 * 100) + '%' }} />
        </div>
      </PropertySection>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// OverlayProperties — Panel de propiedades para lower-third
// Secciones plegables: BANDA / TIPOGRAFÍA / EFECTOS / POSICIÓN / REFERENCIA
// ════════════════════════════════════════════════════════════════

function OverlayProperties({ theme, updateOverlay }) {
  const o = theme.overlay || {}
  return (
    <div className="editor-prop-panel">
      {/* ─── BANDA (FONDO + BORDE) ─── */}
      <PropertySection
        title="Banda"
        subtitle={o.bgEnabled ? o.bgType : 'sin fondo'}
        storageKey="ov.banda"
        defaultOpen>
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <CheckboxLabel checked={o.bgEnabled} onChange={v => updateOverlay({ bgEnabled: v })}>
            Fondo
          </CheckboxLabel>
          <CheckboxLabel checked={o.borderEnabled} onChange={v => updateOverlay({ borderEnabled: v })}>
            Borde de acento
          </CheckboxLabel>
        </div>

        {o.bgEnabled && (
          <>
            <div className="field">
              <span className="label">Tipo</span>
              <SegmentedControl
                options={[
                  { value: 'solid',       label: 'Sólido' },
                  { value: 'gradient',    label: 'Gradiente' },
                  { value: 'transparent', label: 'Sin' },
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
              <ColorRow span2 label="Color (rgba/hex)" value={o.bgColor}
                onChange={v => updateOverlay({ bgColor: v })} />
            )}

            {o.bgType === 'gradient' && (
              <>
                <ColorRow label="Arriba" value={o.bgGradient[0]}
                  onChange={v => updateOverlay({ bgGradient: [v, o.bgGradient[1]] })} />
                <ColorRow label="Abajo" value={o.bgGradient[1]}
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
              <span className="label">Lado</span>
              <SegmentedControl
                options={[
                  { value: 'left',   label: 'Izq' },
                  { value: 'right',  label: 'Der' },
                  { value: 'top',    label: 'Arr' },
                  { value: 'bottom', label: 'Aba' },
                  { value: 'all',    label: 'Todo' },
                  { value: 'none',   label: 'No' },
                ]}
                value={o.borderSide}
                onChange={v => updateOverlay({ borderSide: v })}
                cols={3} small />
            </div>
            <div className="field">
              <span className="label">Grosor · {o.borderWidth}px</span>
              <input type="range" min="0" max="20" value={o.borderWidth}
                onChange={e => updateOverlay({ borderWidth: +e.target.value })}
                className="slider"
                style={{ '--val': (o.borderWidth / 20 * 100) + '%' }} />
            </div>
            <div className="field">
              <span className="label">Radio · {o.borderRadius ?? 8}px</span>
              <input type="range" min="0" max="32" value={o.borderRadius ?? 8}
                onChange={e => updateOverlay({ borderRadius: +e.target.value })}
                className="slider"
                style={{ '--val': ((o.borderRadius ?? 8) / 32 * 100) + '%' }} />
            </div>
          </>
        )}
      </PropertySection>

      {/* ─── TIPOGRAFÍA ─── */}
      <PropertySection
        title="Tipografía"
        subtitle={`${o.fontSize}px`}
        storageKey="ov.tipo"
        defaultOpen>
        <div className="field span-2">
          <span className="label">Fuente</span>
          <FontPicker
            value={o.fontFamily}
            onChange={family => updateOverlay({ fontFamily: family })} />
        </div>
        <div className="field span-2">
          <span className="label">
            Tamaño · {o.fontSize}px
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              24-200
            </span>
          </span>
          <input type="range" min="24" max="200" value={o.fontSize}
            onChange={e => updateOverlay({ fontSize: +e.target.value })}
            className="slider"
            style={{ '--val': ((o.fontSize - 24) / 176 * 100) + '%' }} />
        </div>
        <ColorRow span2 label="Color del texto" value={o.fontColor}
          onChange={v => updateOverlay({ fontColor: v })} />
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
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
      </PropertySection>

      {/* ─── EFECTOS DE TEXTO ─── */}
      {/* defaultOpen: en el panel anterior la "Sombra de texto" del overlay
          vivía en la fila de checkboxes principales y siempre estaba visible.
          Abrimos esta sección por defecto para no esconder ese control. */}
      <PropertySection
        title="Efectos de texto"
        subtitle={effectsSubtitle(o)}
        storageKey="ov.efectos"
        defaultOpen>
        <div className="field span-2">
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
        <div className="field span-2">
          <span className="label">Espaciado entre letras · {o.letterSpacing ?? 0}</span>
          <input type="range" min="-10" max="50" step="1" value={o.letterSpacing ?? 0}
            onChange={e => updateOverlay({ letterSpacing: +e.target.value })}
            className="slider"
            style={{ '--val': (((o.letterSpacing ?? 0) + 10) / 60 * 100) + '%' }} />
        </div>
        <div className="field span-2">
          <span className="label">
            Grosor del borde · {o.strokeWidth ?? 0}px
            {(o.strokeWidth ?? 0) === 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                sin borde
              </span>
            )}
          </span>
          <input type="range" min="0" max="12" step="1" value={o.strokeWidth ?? 0}
            onChange={e => updateOverlay({ strokeWidth: +e.target.value })}
            className="slider"
            style={{ '--val': ((o.strokeWidth ?? 0) / 12 * 100) + '%' }} />
        </div>
        {(o.strokeWidth ?? 0) > 0 && (
          <ColorRow span2 label="Color del borde" value={o.strokeColor || '#000000'}
            onChange={v => updateOverlay({ strokeColor: v })} />
        )}
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <CheckboxLabel checked={o.textShadow} onChange={v => updateOverlay({ textShadow: v })}>
            Sombra de texto
          </CheckboxLabel>
        </div>
      </PropertySection>

      {/* ─── POSICIÓN ─── */}
      <PropertySection
        title="Posición"
        subtitle={o.position}
        storageKey="ov.posicion">
        <div className="field span-2">
          <span className="label">Lado vertical</span>
          <SegmentedControl
            options={[
              { value: 'top',    label: 'Arriba' },
              { value: 'bottom', label: 'Abajo' },
            ]}
            value={o.position}
            onChange={v => updateOverlay({ position: v })} />
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
      </PropertySection>

      {/* ─── REFERENCIA BÍBLICA ─── */}
      <PropertySection
        title="Referencia bíblica"
        subtitle={o.refEnabled ? 'visible' : 'oculta'}
        storageKey="ov.referencia">
        <div className="field span-2" style={{ flexDirection: 'row', gap: 14 }}>
          <CheckboxLabel checked={o.refEnabled} onChange={v => updateOverlay({ refEnabled: v })}>
            Mostrar referencia
          </CheckboxLabel>
          <CheckboxLabel checked={o.refUppercase} onChange={v => updateOverlay({ refUppercase: v })}>
            En mayúsculas
          </CheckboxLabel>
        </div>
        {o.refEnabled && (
          <>
            <ColorRow label="Color" value={o.refFontColor}
              onChange={v => updateOverlay({ refFontColor: v })} />
            <div className="field">
              <span className="label">Tamaño · {o.refFontSize}px</span>
              <input type="range" min="10" max="36" value={o.refFontSize}
                onChange={e => updateOverlay({ refFontSize: +e.target.value })}
                className="slider"
                style={{ '--val': ((o.refFontSize - 10) / 26 * 100) + '%' }} />
            </div>
          </>
        )}
      </PropertySection>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

// Resumen corto de los efectos activos — se usa como subtitle de la sección
function effectsSubtitle(t) {
  const parts = []
  if (t.textTransform && t.textTransform !== 'none') parts.push(t.textTransform)
  if (t.letterSpacing) parts.push(`${t.letterSpacing > 0 ? '+' : ''}${t.letterSpacing}`)
  if (t.strokeWidth) parts.push(`borde ${t.strokeWidth}`)
  if (t.textShadow) parts.push('sombra')
  return parts.length ? parts.join(' · ') : 'sin efectos'
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

function ColorRow({ label, value, onChange, span2 }) {
  // Convierte rgba(...) a hex para el color picker (best-effort)
  const hexValue = toHex(value)

  return (
    <div className={'field' + (span2 ? ' span-2' : '')}>
      <span className="label">{label}</span>
      <div className="input-wrap" style={{ height: 40 }}>
        <span style={{ width: 22, height: 22, borderRadius: 4, background: value, border: '1px solid var(--line-2)', flexShrink: 0 }} />
        <input value={value || ''} onChange={e => onChange(e.target.value)}
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
