/**
 * BottomNav.test.jsx (v0.2.1)
 *
 * Cubre dos cosas:
 *
 * 1. REGRESIÓN del bug "barra invisible tras emparejar" (v0.2.0): la
 *    visibilidad de la barra dependía de un snapshot one-shot de
 *    hasCredentials tomado en el boot. Si arrancabas sin creds y
 *    emparejabas, la barra no aparecía hasta reiniciar la app. El fix
 *    deriva la visibilidad de la RUTA (oculta solo en /pair), así que
 *    aquí se testea esa regla a nivel de App.
 *
 * 2. El rediseño de la barra: iconos SVG (no emoji), píldora indicadora
 *    que sigue al tab activo, aria-current del NavLink y haptic al tap.
 */
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import BottomNav from '../src/components/BottomNav.jsx'

jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))
import { tapLight } from '../src/services/haptics.js'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

beforeEach(() => jest.clearAllMocks())

describe('BottomNav (rediseño v0.2.1)', () => {
  test('1. renderiza los 4 tabs con labels ES por defecto', () => {
    renderAt('/service')
    expect(screen.getByText('Servicio')).toBeInTheDocument()
    expect(screen.getByText('Biblia')).toBeInTheDocument()
    expect(screen.getByText('Canciones')).toBeInTheDocument()
    expect(screen.getByText('Más')).toBeInTheDocument()
  })

  test('2. el nav tiene aria-label traducido', () => {
    renderAt('/service')
    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument()
  })

  test('3. el tab de la ruta actual lleva aria-current=page', () => {
    renderAt('/bible')
    const active = screen.getByRole('link', { name: /Biblia/ })
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Servicio/ })).not.toHaveAttribute(
      'aria-current',
    )
  })

  test('4. la píldora indicadora se posiciona según el tab activo', () => {
    renderAt('/songs') // índice 2 de 4
    const indicator = screen.getByTestId('nav-indicator')
    expect(indicator.style.transform).toBe('translateX(200%)')
  })

  test('5. sin ruta de tab (ej. /pair) no hay píldora', () => {
    renderAt('/pair')
    expect(screen.queryByTestId('nav-indicator')).not.toBeInTheDocument()
  })

  test('5b. el editor cloud (/songs/cloud/*) mantiene activo el tab Canciones (C2)', () => {
    renderAt('/songs/cloud/new')
    const indicator = screen.getByTestId('nav-indicator')
    expect(indicator.style.transform).toBe('translateX(200%)')
    expect(screen.getByRole('link', { name: /Canciones/ })).toHaveAttribute('aria-current', 'page')
  })

  test('6. iconos son SVG (no emoji) y aria-hidden', () => {
    const { container } = renderAt('/service')
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(svgs.length).toBe(4)
  })

  test('7. tap en un tab dispara haptic ligero', () => {
    renderAt('/service')
    screen.getByRole('link', { name: /Biblia/ }).click()
    expect(tapLight).toHaveBeenCalledTimes(1)
  })
})

describe('App: visibilidad de la barra por ruta (regresión v0.2.0)', () => {
  // Stubs ligeros: aquí solo importa el shell del App, no las screens.
  jest.mock('../src/screens/PairScreen.jsx', () => () => <div>pair-stub</div>)
  jest.mock('../src/screens/ServiceScreen.jsx', () => () => <div>service-stub</div>)
  jest.mock('../src/screens/BibleScreen.jsx', () => () => <div>bible-stub</div>)
  jest.mock('../src/screens/SongsScreen.jsx', () => () => <div>songs-stub</div>)
  jest.mock('../src/screens/MoreScreen.jsx', () => () => <div>more-stub</div>)
  jest.mock('../src/hooks/useBootstrap.js', () => ({
    // Caso del bug: boot SIN credenciales (hasCredentials=false). Tras
    // emparejar, el usuario navega a /service — la barra DEBE verse.
    useBootstrap: () => ({ ready: true, hasCredentials: false }),
  }))
  const App = require('../src/App.jsx').default

  test('8. en /service la barra se ve aunque el boot fuera sin creds', () => {
    render(
      <MemoryRouter initialEntries={['/service']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  test('9. en /pair la barra NO se ve', () => {
    render(
      <MemoryRouter initialEntries={['/pair']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
