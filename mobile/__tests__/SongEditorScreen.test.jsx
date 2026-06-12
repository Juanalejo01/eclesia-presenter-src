/**
 * SongEditorScreen.test.jsx (C2)
 *
 * Editor de canciones cloud con router REAL (MemoryRouter + Routes):
 * crear, editar, validación de título, secciones (añadir / eliminar /
 * reordenar ↑↓ / chips), confirm de descarte y estados loading/error.
 *
 * Solo se mockea el servicio (CRUD); validateSong/inferSectionType/LIMITS
 * son los reales (requireActual) — el editor valida con la misma función
 * que el servicio.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockGet = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
jest.mock('../src/services/cloudSongs.js', () => {
  const actual = jest.requireActual('../src/services/cloudSongs.js')
  return {
    ...actual,
    get: (...args) => mockGet(...args),
    create: (...args) => mockCreate(...args),
    update: (...args) => mockUpdate(...args),
    list: jest.fn(),
    remove: jest.fn(),
  }
})

jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))

import SongEditorScreen from '../src/screens/SongEditorScreen.jsx'
import { consumeFlash } from '../src/services/flashMessage.js'

function renderEditor(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/songs" element={<div>songs-list-stub</div>} />
        <Route path="/songs/cloud/new" element={<SongEditorScreen />} />
        <Route path="/songs/cloud/:id" element={<SongEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

const SONG = {
  id: 'a1',
  title: 'Sublime Gracia',
  author: 'John Newton',
  tags: 'himno,clásica',
  key_signature: null,
  tempo: null,
  sections: [
    { type: 'verse', label: 'Estrofa 1', text: 'Sublime gracia del Señor' },
    { type: 'chorus', label: 'Coro', text: 'Letra del coro' },
  ],
  max_lines: 4,
  is_favorite: false,
  updated_at: '2026-06-12T10:00:00Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  consumeFlash()
})

/* ============ Crear ============ */

test('1. /new: form vacío con una sección por defecto "Estrofa 1"', () => {
  renderEditor('/songs/cloud/new')
  expect(screen.getByRole('heading', { name: 'Nueva canción' })).toBeInTheDocument()
  expect(screen.getByLabelText('Título')).toHaveValue('')
  expect(screen.getByLabelText('Etiqueta de la sección 1')).toHaveValue('Estrofa 1')
  expect(screen.getByLabelText('Letra de la sección 1')).toHaveValue('')
})

test('2. validación: guardar sin título muestra error inline y NO llama create', async () => {
  renderEditor('/songs/cloud/new')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  })
  // x2: error inline del FormField + live region sr-only para lectores.
  expect(screen.getAllByText('El título es obligatorio.').length).toBeGreaterThan(0)
  expect(mockCreate).not.toHaveBeenCalled()
})

test('3. crear: payload correcto → create + flash + vuelve a /songs', async () => {
  mockCreate.mockResolvedValue({ ok: true, song: { id: 'new-1' } })
  renderEditor('/songs/cloud/new')

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Mi Canción' } })
  fireEvent.change(screen.getByLabelText('Letra de la sección 1'), { target: { value: 'Letra de prueba' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  })

  expect(mockCreate).toHaveBeenCalledWith({
    title: 'Mi Canción',
    author: '',
    tags: '',
    sections: [{ type: 'verse', label: 'Estrofa 1', text: 'Letra de prueba' }],
  })
  expect(screen.getByText('songs-list-stub')).toBeInTheDocument()
  expect(consumeFlash()).toBe('Canción guardada')
})

/* ============ Editar ============ */

test('4. editar: hidrata el form con la canción de la nube', async () => {
  mockGet.mockResolvedValue({ ok: true, song: SONG })
  renderEditor('/songs/cloud/a1')

  expect(screen.getByRole('heading', { name: 'Editar canción' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Sublime Gracia'))
  expect(mockGet).toHaveBeenCalledWith('a1')
  expect(screen.getByLabelText('Autor / compositor')).toHaveValue('John Newton')
  // Regex: el hint de FormField vive dentro del <label>, el match exacto falla.
  expect(screen.getByLabelText(/^Etiquetas/)).toHaveValue('himno,clásica')
  expect(screen.getByLabelText('Etiqueta de la sección 2')).toHaveValue('Coro')
  expect(screen.getByLabelText('Letra de la sección 2')).toHaveValue('Letra del coro')
})

test('5. editar: guardar llama update(id, patch) con las secciones editadas', async () => {
  mockGet.mockResolvedValue({ ok: true, song: SONG })
  mockUpdate.mockResolvedValue({ ok: true, song: SONG })
  renderEditor('/songs/cloud/a1')
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Sublime Gracia'))

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Sublime Gracia (v2)' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  })

  expect(mockUpdate).toHaveBeenCalledWith('a1', {
    title: 'Sublime Gracia (v2)',
    author: 'John Newton',
    tags: 'himno,clásica',
    sections: [
      { type: 'verse', label: 'Estrofa 1', text: 'Sublime gracia del Señor' },
      { type: 'chorus', label: 'Coro', text: 'Letra del coro' },
    ],
  })
  expect(screen.getByText('songs-list-stub')).toBeInTheDocument()
})

test('6. editar: loading mientras llega la canción', () => {
  mockGet.mockReturnValue(new Promise(() => {}))  // nunca resuelve
  renderEditor('/songs/cloud/a1')
  expect(screen.getByText('Cargando canción…')).toBeInTheDocument()
  expect(screen.queryByLabelText('Título')).toBeNull()
})

test('7. editar: error de carga → mensaje + Reintentar repite el fetch', async () => {
  mockGet.mockResolvedValueOnce({ ok: false, error: 'network' })
  renderEditor('/songs/cloud/a1')
  await waitFor(() => expect(screen.getByText('No pudimos cargar la canción.')).toBeInTheDocument())

  mockGet.mockResolvedValue({ ok: true, song: SONG })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  })
  expect(mockGet).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Sublime Gracia'))
})

/* ============ Secciones ============ */

test('8. añadir sección: aparece con label autonumerado', () => {
  renderEditor('/songs/cloud/new')
  fireEvent.click(screen.getByRole('button', { name: '+ Añadir sección' }))
  expect(screen.getByLabelText('Etiqueta de la sección 2')).toHaveValue('Estrofa 2')
})

test('9. eliminar sección: desaparece de la lista', () => {
  renderEditor('/songs/cloud/new')
  fireEvent.click(screen.getByRole('button', { name: '+ Añadir sección' }))
  expect(screen.getAllByLabelText(/Etiqueta de la sección/).length).toBe(2)
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar la sección 2' }))
  expect(screen.getAllByLabelText(/Etiqueta de la sección/).length).toBe(1)
})

test('10. reordenar con ↑↓: intercambia las secciones (↑ del 1º y ↓ del último disabled)', () => {
  renderEditor('/songs/cloud/new')
  fireEvent.click(screen.getByRole('button', { name: '+ Añadir sección' }))
  fireEvent.change(screen.getByLabelText('Letra de la sección 1'), { target: { value: 'AAA' } })
  fireEvent.change(screen.getByLabelText('Letra de la sección 2'), { target: { value: 'BBB' } })

  expect(screen.getByRole('button', { name: 'Subir la sección 1' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Bajar la sección 2' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: 'Bajar la sección 1' }))
  expect(screen.getByLabelText('Letra de la sección 1')).toHaveValue('BBB')
  expect(screen.getByLabelText('Letra de la sección 2')).toHaveValue('AAA')

  fireEvent.click(screen.getByRole('button', { name: 'Subir la sección 2' }))
  expect(screen.getByLabelText('Letra de la sección 1')).toHaveValue('AAA')
})

test('11. chip "Coro": setea label y el type viaja como chorus al guardar', async () => {
  mockCreate.mockResolvedValue({ ok: true, song: { id: 'n1' } })
  renderEditor('/songs/cloud/new')
  fireEvent.click(screen.getByRole('button', { name: 'Usar etiqueta Coro en la sección 1' }))
  expect(screen.getByLabelText('Etiqueta de la sección 1')).toHaveValue('Coro')

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  fireEvent.change(screen.getByLabelText('Letra de la sección 1'), { target: { value: 'L' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  })
  expect(mockCreate.mock.calls[0][0].sections).toEqual([{ type: 'chorus', label: 'Coro', text: 'L' }])
})

test('12. label libre infiere el type (Puente → bridge) al guardar', async () => {
  mockCreate.mockResolvedValue({ ok: true, song: { id: 'n1' } })
  renderEditor('/songs/cloud/new')
  fireEvent.change(screen.getByLabelText('Etiqueta de la sección 1'), { target: { value: 'Puente 2' } })
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  })
  expect(mockCreate.mock.calls[0][0].sections[0].type).toBe('bridge')
})

/* ============ Descartar cambios ============ */

test('13. back con cambios → ConfirmModal; Descartar navega, Cancelar se queda', () => {
  renderEditor('/songs/cloud/new')
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Borrador' } })

  fireEvent.click(screen.getByRole('button', { name: 'Volver a canciones' }))
  expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Descartar los cambios?')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByLabelText('Título')).toHaveValue('Borrador')  // seguimos en el editor

  fireEvent.click(screen.getByRole('button', { name: 'Volver a canciones' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
  expect(screen.getByText('songs-list-stub')).toBeInTheDocument()
  expect(mockCreate).not.toHaveBeenCalled()
})

test('14. back sin cambios → navega directo sin confirm', () => {
  renderEditor('/songs/cloud/new')
  fireEvent.click(screen.getByRole('button', { name: 'Volver a canciones' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByText('songs-list-stub')).toBeInTheDocument()
})

/* ============ Guardado: estados ============ */

test('15. guardando: botón disabled hasta que el create resuelve', async () => {
  let resolveCreate
  mockCreate.mockReturnValue(new Promise((r) => { resolveCreate = r }))
  renderEditor('/songs/cloud/new')
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })

  fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  expect(screen.getByRole('button', { name: 'Guardar la canción en la nube' })).toBeDisabled()

  await act(async () => { resolveCreate({ ok: true, song: { id: 'n1' } }) })
  expect(screen.getByText('songs-list-stub')).toBeInTheDocument()
})

test('16. error de guardado: banner mapeado y seguimos en el editor', async () => {
  mockCreate.mockResolvedValue({ ok: false, error: 'network' })
  renderEditor('/songs/cloud/new')
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la canción en la nube' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión a internet. Comprueba la red.')
  expect(screen.queryByText('songs-list-stub')).toBeNull()
  expect(consumeFlash()).toBeNull()
})
