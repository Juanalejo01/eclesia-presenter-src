import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import BiblePanel from './components/BiblePanel.jsx'
import SongsPanel from './components/SongsPanel.jsx'
import SchedulePanel from './components/SchedulePanel.jsx'
import ProjectionPanel from './components/ProjectionPanel.jsx'
import ImagePanel from './components/ImagePanel.jsx'
import VideoPanel from './components/VideoPanel.jsx'
import TextPanel from './components/TextPanel.jsx'
import ToolsPanel from './components/ToolsPanel.jsx'
import TransmisionPanel from './components/TransmisionPanel.jsx'
import SlidePreview from './components/SlidePreview.jsx'
import Topbar from './components/Topbar.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import Settings from './components/Settings.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AppDialog from './components/AppDialog.jsx'
import ResizableDivider from './components/ResizableDivider.jsx'
import { useGlobalShortcuts, subscribe, emit } from './hooks/useShortcuts.js'
import { selectSlide, setLive, useSlideStore } from './services/slideStore.js'
import { syncFromMain } from './services/themeStore.js'
import { refreshImportedVersions } from './services/bibleService.js'
// Alias para evitar shadowing con el window.confirm global (que no usamos
// pero la lint y la legibilidad agradecen la distinción explícita).
import { confirm as dialogConfirm } from './services/dialogService.js'

const PANELS = {
  bible:       BiblePanel,
  songs:       SongsPanel,
  schedule:    SchedulePanel,
  image:       ImagePanel,
  video:       VideoPanel,
  text:        TextPanel,
  tools:       ToolsPanel,
  projection:  ProjectionPanel,
  transmision: TransmisionPanel,
}

const BLANK_SLIDE    = { type: 'blank', text: '', reference: '' }
const BLACKOUT_SLIDE = { type: 'blackout', text: '', reference: '' }

// Constantes para el divider principal entre el panel y el monitor.
const MAIN_MONITOR_MIN = 280
const MAIN_MONITOR_MAX = 700
const MAIN_MONITOR_DEFAULT = 380
const MAIN_MONITOR_STORAGE_KEY = 'eclesia.layout.monitorWidth'

function loadMonitorWidth() {
  try {
    const raw = localStorage.getItem(MAIN_MONITOR_STORAGE_KEY)
    const n = parseInt(raw || '', 10)
    if (Number.isFinite(n)) {
      return Math.max(MAIN_MONITOR_MIN, Math.min(MAIN_MONITOR_MAX, n))
    }
  } catch {}
  return MAIN_MONITOR_DEFAULT
}

export default function App() {
  const [activePanel, setActivePanel] = useState('bible')
  const [settingsRev, setSettingsRev] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState(null)
  const [splashDone, setSplashDone] = useState(false)
  const [monitorWidth, setMonitorWidth] = useState(loadMonitorWidth)
  const { live } = useSlideStore()

  const persistMonitorWidth = (w) => {
    try { localStorage.setItem(MAIN_MONITOR_STORAGE_KEY, String(w)) } catch {}
  }

  useEffect(() => {
    syncFromMain()
    refreshImportedVersions()  // carga las biblias importadas para que aparezcan en el selector
  }, [])

  // Eventos globales emitidos desde shortcuts
  useEffect(() => {
    const offSettings = subscribe('settings:open', (payload) => {
      setSettingsOpen(true)
      // El emisor puede pasar { section: 'canciones' } para abrir directo
      // en una sección específica (ej. el botón "Importar/Exportar" en Canciones).
      if (payload?.section) setSettingsInitialSection(payload.section)
      else setSettingsInitialSection(null)
    })
    const offFullscreen = subscribe('projection:toggle-fullscreen', async () => {
      if (!window.electron?.projection) return
      const state = await window.electron.projection.state()
      if (state.open.includes('background')) {
        await window.electron.projection.close('background')
      } else {
        await window.electron.projection.open({ mode: 'background' })
      }
    })

    // Click en un item de la Lista del día → navegar al panel correspondiente
    // SIN proyectar (el doble click sí proyecta directamente — esa lógica vive
    // en ScheduleStrip y llama a setLive sin pasar por aquí).
    const offScheduleFocus = subscribe('schedule:focus', (item) => {
      if (!item) return
      switch (item.type) {
        case 'song':
          setActivePanel('songs')
          setTimeout(() => emit('songs:focus-item', item), 80)
          break
        case 'bible':
          setActivePanel('bible')
          setTimeout(() => emit('bible:focus-item', item), 80)
          break
        case 'image':
          setActivePanel('image')
          setTimeout(() => emit('image:focus-item', item), 80)
          break
        case 'video':
          setActivePanel('video')
          setTimeout(() => emit('video:focus-item', item), 80)
          break
      }
    })

    // Eventos del control remoto móvil → traducir a acciones de la app
    const offRemote = window.electron?.server?.onRemoteEvent?.((name, payload) => {
      switch (name) {
        case 'next':  emit('navigate:next'); break
        case 'prev':  emit('navigate:prev'); break
        case 'blank': setLive(BLANK_SLIDE); break
        case 'black': setLive(BLACKOUT_SLIDE); break
        case 'clear': setLive(null); break

        case 'bible-ref':
          // Búsqueda libre desde móvil (ej. "salmos 22:1").
          // Cambiamos al panel Biblia y emitimos un evento que BiblePanel escucha.
          setActivePanel('bible')
          // Pequeño delay para que el panel esté montado antes de buscar
          setTimeout(() => emit('bible:remote-search', payload), 80)
          break

        case 'bible-project-direct': {
          // T9: el mobile ya buscó vía /api/bible/search y nos pasa el
          // versículo resuelto. Proyectamos directo SIN re-abrir el panel
          // ni re-buscar. Validamos shape defensivamente (el server ya lo
          // hace, pero un setLive con datos corruptos rompe el monitor).
          const ref = typeof payload?.reference === 'string' ? payload.reference : ''
          const text = typeof payload?.text === 'string' ? payload.text : ''
          if (!ref || !text) break
          setLive({
            type: 'bible',
            text,
            reference: ref,
            // Mantener meta opcional para que el SongHistory/historial de
            // Biblia (si lo consume el slide) pueda guardar el origen.
            meta: payload?.bookIndex != null && payload?.chapterNum != null
              ? {
                  bookIndex: payload.bookIndex,
                  chapterNum: payload.chapterNum,
                  verseNum: payload.verseNum,
                  verseEnd: payload.verseEnd || null,
                }
              : undefined,
          })
          break
        }

        case 'song':
          // El móvil pidió proyectar una canción por id.
          // Cambiamos al panel canciones y emitimos al SongsPanel.
          setActivePanel('songs')
          setTimeout(() => emit('songs:remote-project', payload), 80)
          break
      }
    })

    // Confirmación de cierre de la app: el main process pide al renderer
    // que muestre el AppDialog custom (en lugar del dialog nativo Win11)
    // y luego responde con true/false para que main decida cerrar.
    // ACK INMEDIATO: cancela el timer del fallback nativo en el main —
    // sin esto, si el usuario tarda >2s en decidir, salía el nativo en
    // paralelo (bug v0.2.14-v0.2.16). El ack confirma que el listener
    // está vivo; el respond viene después con la decisión del usuario.
    const offQuit = window.electron?.app?.onRequestQuitConfirm?.(async () => {
      // Ack síncrono — corre ANTES de mostrar el modal.
      try { window.electron?.app?.ackQuitConfirm?.() } catch {}
      try {
        const ok = await dialogConfirm({
          title: 'Cerrar EclesiaPresenter',
          message: '¿Seguro que quieres cerrar la aplicación?',
          detail: 'Se cerrarán también las ventanas de proyección y overlay que estén abiertas.',
          confirmLabel: 'Cerrar EclesiaPresenter',
          cancelLabel: 'Cancelar',
          variant: 'danger',
        })
        await window.electron.app.respondQuitConfirm(!!ok)
      } catch {
        // Defensa: si algo falla, respondemos false para no atrapar al main
        try { await window.electron.app.respondQuitConfirm(false) } catch {}
      }
    })

    return () => { offSettings(); offFullscreen(); offScheduleFocus(); offRemote?.(); offQuit?.() }
  }, [])

  useGlobalShortcuts({
    onPanelChange: setActivePanel,
    onBlank: (kind) => setLive(kind === 'blackout' ? BLACKOUT_SLIDE : BLANK_SLIDE),
    onClearSlide: () => setLive(null),
    onOpenPalette: () => setPaletteOpen(true),
  })

  const Panel = PANELS[activePanel] || BiblePanel

  return (
    <>
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
      <div className="vignette" />
      <div className="app-shell">
        <Topbar
          onSettingsChange={() => setSettingsRev(r => r + 1)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div
          className="main-grid"
          style={{ gridTemplateColumns: `64px 1fr 6px ${monitorWidth}px` }}>
          <Sidebar active={activePanel} onChange={setActivePanel} />
          {/* Cada panel envuelto: si uno crashea, el resto de la app sigue
              usable (no pantalla negra total). key=activePanel resetea el
              boundary al cambiar de panel. */}
          <ErrorBoundary key={activePanel + ':' + settingsRev}>
            <Panel key={settingsRev} onSendSlide={selectSlide} slide={live} />
          </ErrorBoundary>
          {/* Divider arrastrable entre el panel y el monitor de previsualización.
              Drag a la izquierda → monitor más ancho; doble click → reset. */}
          <ResizableDivider
            size={monitorWidth}
            onResize={setMonitorWidth}
            onCommit={persistMonitorWidth}
            direction="right"
            min={MAIN_MONITOR_MIN}
            max={MAIN_MONITOR_MAX}
            variant="main"
          />
          <ErrorBoundary>
            <SlidePreview />
          </ErrorBoundary>
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPanelChange={setActivePanel}
      />
      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onUpdate={() => setSettingsRev(r => r + 1)}
          initialSection={settingsInitialSection}
        />
      )}
      {/* Modal global de confirm/alert/prompt: montado siempre, renderiza
          null cuando no hay dialog activo. Reemplaza los window.* nativos
          (look genérico Win11) por uno acorde al brand cobre. */}
      <AppDialog />
    </>
  )
}
