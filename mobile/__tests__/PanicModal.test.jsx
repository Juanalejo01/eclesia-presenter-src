/**
 * PanicModal.test.jsx (T13)
 *
 * alertdialog accesible: aria-modal + labelledby/describedby, focus
 * inicial en Cancelar, focus trap Tab/Shift+Tab, Escape, overlay click,
 * y el guard anti doble-tap (onConfirm exactamente una vez).
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'

import PanicModal from '../src/components/PanicModal.jsx'

function renderOpen(props = {}) {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  const utils = render(
    <PanicModal open onConfirm={onConfirm} onCancel={onCancel} {...props} />,
  )
  return { onConfirm, onCancel, ...utils }
}

afterEach(() => {
  jest.useRealTimers()
})

test('open=false no renderiza nada', () => {
  render(<PanicModal open={false} onConfirm={jest.fn()} onCancel={jest.fn()} />)
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('open renderiza alertdialog con aria-modal y labelledby/describedby resolubles', () => {
  renderOpen()
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toHaveAttribute('aria-modal', 'true')

  const titleId = dialog.getAttribute('aria-labelledby')
  const bodyId = dialog.getAttribute('aria-describedby')
  expect(titleId).toBeTruthy()
  expect(bodyId).toBeTruthy()
  expect(document.getElementById(titleId))
    .toHaveTextContent('¿Cerrar todas las ventanas de proyección?')
  expect(document.getElementById(bodyId))
    .toHaveTextContent(/NO cierra la app del PC/)
})

test('el foco aterriza en Cancelar al abrir (delay ~50ms)', () => {
  jest.useFakeTimers()
  renderOpen()
  act(() => { jest.advanceTimersByTime(60) })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
})

test('focus trap: Tab desde Cancelar (ultimo) vuelve a Confirmar; Shift+Tab desde Confirmar va a Cancelar', () => {
  jest.useFakeTimers()
  renderOpen()
  act(() => { jest.advanceTimersByTime(60) })

  const confirm = screen.getByRole('button', { name: 'Cerrar proyección' })
  const cancel = screen.getByRole('button', { name: 'Cancelar' })

  // activeElement = cancel (ultimo focusable). Tab → wrap al primero.
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(document.activeElement).toBe(confirm)

  // Shift+Tab desde el primero → wrap al ultimo. Nunca escapa al fondo.
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(cancel)
})

test('Escape llama onCancel y NO onConfirm', () => {
  const { onConfirm, onCancel } = renderOpen()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
})

test('click en el overlay cancela; click dentro del card NO (stopPropagation)', () => {
  const { onCancel, container } = renderOpen()
  // Click dentro del card (titulo) → no cancela.
  fireEvent.click(screen.getByText('¿Cerrar todas las ventanas de proyección?'))
  expect(onCancel).not.toHaveBeenCalled()
  // Click en el backdrop (primer hijo del container) → cancela.
  fireEvent.click(container.firstChild)
  expect(onCancel).toHaveBeenCalledTimes(1)
})

test('guard anti doble-tap: dos clicks rapidos → onConfirm exactamente 1 vez + boton disabled', () => {
  const { onConfirm } = renderOpen()
  const confirm = screen.getByRole('button', { name: 'Cerrar proyección' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(confirm).toBeDisabled()
  expect(confirm).toHaveAttribute('aria-disabled', 'true')
})

test('reabrir el modal re-arma el guard (segunda apertura puede confirmar)', () => {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  const { rerender } = render(
    <PanicModal open onConfirm={onConfirm} onCancel={onCancel} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar proyección' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)

  rerender(<PanicModal open={false} onConfirm={onConfirm} onCancel={onCancel} />)
  rerender(<PanicModal open onConfirm={onConfirm} onCancel={onCancel} />)

  const confirm = screen.getByRole('button', { name: 'Cerrar proyección' })
  expect(confirm).not.toBeDisabled()
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenCalledTimes(2)
})
