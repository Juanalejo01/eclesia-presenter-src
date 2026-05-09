// Store reactivo del tema de proyección.
// Single source of truth — el SlidePreview lateral, el ThemePreview
// del panel de proyección y la ventana real, todos consumen este store.

import { useEffect, useState } from 'react'

// Default unificado entre renderer y main.
// Si cambias esto, actualiza también `defaultTheme()` en src/main/projection.js.
const DEFAULT_THEME = {
  bgType: 'gradient',
  bgColor: '#0a1620',
  bgGradient: ['#0a1620', '#1e3a5f'],
  bgImage: null,
  bgVideo: null,
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: 64,
  fontColor: '#ffffff',
  fontWeight: 500,
  textShadow: true,
  textAlign: 'center',
  referenceVisible: true,
  transitionType: 'fade',
  transitionDuration: 500,
  transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
}

let currentTheme = { ...DEFAULT_THEME }
const listeners = new Set()

function emit() {
  for (const fn of listeners) try { fn(currentTheme) } catch {}
}

export function getTheme() { return currentTheme }

export function setTheme(patch) {
  currentTheme = { ...currentTheme, ...patch }
  emit()
  // Sincronizar al main si hay Electron
  if (window.electron?.projection) window.electron.projection.theme(patch)
}

export function subscribeTheme(fn) {
  listeners.add(fn)
  fn(currentTheme)
  return () => listeners.delete(fn)
}

/**
 * Al arrancar: lee el theme persistido en main + ASEGURA que main tiene
 * el theme actual (push). Esto resuelve el caso en que el main inicia con
 * sus defaults y nunca recibe el theme del renderer hasta que el usuario
 * toque algo.
 */
export async function syncFromMain() {
  if (!window.electron?.projection) return
  const state = await window.electron.projection.state()
  if (state?.theme) {
    currentTheme = { ...DEFAULT_THEME, ...state.theme }
    emit()
  }
  // Push completo del estado actual al main para garantizar sincronía
  // (el main usa esto para inicializar las ventanas de proyección que se abran después).
  window.electron.projection.theme(currentTheme)
}

/** Hook para componentes — re-renderizan cuando el tema cambia */
export function useTheme() {
  const [theme, setLocal] = useState(currentTheme)
  useEffect(() => subscribeTheme(setLocal), [])
  return theme
}

export { DEFAULT_THEME }
