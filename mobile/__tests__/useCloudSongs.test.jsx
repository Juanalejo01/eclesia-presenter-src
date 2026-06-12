/**
 * useCloudSongs.test.jsx (C2)
 *
 * Hooks de la biblioteca cloud contra el servicio mockeado:
 *   - useCloudSongs: loading → results/empty/error, refetch, debounce 300ms
 *   - useCloudSong: idle (id null) / loading → ready / error + retry
 */
import { renderHook, act, waitFor } from '@testing-library/react'

const mockList = jest.fn()
const mockGet = jest.fn()
jest.mock('../src/services/cloudSongs.js', () => ({
  list: (...args) => mockList(...args),
  get: (...args) => mockGet(...args),
}))

import { useCloudSongs } from '../src/hooks/useCloudSongs.js'
import { useCloudSong } from '../src/hooks/useCloudSong.js'

const ITEMS = [
  { id: 'a1', title: 'Sublime Gracia', author: null, tags: null, updated_at: '2026-06-12T10:00:00Z' },
  { id: 'b2', title: 'Santo Santo', author: 'Heber', tags: null, updated_at: '2026-06-11T10:00:00Z' },
]

beforeEach(() => {
  jest.useRealTimers()
  mockList.mockReset()
  mockGet.mockReset()
})

/* ================= useCloudSongs ================= */

test('useCloudSongs: mount → loading → results con items', async () => {
  mockList.mockResolvedValue({ ok: true, items: ITEMS })
  const { result } = renderHook(() => useCloudSongs())

  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('results'))
  expect(result.current.items).toEqual(ITEMS)
  expect(mockList).toHaveBeenCalledWith({ search: '' })
})

test('useCloudSongs: lista vacía → empty', async () => {
  mockList.mockResolvedValue({ ok: true, items: [] })
  const { result } = renderHook(() => useCloudSongs())
  await waitFor(() => expect(result.current.status).toBe('empty'))
  expect(result.current.items).toEqual([])
})

test('useCloudSongs: error → status error con código; refetch recupera', async () => {
  mockList.mockResolvedValueOnce({ ok: false, error: 'network' })
  const { result } = renderHook(() => useCloudSongs())
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toEqual({ code: 'network' })

  mockList.mockResolvedValue({ ok: true, items: ITEMS })
  act(() => { result.current.refetch() })
  await waitFor(() => expect(result.current.status).toBe('results'))
  expect(result.current.items).toEqual(ITEMS)
})

test('useCloudSongs: setSearch debounced 300ms (una sola llamada con el último término)', async () => {
  mockList.mockResolvedValue({ ok: true, items: [] })
  jest.useFakeTimers()
  const { result } = renderHook(() => useCloudSongs())

  // Fetch inicial (inmediato, sin debounce).
  await act(async () => { await Promise.resolve() })
  expect(mockList).toHaveBeenCalledTimes(1)

  act(() => { result.current.setSearch('gr') })
  act(() => { result.current.setSearch('gracia') })
  expect(mockList).toHaveBeenCalledTimes(1)   // aún en debounce

  await act(async () => { jest.advanceTimersByTime(300) })
  expect(mockList).toHaveBeenCalledTimes(2)
  expect(mockList).toHaveBeenLastCalledWith({ search: 'gracia' })
})

/* ================= useCloudSong ================= */

test('useCloudSong: id null → idle sin fetch (modo crear)', () => {
  const { result } = renderHook(() => useCloudSong(null))
  expect(result.current.status).toBe('idle')
  expect(result.current.song).toBeNull()
  expect(mockGet).not.toHaveBeenCalled()
})

test('useCloudSong: carga la canción → ready', async () => {
  const song = { id: 'a1', title: 'X', sections: [{ type: 'verse', label: 'E1', text: 'y' }] }
  mockGet.mockResolvedValue({ ok: true, song })
  const { result } = renderHook(() => useCloudSong('a1'))

  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.song).toEqual(song)
  expect(mockGet).toHaveBeenCalledWith('a1')
})

test('useCloudSong: error → status error; retry vuelve a pedir', async () => {
  mockGet.mockResolvedValueOnce({ ok: false, error: 'not_found' })
  const { result } = renderHook(() => useCloudSong('zz'))
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toEqual({ code: 'not_found' })

  mockGet.mockResolvedValue({ ok: true, song: { id: 'zz', title: 'T' } })
  act(() => { result.current.retry() })
  await waitFor(() => expect(result.current.status).toBe('ready'))
})
