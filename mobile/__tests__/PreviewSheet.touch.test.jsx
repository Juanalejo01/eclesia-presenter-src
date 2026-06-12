/**
 * PreviewSheet.touch.test.jsx (hardening v0.2.0)
 *
 * Regresión del bug de touch-scroll: touchAction:'none' vivía en el
 * BACKDROP de los bottom-sheets, lo que bloqueaba el overflow-y-auto del
 * contenido (versículos largos / lista de secciones no scrolleaban en
 * táctil). El fix mueve touchAction:'none' + los touch handlers del
 * swipe-down SOLO al drag handle.
 *
 * Estructura DOM asumida (ambos sheets):
 *   backdrop (container.firstChild)
 *     └─ sheet (role=dialog)
 *          ├─ handle (primer hijo, aria-hidden)  ← touchAction:'none' + swipe
 *          └─ contenido scrolleable (overflow-y-auto)
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import BiblePreviewSheet from '../src/components/BiblePreviewSheet.jsx'
import SongPreviewSheet from '../src/components/SongPreviewSheet.jsx'

const bibleItem = { reference: 'Juan 3:16', text: 'Porque de tal manera amó Dios al mundo…' }
const song = { id: 1, title: 'Cuán Grande Es Él', sections: [] }

function renderBible(props = {}) {
  const onClose = jest.fn()
  const utils = render(
    <BiblePreviewSheet open item={bibleItem} onClose={onClose} onProject={jest.fn()} {...props} />,
  )
  return { onClose, ...utils }
}

function renderSong(props = {}) {
  const onClose = jest.fn()
  const utils = render(
    <SongPreviewSheet open song={song} onClose={onClose} onProjectSection={jest.fn()} {...props} />,
  )
  return { onClose, ...utils }
}

function getParts(container) {
  const backdrop = container.firstChild
  const sheet = backdrop.querySelector('[role="dialog"]')
  const handle = sheet.firstChild
  return { backdrop, sheet, handle }
}

function swipeDown(el, dy) {
  fireEvent.touchStart(el, { touches: [{ clientY: 100 }] })
  fireEvent.touchMove(el, { touches: [{ clientY: 100 + dy }] })
  fireEvent.touchEnd(el)
}

describe.each([
  ['BiblePreviewSheet', renderBible],
  ['SongPreviewSheet', renderSong],
])('%s — touch scroll vs swipe-down', (_name, renderSheet) => {
  test('el backdrop y el contenido NO tienen touchAction none (scroll táctil libre)', () => {
    const { container } = renderSheet()
    const { backdrop, sheet } = getParts(container)
    expect(backdrop.style.touchAction).not.toBe('none')
    const scrollable = sheet.querySelector('.overflow-y-auto')
    expect(scrollable).not.toBeNull()
    expect(scrollable.style.touchAction).not.toBe('none')
  })

  test('el drag handle SÍ tiene touchAction none', () => {
    const { container } = renderSheet()
    const { handle } = getParts(container)
    expect(handle).toHaveAttribute('aria-hidden', 'true')
    expect(handle.style.touchAction).toBe('none')
  })

  test('swipe-down >120px sobre el handle cierra el sheet', () => {
    const { container, onClose } = renderSheet()
    const { handle } = getParts(container)
    swipeDown(handle, 160)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('swipe-down corto (<=120px) sobre el handle NO cierra', () => {
    const { container, onClose } = renderSheet()
    const { handle } = getParts(container)
    swipeDown(handle, 80)
    expect(onClose).not.toHaveBeenCalled()
  })
})

test('BiblePreviewSheet: el contenido del versículo sigue presente y scrolleable por clase', () => {
  const { container } = renderBible()
  const { sheet } = getParts(container)
  const scrollable = sheet.querySelector('.overflow-y-auto')
  expect(scrollable).toHaveTextContent('Porque de tal manera')
})
