// Listar fuentes instaladas en el sistema usando la Local Font Access API
// (Chromium 103+, disponible en Electron).
// Cae a una lista comodín si la API no está disponible.

const FALLBACK_FONTS = [
  { family: 'Cormorant Garamond', generic: false },
  { family: 'Inter',              generic: false },
  { family: 'Geist',              generic: false },
  { family: 'Times New Roman',    generic: false },
  { family: 'Georgia',            generic: false },
  { family: 'Arial',              generic: false },
  { family: 'Helvetica',          generic: false },
  { family: 'Verdana',            generic: false },
  { family: 'Courier New',        generic: false },
  { family: 'serif',              generic: true  },
  { family: 'sans-serif',         generic: true  },
  { family: 'monospace',          generic: true  },
]

let cachedFonts = null

export async function listSystemFonts() {
  if (cachedFonts) return cachedFonts

  // Local Font Access API
  if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
    try {
      const fonts = await window.queryLocalFonts()
      // Agrupar por family única, ordenadas alfabéticamente
      const families = new Set()
      for (const f of fonts) families.add(f.family)
      cachedFonts = [...families].sort((a, b) => a.localeCompare(b))
        .map(family => ({ family, generic: false }))

      // Añadir genéricos al final
      cachedFonts.push(
        { family: 'serif',      generic: true },
        { family: 'sans-serif', generic: true },
        { family: 'monospace',  generic: true },
      )
      return cachedFonts
    } catch (e) {
      console.warn('queryLocalFonts failed:', e.message)
    }
  }

  // Fallback: lista cerrada de fuentes comunes
  cachedFonts = FALLBACK_FONTS
  return cachedFonts
}

export function isLocalFontAccessSupported() {
  return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function'
}
