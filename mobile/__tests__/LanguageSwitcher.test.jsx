/**
 * LanguageSwitcher.test.jsx (T13)
 *
 * - radiogroup con 3 radios y aria-checked en el locale activo
 * - click 'English' → un sibling con useT() re-renderiza EN al instante
 *   (misma identidad de nodo — sin remount)
 * - click persiste via Preferences.set('eclesia.locale')
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { Preferences } from '@capacitor/preferences'

const mockTapLight = jest.fn()
jest.mock('../src/services/haptics.js', () => ({
  tapLight: (...args) => mockTapLight(...args),
  tapMedium: jest.fn(),
}))

import LanguageSwitcher from '../src/components/LanguageSwitcher.jsx'
import { useT } from '../src/hooks/useT.js'
import { setLocale } from '../src/services/i18n.js'

// Sibling de prueba: si useT() re-suscribe bien, el texto flippea sin
// que LanguageSwitcher lo toque.
function Probe() {
  const { t } = useT()
  return <span data-testid="probe">{t('more.title')}</span>
}

beforeEach(async () => {
  mockTapLight.mockClear()
  await Preferences.clear()
  window.localStorage.clear()
})

afterEach(async () => {
  setLocale('es', { persist: false })
  await Preferences.clear()
  window.localStorage.clear()
  jest.restoreAllMocks()
})

test('renderiza 3 radios desde AVAILABLE_LOCALES con aria-checked en el activo', () => {
  render(<LanguageSwitcher />)
  const group = screen.getByRole('radiogroup')
  expect(group).toBeInTheDocument()
  const radios = screen.getAllByRole('radio')
  expect(radios).toHaveLength(3)
  expect(radios.map((r) => r.textContent)).toEqual(['Español', 'English', 'Português'])
  expect(screen.getByRole('radio', { name: 'Español' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'false')
})

test('click English → sibling con useT() re-renderiza EN al instante sin remount', () => {
  render(
    <>
      <LanguageSwitcher />
      <Probe />
    </>,
  )
  const probeBefore = screen.getByTestId('probe')
  expect(probeBefore).toHaveTextContent('Mas')

  fireEvent.click(screen.getByRole('radio', { name: 'English' }))

  const probeAfter = screen.getByTestId('probe')
  // Misma identidad de nodo → re-render, NO remount.
  expect(probeAfter).toBe(probeBefore)
  expect(probeAfter).toHaveTextContent('More')
  expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  expect(mockTapLight).toHaveBeenCalledTimes(1)
})

test('click persiste en Preferences con key eclesia.locale (+ espejo localStorage)', async () => {
  const setSpy = jest.spyOn(Preferences, 'set')
  render(<LanguageSwitcher />)
  fireEvent.click(screen.getByRole('radio', { name: 'Português' }))
  await new Promise((r) => setTimeout(r, 0))
  expect(setSpy).toHaveBeenCalledWith({ key: 'eclesia.locale', value: 'pt' })
  expect(window.localStorage.getItem('eclesia.locale')).toBe('pt')
})

test('document.documentElement.lang se actualiza al cambiar idioma', () => {
  render(<LanguageSwitcher />)
  fireEvent.click(screen.getByRole('radio', { name: 'English' }))
  expect(document.documentElement.getAttribute('lang')).toBe('en')
})
