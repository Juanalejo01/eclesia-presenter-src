// Almacén de presets de usuario (Edición) — persistido en localStorage.
//
// Dos colecciones independientes:
//   - 'fullscreen': presets de Pantalla completa (theme top-level)
//   - 'overlay':    presets de Lower-third (theme.overlay)
//
// Cada preset guarda un id estable, label editable por el usuario, un
// objeto `theme` con SOLO los campos visuales (no toda la configuración
// del usuario) Y una `bg` con la propiedad CSS background pre-calculada
// para la mini-card (igual que los presets built-in).

import { useEffect, useState } from 'react'

const KEY = (kind) => `eclesia.editor.userPresets.${kind}`

function safeLoad(kind) {
  try {
    const raw = localStorage.getItem(KEY(kind))
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function safeSave(kind, list) {
  try { localStorage.setItem(KEY(kind), JSON.stringify(list)) } catch {}
}

// Genera el background CSS de la mini-card a partir del theme guardado.
// Replica lo que hace EditorCanvas: el thumbnail debe parecerse a lo
// que verás al aplicar el preset.
function computeBg(kind, theme) {
  if (kind === 'fullscreen') {
    if (theme.bgType === 'gradient' && Array.isArray(theme.bgGradient)) {
      return `linear-gradient(135deg, ${theme.bgGradient[0]} 0%, ${theme.bgGradient[1]} 100%)`
    }
    if (theme.bgType === 'solid' && theme.bgColor) return theme.bgColor
    if (theme.bgType === 'image' && theme.bgImage) return `#000`  // miniatura abstracta
    if (theme.bgType === 'video' && theme.bgVideo) return `linear-gradient(135deg, #1a1410, #2a1f17)`
    return '#1a1410'
  }
  // overlay — usamos un degradado representativo de su fondo
  if (theme.bgType === 'gradient' && Array.isArray(theme.bgGradient)) {
    return `linear-gradient(180deg, ${theme.bgGradient[0]} 0%, ${theme.bgGradient[1]} 100%)`
  }
  if (theme.bgType === 'solid' && theme.bgColor) return theme.bgColor
  return 'rgba(20, 16, 13, 0.85)'
}

// Lista de campos VISUALES a guardar — descartamos lo personal del usuario
// (fontSize, fontFamily, alineación, padding, transición) salvo en los
// casos donde el usuario explícitamente quiere capturarlos en el preset.
// Para mantener el comportamiento de los built-in (que NO pisan tamaño/
// fuente al aplicarlos), guardamos solo campos de fondo + colores.
const FULLSCREEN_VISUAL_KEYS = [
  'bgType', 'bgColor', 'bgGradient', 'bgImage', 'bgVideo',
  'imageFit', 'videoFit', 'bgImageBlur',
  'fontColor',
]
const OVERLAY_VISUAL_KEYS = [
  'bgEnabled', 'bgType', 'bgColor', 'bgGradient', 'bgBlur',
  'borderEnabled', 'borderColor', 'borderWidth', 'borderSide', 'borderRadius',
  'fontColor', 'refFontColor',
]

function pickVisual(kind, theme) {
  const out = {}
  const keys = kind === 'fullscreen' ? FULLSCREEN_VISUAL_KEYS : OVERLAY_VISUAL_KEYS
  for (const k of keys) {
    if (theme[k] !== undefined) out[k] = theme[k]
  }
  return out
}

/**
 * Hook React reactivo: lee y manipula los presets de usuario para un kind.
 * Devuelve { presets, save(label, themeOrOverlay), rename(id, label), remove(id) }.
 */
export function useUserPresets(kind) {
  const [presets, setPresets] = useState(() => safeLoad(kind))

  // Sincronización entre tabs/instancias (ej. otra ventana del editor)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY(kind)) setPresets(safeLoad(kind))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [kind])

  const save = (label, source) => {
    const visual = pickVisual(kind, source)
    const preset = {
      id: 'user-' + Date.now().toString(36),
      label: (label || 'Sin nombre').slice(0, 32),
      user: true,
      theme: visual,
      // Para overlay, también guardamos como overlay para poder aplicarlo
      overlay: kind === 'overlay' ? visual : undefined,
      bg: computeBg(kind, visual),
      createdAt: Date.now(),
    }
    const next = [...presets, preset]
    setPresets(next)
    safeSave(kind, next)
    return preset
  }

  const rename = (id, label) => {
    const next = presets.map(p => p.id === id ? { ...p, label: (label || 'Sin nombre').slice(0, 32) } : p)
    setPresets(next)
    safeSave(kind, next)
  }

  const remove = (id) => {
    const next = presets.filter(p => p.id !== id)
    setPresets(next)
    safeSave(kind, next)
  }

  return { presets, save, rename, remove }
}
