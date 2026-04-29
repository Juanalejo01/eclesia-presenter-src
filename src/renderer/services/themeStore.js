// Store reactivo del tema de proyección.
// Single source of truth — el SlidePreview lateral, el ThemePreview
// del panel de proyección y la ventana real, todos consumen este store.

import { useEffect, useState } from 'react'

const DEFAULT_THEME = {
  bgType: 'gradient',
  bgColor: '#000000',
  bgGradient: ['#1e3a5f', '#0f172a'],
  bgImage: null,
  bgVideo: null,
  fontFamily: 'Inter',
  fontSize: 64,
  fontColor: '#ffffff',
  fontWeight: 600,
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

export async function syncFromMain() {
  if (!window.electron?.projection) return
  const state = await window.electron.projection.state()
  if (state?.theme) {
    currentTheme = { ...DEFAULT_THEME, ...state.theme }
    emit()
  }
}

/** Hook para componentes — re-renderizan cuando el tema cambia */
export function useTheme() {
  const [theme, setLocal] = useState(currentTheme)
  useEffect(() => subscribeTheme(setLocal), [])
  return theme
}

export { DEFAULT_THEME }
