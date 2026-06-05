// Store reactivo del tema de proyección.
// Single source of truth — el SlidePreview lateral, el ThemePreview
// del panel de proyección y la ventana real, todos consumen este store.

import { useEffect, useState } from 'react'

// Default del overlay (lower-third) — independiente del fondo de pantalla completa.
// Editable desde ProjectionPanel y se aplica solo a la ventana overlay capturable por OBS.
export const DEFAULT_OVERLAY = {
  // Estilo del fondo de la banda
  bgEnabled: true,
  bgType: 'gradient',                 // 'solid' | 'gradient' | 'transparent'
  bgColor: 'rgba(20, 16, 13, 0.88)',
  bgGradient: ['rgba(20, 16, 13, 0)', 'rgba(20, 16, 13, 0.95)'],
  bgBlur: 2,                          // backdrop-filter blur (px)

  // Posición
  position: 'bottom',                 // 'top' | 'bottom'
  offsetY: 90,                        // distancia al borde (px)
  offsetX: 80,                        // margen lateral (px)
  padding: '32px 48px',

  // Borde acento
  borderEnabled: true,
  borderColor: '#c8794a',             // copper-300
  borderWidth: 6,
  borderSide: 'left',                 // 'left' | 'top' | 'all' | 'none'
  borderRadius: 8,

  // Texto principal
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: 54,
  fontColor: '#ffffff',
  fontWeight: 500,
  textShadow: true,

  // Referencia
  refEnabled: true,
  refFontSize: 18,
  refFontColor: '#db9f75',            // copper-200
  refUppercase: true,
}

// Default unificado entre renderer y main. Si lo cambias, sincroniza también
// `defaultTheme()` en src/main/projection.js.
const DEFAULT_THEME = {
  bgType: 'gradient',
  bgColor: '#0a1620',
  bgGradient: ['#0a1620', '#1e3a5f'],
  bgImage: null,
  bgVideo: null,
  // Cómo encajar imágenes/videos cuando son de orientación distinta a 16:9:
  //   'cover'   → llena el frame recortando partes (default, mejor para horizontales)
  //   'contain' → muestra el medio entero con barras laterales (mejor para verticales)
  //   'fill'    → estira hasta llenar (puede deformar)
  imageFit: 'contain',            // default: mostrar imagen completa con barras (mejor para verticales)
  videoFit: 'contain',
  bgImageBlur: 16,                // default: fondo borroso para tapar las barras (efecto Spotify/iOS)
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: 64,
  fontColor: '#ffffff',
  fontWeight: 500,
  textShadow: true,
  textAlign: 'center',
  referenceVisible: true,
  // Tamaño de la referencia bíblica relativo al texto principal.
  // 4 niveles: 'sm' (1/5), 'md' (1/4 — default original), 'lg' (1/3), 'xl' (1/2).
  // Nunca debe superar el tamaño del texto principal (= máximo 'xl' = 50%).
  referenceSize: 'md',
  transitionType: 'fade',
  transitionDuration: 500,
  transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // Configuración del overlay (lower-third) — anidada para mantener un único theme
  overlay: { ...DEFAULT_OVERLAY },
}

let currentTheme = { ...DEFAULT_THEME, overlay: { ...DEFAULT_OVERLAY } }
const listeners = new Set()

function emit() {
  for (const fn of listeners) try { fn(currentTheme) } catch {}
}

export function getTheme() { return currentTheme }

export function setTheme(patch) {
  // Permite patch parcial. Para overlay se hace merge profundo.
  const next = { ...currentTheme, ...patch }
  if (patch.overlay) next.overlay = { ...currentTheme.overlay, ...patch.overlay }
  currentTheme = next
  emit()
  if (window.electron?.projection) window.electron.projection.theme(patch)
}

/** Patch específico del overlay (atajo) — solo cambia los campos declarados. */
export function setOverlay(overlayPatch) {
  setTheme({ overlay: overlayPatch })
}

/**
 * Restablece TODO el theme de proyección a los valores por defecto.
 * Recupera de un tema oscuro/roto (p.ej. fondo casi-negro o restos de vídeo).
 * Actualiza el preview al instante y resetea también la ventana de proyección.
 */
export function resetTheme() {
  currentTheme = { ...DEFAULT_THEME, overlay: { ...DEFAULT_OVERLAY } }
  emit()
  if (window.electron?.projection?.resetTheme) window.electron.projection.resetTheme()
  else if (window.electron?.projection) window.electron.projection.theme(currentTheme)
}

/**
 * Aplica un preset al overlay reemplazando los campos visuales (fondo, colores,
 * posición, tipografía del preset) pero PRESERVANDO los ajustes personales del
 * usuario (tamaño de letra, alineación, peso, fuente personalizada).
 *
 * Esto evita que al hacer click en otro estilo predefinido se resetee el
 * trabajo del usuario sobre la legibilidad.
 */
export function applyOverlayPreset(presetOverlay) {
  // Campos del overlay actual que mantenemos pase lo que pase
  const PRESERVED_KEYS = ['fontSize', 'fontFamily', 'fontWeight', 'textAlign']
  const preserved = {}
  for (const k of PRESERVED_KEYS) {
    if (currentTheme.overlay && currentTheme.overlay[k] !== undefined) {
      preserved[k] = currentTheme.overlay[k]
    }
  }
  setTheme({ overlay: { ...DEFAULT_OVERLAY, ...presetOverlay, ...preserved } })
}

export function subscribeTheme(fn) {
  listeners.add(fn)
  fn(currentTheme)
  return () => listeners.delete(fn)
}

export async function syncFromMain() {
  if (!window.electron?.projection) return
  const state = await window.electron.projection.state()
  if (state?.theme) {
    currentTheme = {
      ...DEFAULT_THEME,
      ...state.theme,
      overlay: { ...DEFAULT_OVERLAY, ...(state.theme.overlay || {}) },
    }
    emit()
  }
  // Push para garantizar que el main tiene exactamente este theme
  window.electron.projection.theme(currentTheme)
}

export function useTheme() {
  const [theme, setLocal] = useState(currentTheme)
  useEffect(() => subscribeTheme(setLocal), [])
  return theme
}

// 6 presets visuales para el overlay (la "baraja" del lower-third)
export const OVERLAY_PRESETS = [
  {
    id: 'broadcast',
    label: 'Broadcast',
    description: 'Cobre clásico (default)',
    preview: { bg: 'linear-gradient(180deg, transparent, rgba(20,16,13,0.95))', border: '#c8794a' },
    overlay: {
      bgEnabled: true, bgType: 'gradient',
      bgGradient: ['rgba(20, 16, 13, 0)', 'rgba(20, 16, 13, 0.95)'],
      borderEnabled: true, borderColor: '#c8794a', borderSide: 'left', borderWidth: 6,
      fontColor: '#ffffff', refFontColor: '#db9f75',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Sin fondo · solo texto',
    preview: { bg: 'transparent', border: 'transparent' },
    overlay: {
      bgEnabled: false, bgType: 'transparent',
      borderEnabled: false,
      textShadow: true,
      fontColor: '#ffffff', refFontColor: '#f5dec8',
    },
  },
  {
    id: 'banner',
    label: 'Banner negro',
    description: 'Caja negra opaca',
    preview: { bg: 'rgba(0,0,0,0.85)', border: 'transparent' },
    overlay: {
      bgEnabled: true, bgType: 'solid',
      bgColor: 'rgba(0, 0, 0, 0.88)',
      borderEnabled: false,
      fontColor: '#ffffff', refFontColor: '#ffffff',
    },
  },
  {
    id: 'cinema',
    label: 'Cinema',
    description: 'Banda superior elegante',
    preview: { bg: 'linear-gradient(0deg, transparent, rgba(0,0,0,0.85))', border: '#f5dec8' },
    overlay: {
      bgEnabled: true, bgType: 'gradient',
      bgGradient: ['rgba(0, 0, 0, 0.92)', 'rgba(0, 0, 0, 0)'],
      borderEnabled: true, borderColor: '#f5dec8', borderSide: 'top', borderWidth: 2,
      position: 'top',
      fontColor: '#ffffff', refFontColor: '#f5dec8',
    },
  },
  {
    id: 'card',
    label: 'Card flotante',
    description: 'Tarjeta con sombra',
    preview: { bg: 'rgba(34,26,20,0.95)', border: 'transparent' },
    overlay: {
      bgEnabled: true, bgType: 'solid',
      bgColor: 'rgba(34, 26, 20, 0.92)',
      borderEnabled: false,
      borderRadius: 16,
      fontColor: '#f4e6d7', refFontColor: '#db9f75',
    },
  },
  {
    id: 'ticker',
    label: 'Ticker rojo',
    description: 'Aviso · estilo urgente',
    preview: { bg: 'rgba(214,42,42,0.92)', border: '#ff5252' },
    overlay: {
      bgEnabled: true, bgType: 'solid',
      bgColor: 'rgba(214, 42, 42, 0.92)',
      borderEnabled: true, borderColor: '#ff5252', borderSide: 'left', borderWidth: 8,
      fontColor: '#ffffff', refFontColor: '#fff5d6',
    },
  },
]

export { DEFAULT_THEME }
