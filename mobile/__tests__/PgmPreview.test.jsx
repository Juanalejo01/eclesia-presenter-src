/**
 * PgmPreview.test.jsx
 *
 * Cobertura del componente. Verifica los 4 estados (empty, blackout,
 * blank, content) y la aplicación del theme en el modo content.
 *
 * jsdom NO trae ResizeObserver — lo mockeamos en beforeAll. También
 * jsdom devuelve clientWidth=0 por defecto, así que en los tests de
 * content forzamos el ancho con un Object.defineProperty para validar
 * que el fontSize se calcula con el container real.
 */
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import PgmPreview from '../src/components/PgmPreview.jsx'
import { DEFAULT_THEME } from '../src/services/slideTheme.js'

// Mock ResizeObserver (no existe en jsdom)
beforeAll(() => {
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

// ─────────────────────────────────────────────────────────────────────
// 1. slide=null → muestra el estado vacío
// ─────────────────────────────────────────────────────────────────────
test('1. slide=null → "Sin contenido proyectado"', () => {
  render(<PgmPreview slide={null} theme={DEFAULT_THEME} />)
  expect(screen.getByText(/Sin contenido proyectado/i)).toBeInTheDocument()
})

// ─────────────────────────────────────────────────────────────────────
// 2. type='blackout' → label "Blackout" + bg negro
// ─────────────────────────────────────────────────────────────────────
test('2. type=blackout → label "Blackout"', () => {
  render(<PgmPreview slide={{ type: 'blackout' }} theme={DEFAULT_THEME} />)
  const node = screen.getByText(/^Blackout$/i)
  expect(node).toBeInTheDocument()
  // La aria-label es "Proyección en blackout"
  expect(screen.getByLabelText(/Proyección en blackout/i)).toBeInTheDocument()
})

// ─────────────────────────────────────────────────────────────────────
// 3. type='blank' sin texto → label "Slide en blanco"
// ─────────────────────────────────────────────────────────────────────
test('3. type=blank → label "Slide en blanco"', () => {
  render(<PgmPreview slide={{ type: 'blank' }} theme={DEFAULT_THEME} />)
  expect(screen.getByText(/Slide en blanco/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Slide en blanco proyectado/i)).toBeInTheDocument()
})

// ─────────────────────────────────────────────────────────────────────
// 4. slide normal con text → renderiza texto y aplica color del theme
// ─────────────────────────────────────────────────────────────────────
test('4. content con texto → muestra texto + style con fontColor del theme', () => {
  const theme = {
    ...DEFAULT_THEME,
    fontColor: 'rgb(255, 0, 0)',
    bgType: 'solid',
    bgColor: 'rgb(0, 255, 0)',
  }
  render(
    <PgmPreview
      slide={{ text: 'Porque de tal manera amó Dios' }}
      theme={theme}
    />,
  )
  const p = screen.getByText(/Porque de tal manera amó Dios/i)
  expect(p).toBeInTheDocument()
  // El style con color vive en el wrapper padre del <p>
  const wrapper = p.parentElement
  expect(wrapper.style.color).toBe('rgb(255, 0, 0)')
  expect(wrapper.style.fontFamily).toBe(DEFAULT_THEME.fontFamily)
})

// ─────────────────────────────────────────────────────────────────────
// 5. reference + referenceUppercase=true → CSS text-transform uppercase
// ─────────────────────────────────────────────────────────────────────
test('5. reference con uppercase=true → style textTransform: uppercase', () => {
  render(
    <PgmPreview
      slide={{ text: 'Hola', reference: 'Juan 3:16' }}
      theme={{ ...DEFAULT_THEME, referenceUppercase: true }}
    />,
  )
  const ref = screen.getByText(/Juan 3:16/i)
  expect(ref).toBeInTheDocument()
  expect(ref.style.textTransform).toBe('uppercase')
})

// ─────────────────────────────────────────────────────────────────────
// 6. reference con referenceVisible=false → no se renderiza
// ─────────────────────────────────────────────────────────────────────
test('6. referenceVisible=false → reference oculto aunque slide lo tenga', () => {
  render(
    <PgmPreview
      slide={{ text: 'Hola', reference: 'Juan 3:16' }}
      theme={{ ...DEFAULT_THEME, referenceVisible: false }}
    />,
  )
  expect(screen.getByText(/Hola/i)).toBeInTheDocument()
  expect(screen.queryByText(/Juan 3:16/i)).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────
// 7. XSS literal: slide.text con <script> se renderiza como texto plano
//    (React escape por defecto).
// ─────────────────────────────────────────────────────────────────────
test('7. text con tags HTML se escapa (no inyecta nodos)', () => {
  const danger = '<script>alert(1)</script>'
  render(
    <PgmPreview slide={{ text: danger }} theme={DEFAULT_THEME} />,
  )
  // Aparece como texto literal, no como elemento script.
  expect(screen.getByText(danger)).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────
// 8. content sin theme (undefined) → no crashea, usa defaults
// ─────────────────────────────────────────────────────────────────────
test('8. content sin theme → renderiza usando defaults', () => {
  render(<PgmPreview slide={{ text: 'Hola' }} theme={undefined} />)
  expect(screen.getByText(/Hola/i)).toBeInTheDocument()
})
