/**
 * Tests del hook useBibleSearch — debounce + abort + error mapping.
 */
import '@testing-library/jest-dom'
import { renderHook, act } from '@testing-library/react'

// Mock bibleRemote.search — controlamos las respuestas desde el test.
const mockSearch = jest.fn()
jest.mock('../src/services/bibleRemote.js', () => ({
  __esModule: true,
  search: (...args) => mockSearch(...args),
}))

import { useBibleSearch } from '../src/hooks/useBibleSearch.js'

beforeEach(() => {
  jest.useFakeTimers()
  mockSearch.mockReset()
})
afterEach(() => {
  jest.useRealTimers()
})

test('1. debounce 300ms: 3 setQuery rápidos → 1 sola llamada', async () => {
  mockSearch.mockResolvedValue({
    ok: true, mode: 'text', results: [{ reference: 'Sal 1:1', text: 'x' }], count: 1,
  })
  const { result } = renderHook(() => useBibleSearch())
  act(() => result.current.setQuery('Sal'))
  act(() => result.current.setQuery('Salm'))
  act(() => result.current.setQuery('Salmo'))
  expect(mockSearch).not.toHaveBeenCalled()
  await act(async () => {
    jest.advanceTimersByTime(310)
  })
  // Despachamos las microtasks pendientes del await dentro del hook.
  await act(async () => {})
  expect(mockSearch).toHaveBeenCalledTimes(1)
  expect(mockSearch.mock.calls[0][0]).toBe('Salmo')
})

test('2. status pasa idle → loading → results', async () => {
  let resolveSearch
  mockSearch.mockReturnValue(new Promise(r => { resolveSearch = r }))
  const { result } = renderHook(() => useBibleSearch())
  expect(result.current.status).toBe('idle')

  act(() => result.current.setQuery('amor'))
  await act(async () => { jest.advanceTimersByTime(310) })
  // Damos un tick para que el hook entre en setStatus('loading')
  await act(async () => {})
  expect(result.current.status).toBe('loading')

  await act(async () => {
    resolveSearch({ ok: true, mode: 'text', results: [{ reference: 'Sal 1', text: 'x' }], count: 1 })
  })
  expect(result.current.status).toBe('results')
  expect(result.current.results).toHaveLength(1)
})

test('3. results vacíos → status=empty', async () => {
  mockSearch.mockResolvedValue({ ok: true, mode: 'text', results: [], count: 0 })
  const { result } = renderHook(() => useBibleSearch())
  act(() => result.current.setQuery('xyz'))
  await act(async () => { jest.advanceTimersByTime(310) })
  await act(async () => {})
  expect(result.current.status).toBe('empty')
})

test('4. error_offline → status=error con code=offline', async () => {
  mockSearch.mockResolvedValue({ ok: false, error: 'offline' })
  const { result } = renderHook(() => useBibleSearch())
  act(() => result.current.setQuery('amor'))
  await act(async () => { jest.advanceTimersByTime(310) })
  await act(async () => {})
  expect(result.current.status).toBe('error')
  expect(result.current.error?.code).toBe('offline')
})

test('5. query vacío → vuelve a idle y limpia', async () => {
  mockSearch.mockResolvedValue({ ok: true, mode: 'text', results: [{ reference: 'Sal', text: 'x' }], count: 1 })
  const { result } = renderHook(() => useBibleSearch())
  act(() => result.current.setQuery('amor'))
  await act(async () => { jest.advanceTimersByTime(310) })
  await act(async () => {})
  expect(result.current.status).toBe('results')

  act(() => result.current.setQuery(''))
  expect(result.current.status).toBe('idle')
  expect(result.current.results).toHaveLength(0)
})

test('6. retry() vuelve a llamar con el último query', async () => {
  mockSearch.mockResolvedValueOnce({ ok: false, error: 'offline' })
  mockSearch.mockResolvedValueOnce({ ok: true, mode: 'text', results: [{ reference: 'a', text: 'b' }], count: 1 })
  const { result } = renderHook(() => useBibleSearch())
  act(() => result.current.setQuery('amor'))
  await act(async () => { jest.advanceTimersByTime(310) })
  await act(async () => {})
  expect(result.current.status).toBe('error')

  await act(async () => { result.current.retry() })
  await act(async () => {})
  expect(mockSearch).toHaveBeenCalledTimes(2)
  expect(result.current.status).toBe('results')
})

test('7. unmount limpia: no setState tras unmount', async () => {
  let resolveSearch
  mockSearch.mockReturnValue(new Promise(r => { resolveSearch = r }))
  const { result, unmount } = renderHook(() => useBibleSearch())
  act(() => result.current.setQuery('amor'))
  await act(async () => { jest.advanceTimersByTime(310) })
  await act(async () => {})
  unmount()
  // No debe crashear si la promesa resuelve después.
  await act(async () => {
    resolveSearch({ ok: true, mode: 'text', results: [], count: 0 })
  })
  // Si llegamos aquí sin throw del act, el test pasa.
})
