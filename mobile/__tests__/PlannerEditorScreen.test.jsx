/**
 * PlannerEditorScreen.test.jsx (C3a)
 *
 * Editor del planificador con router REAL (MemoryRouter + Routes):
 * crear, añadir canción (picker sobre cloudSongs) / versículo (con
 * validación LOCAL de referencia + versión) / nota via action sheet,
 * reordenar ↑↓, eliminar, dirty confirm, hidratación en modo edición y
 * errores de guardado.
 *
 * Solo se mockean el servicio cloudSchedules (CRUD) y el hook
 * useCloudSongs (el picker); validateSchedule/makeItemKey/normalizeReference
 * son los reales.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockGet = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
jest.mock('../src/services/cloudSchedules.js', () => {
  const actual = jest.requireActual('../src/services/cloudSchedules.js')
  return {
    ...actual,
    get: (...args) => mockGet(...args),
    create: (...args) => mockCreate(...args),
    update: (...args) => mockUpdate(...args),
    list: jest.fn(),
    remove: jest.fn(),
  }
})

// Picker de canciones: el hook de C2 mockeado con estado controlable.
let mockCloudSongsState = {
  search: '', setSearch: jest.fn(), status: 'results', items: [], error: null, refetch: jest.fn(),
}
jest.mock('../src/hooks/useCloudSongs.js', () => ({
  useCloudSongs: () => mockCloudSongsState,
}))

jest.mock('../src/services/haptics.js', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
}))

import PlannerEditorScreen, { normalizeReference, BIBLE_VERSIONS } from '../src/screens/PlannerEditorScreen.jsx'
import { consumeFlash } from '../src/services/flashMessage.js'

function renderEditor(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/plans" element={<div>plans-list-stub</div>} />
        <Route path="/plans/new" element={<PlannerEditorScreen />} />
        <Route path="/plans/:id" element={<PlannerEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

const CLOUD_SONGS = [
  { id: 'cs-1', title: 'Sublime Gracia', author: 'John Newton', updated_at: '2026-06-12T10:00:00Z' },
  { id: 'cs-2', title: 'Santo Santo Santo', author: null, updated_at: '2026-06-11T10:00:00Z' },
]

const SCHEDULE = {
  id: 'p1',
  title: 'Culto 15 junio',
  service_date: '2026-06-15',
  is_template: false,
  items: [
    { key: 'k1', type: 'song', cloudSongId: 'cs-1', title: 'Sublime Gracia' },
    { key: 'k2', type: 'bible', reference: 'Juan 3:16', version: 'nvi' },
    { key: 'k3', type: 'note', title: 'Bienvenida', text: 'Saludar' },
  ],
  created_at: '2026-06-10T10:00:00Z',
  updated_at: '2026-06-12T10:00:00Z',
}

function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'Añadir un item a la lista' }))
}

beforeEach(() => {
  jest.clearAllMocks()
  consumeFlash()
  mockCloudSongsState = {
    search: '', setSearch: jest.fn(), status: 'results', items: CLOUD_SONGS, error: null, refetch: jest.fn(),
  }
})

/* ============ Crear ============ */

test('1. /new: form vacío — título, fecha, toggle plantilla off y sin items', () => {
  renderEditor('/plans/new')
  expect(screen.getByRole('heading', { name: 'Nueva lista' })).toBeInTheDocument()
  expect(screen.getByLabelText('Título')).toHaveValue('')
  expect(screen.getByLabelText('Fecha del culto (opcional)')).toHaveValue('')
  expect(screen.getByRole('switch', { name: 'Usar como plantilla' })).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByText('Añade el primer item con "+ Añadir".')).toBeInTheDocument()
})

test('2. validación: guardar sin título muestra error inline y NO llama create', async () => {
  renderEditor('/plans/new')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })
  expect(screen.getAllByText('El título es obligatorio.').length).toBeGreaterThan(0)
  expect(mockCreate).not.toHaveBeenCalled()
})

test('3. crear con fecha + plantilla: payload correcto → create + flash + vuelve a /plans', async () => {
  mockCreate.mockResolvedValue({ ok: true, schedule: { id: 'new-1' } })
  renderEditor('/plans/new')

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Culto 15 junio' } })
  fireEvent.change(screen.getByLabelText('Fecha del culto (opcional)'), { target: { value: '2026-06-15' } })
  fireEvent.click(screen.getByRole('switch', { name: 'Usar como plantilla' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })

  expect(mockCreate).toHaveBeenCalledWith({
    title: 'Culto 15 junio',
    service_date: '2026-06-15',
    is_template: true,
    items: [],
  })
  expect(screen.getByText('plans-list-stub')).toBeInTheDocument()
  expect(consumeFlash()).toBe('Lista guardada')
})

/* ============ Añadir items via action sheet ============ */

test('4. añadir canción: sheet → Canción → picker de la nube → tap añade {type:song, cloudSongId, title}', async () => {
  mockCreate.mockResolvedValue({ ok: true, schedule: { id: 'n1' } })
  renderEditor('/plans/new')

  openSheet()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByText('De tu nube'))   // opción Canción del menú
  fireEvent.click(screen.getByRole('button', { name: 'Añadir Sublime Gracia a la lista' }))

  // El sheet se cierra y el item aparece en la lista del editor.
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Sublime Gracia')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })
  const items = mockCreate.mock.calls[0][0].items
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ type: 'song', cloudSongId: 'cs-1', title: 'Sublime Gracia' })
  expect(typeof items[0].key).toBe('string')
  expect(items[0].key.length).toBeGreaterThan(0)
})

test('5. picker: el buscador delega en setSearch del hook de C2', () => {
  renderEditor('/plans/new')
  openSheet()
  fireEvent.click(screen.getByText('De tu nube'))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gracia' } })
  expect(mockCloudSongsState.setSearch).toHaveBeenCalledWith('gracia')
})

test('6. añadir versículo: referencia normalizada + versión elegida + hint visible', async () => {
  mockCreate.mockResolvedValue({ ok: true, schedule: { id: 'n1' } })
  renderEditor('/plans/new')

  openSheet()
  fireEvent.click(screen.getByText('Solo la referencia'))   // opción Versículo
  // Hint visible: el texto se resuelve en el PC al importar (C3b).
  expect(screen.getByText('El texto se cargará en el PC al importar la lista')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'Juan 3 : 16 - 18' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Versión de la Biblia' }), { target: { value: 'nvi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir el versículo a la lista' }))

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Juan 3:16-18 · NVI')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })
  expect(mockCreate.mock.calls[0][0].items[0]).toMatchObject({
    type: 'bible', reference: 'Juan 3:16-18', version: 'nvi',
  })
})

test('7. versículo con referencia inválida: error inline y el sheet NO se cierra', () => {
  renderEditor('/plans/new')
  openSheet()
  fireEvent.click(screen.getByText('Solo la referencia'))
  fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'amor de Dios' } })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir el versículo a la lista' }))
  expect(screen.getByText('Referencia no válida. Ej: Juan 3:16')).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('8. añadir nota: título + texto → item {type:note}; sin título → error', async () => {
  mockCreate.mockResolvedValue({ ok: true, schedule: { id: 'n1' } })
  renderEditor('/plans/new')

  openSheet()
  fireEvent.click(screen.getByText('Texto libre para el operador'))   // opción Nota
  // Sin título → error y no se añade.
  fireEvent.click(screen.getByRole('button', { name: 'Añadir la nota a la lista' }))
  expect(screen.getByText('El título de la nota es obligatorio.')).toBeInTheDocument()

  fireEvent.change(screen.getByRole('dialog').querySelector('input[type="text"]'), { target: { value: 'Bienvenida' } })
  fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'Saludar a las visitas' } })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir la nota a la lista' }))

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Bienvenida')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })
  expect(mockCreate.mock.calls[0][0].items[0]).toMatchObject({
    type: 'note', title: 'Bienvenida', text: 'Saludar a las visitas',
  })
})

test('9. sheet: volver al menú de tipos y cancelar cierran sin añadir nada', () => {
  renderEditor('/plans/new')
  openSheet()
  fireEvent.click(screen.getByText('Solo la referencia'))
  fireEvent.click(screen.getByRole('button', { name: 'Volver a los tipos de item' }))
  expect(screen.getByText('De tu nube')).toBeInTheDocument()   // menú de nuevo
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Añade el primer item con "+ Añadir".')).toBeInTheDocument()
})

/* ============ Reordenar / eliminar (modo edición) ============ */

test('10. editar: hidrata título, fecha, toggle e items de la nube', async () => {
  mockGet.mockResolvedValue({ ok: true, schedule: SCHEDULE })
  renderEditor('/plans/p1')

  expect(screen.getByRole('heading', { name: 'Editar lista' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Culto 15 junio'))
  expect(mockGet).toHaveBeenCalledWith('p1')
  expect(screen.getByLabelText('Fecha del culto (opcional)')).toHaveValue('2026-06-15')
  expect(screen.getByText('Sublime Gracia')).toBeInTheDocument()
  expect(screen.getByText('Juan 3:16 · NVI')).toBeInTheDocument()
  expect(screen.getByText('Bienvenida')).toBeInTheDocument()
})

test('11. reordenar ↑↓: intercambia items (↑ del 1º y ↓ del último disabled) y viaja al update', async () => {
  mockGet.mockResolvedValue({ ok: true, schedule: SCHEDULE })
  mockUpdate.mockResolvedValue({ ok: true, schedule: SCHEDULE })
  renderEditor('/plans/p1')
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Culto 15 junio'))

  expect(screen.getByRole('button', { name: 'Subir el item 1' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Bajar el item 3' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: 'Bajar el item 1' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })
  const items = mockUpdate.mock.calls[0][1].items
  expect(items.map((it) => it.key)).toEqual(['k2', 'k1', 'k3'])
})

test('12. eliminar item: desaparece de la lista', async () => {
  mockGet.mockResolvedValue({ ok: true, schedule: SCHEDULE })
  renderEditor('/plans/p1')
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Culto 15 junio'))

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar el item 1' }))
  expect(screen.queryByText('Sublime Gracia')).toBeNull()
  expect(screen.getByText('Juan 3:16 · NVI')).toBeInTheDocument()
})

/* ============ Descartar cambios ============ */

test('13. back con cambios → ConfirmModal; Cancelar se queda, Descartar navega', () => {
  renderEditor('/plans/new')
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Borrador' } })

  fireEvent.click(screen.getByRole('button', { name: 'Volver a mis listas' }))
  expect(screen.getByRole('alertdialog')).toHaveTextContent('¿Descartar los cambios?')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByLabelText('Título')).toHaveValue('Borrador')

  fireEvent.click(screen.getByRole('button', { name: 'Volver a mis listas' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
  expect(screen.getByText('plans-list-stub')).toBeInTheDocument()
  expect(mockCreate).not.toHaveBeenCalled()
})

test('14. back sin cambios → navega directo sin confirm', () => {
  renderEditor('/plans/new')
  fireEvent.click(screen.getByRole('button', { name: 'Volver a mis listas' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByText('plans-list-stub')).toBeInTheDocument()
})

/* ============ Estados de carga / error ============ */

test('15. editar: loading mientras llega la lista; error de carga → Reintentar', async () => {
  mockGet.mockResolvedValueOnce({ ok: false, error: 'network' })
  renderEditor('/plans/p1')
  await waitFor(() => expect(screen.getByText('No pudimos cargar la lista.')).toBeInTheDocument())

  mockGet.mockResolvedValue({ ok: true, schedule: SCHEDULE })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  })
  expect(mockGet).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Culto 15 junio'))
})

test('16. error de guardado: banner mapeado y seguimos en el editor', async () => {
  mockCreate.mockResolvedValue({ ok: false, error: 'network' })
  renderEditor('/plans/new')
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'T' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la lista en la nube' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión a internet. Comprueba la red.')
  expect(screen.queryByText('plans-list-stub')).toBeNull()
  expect(consumeFlash()).toBeNull()
})

/* ============ normalizeReference / BIBLE_VERSIONS ============ */

test('17. normalizeReference: canónica desde el parser local de T9; texto libre → null', () => {
  expect(normalizeReference('Juan 3:16')).toBe('Juan 3:16')
  expect(normalizeReference('juan 3 16')).toBe('juan 3:16')
  expect(normalizeReference('Salmos 23')).toBe('Salmos 23')
  expect(normalizeReference('1 Corintios 13:4-7')).toBe('1 Corintios 13:4-7')
  expect(normalizeReference('amor de Dios')).toBeNull()
  expect(normalizeReference('')).toBeNull()
  expect(normalizeReference('   ')).toBeNull()
})

test('18. BIBLE_VERSIONS: subconjunto válido con rvr1960 como default (primera opción)', () => {
  expect(BIBLE_VERSIONS[0]).toBe('rvr1960')
  expect(BIBLE_VERSIONS).toEqual(
    expect.arrayContaining(['rvr1960', 'nvi', 'nbv', 'dhh', 'lbla', 'ntv', 'pdt', 'rv2020']),
  )
})
