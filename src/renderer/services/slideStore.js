// Store del slide actual + slide de preview (modo stage display).
//
// Comportamiento:
//   • Live mode (default):  selecciono → va directo al live
//   • Preview mode:          selecciono → va solo al preview, hay que pulsar "Enviar al vivo"
//
// El SlidePreview lateral muestra `live` con badge "EN VIVO".
// El segundo recuadro (cuando preview mode activo) muestra `preview` con badge "PRÓXIMO".

import { useEffect, useState } from 'react'

let live = null      // lo que se proyecta ahora
let preview = null   // lo que se selecciona si previewMode = true
let previewMode = false

const listeners = new Set()
function emit() {
  const snap = { live, preview, previewMode }
  for (const fn of listeners) try { fn(snap) } catch {}
}

export function subscribe(fn) {
  listeners.add(fn)
  fn({ live, preview, previewMode })
  return () => listeners.delete(fn)
}

export function getState() { return { live, preview, previewMode } }

/** Llamado desde los paneles cuando el usuario selecciona algo */
export function selectSlide(slide) {
  if (previewMode) {
    preview = slide
  } else {
    live = slide
    syncToMain(slide)
  }
  emit()
}

/** Manda lo del preview al live (botón "Enviar al vivo") */
export function commitPreview() {
  if (preview) {
    live = preview
    syncToMain(live)
    emit()
  }
}

export function setLive(slide) {
  live = slide
  syncToMain(slide)
  emit()
}

export function setPreviewMode(value) {
  previewMode = value
  if (!value) preview = null
  emit()
}

function syncToMain(slide) {
  // Compat con la ruta antigua
  if (window.electron?.sendSlide) window.electron.sendSlide(slide)
}

export function useSlideStore() {
  const [state, setState] = useState({ live, preview, previewMode })
  useEffect(() => subscribe(setState), [])
  return state
}
