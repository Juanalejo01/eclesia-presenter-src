/**
 * useSongs.test.jsx (T10)
 *
 * Tests del hook useSongs: estados, debounce, error mapping, SONGS_CHANGED.
 */
import '@testing-library/jest-dom'
import { renderHook, act, waitFor } from '@testing-library/react'

// ─── Mock songsRemote ──
const mockList = jest.fn()
jest.mock('../src/services/songsRemote.js', () => ({
  __esModule: true,
  list: (...args) => mockList(...args),
  get: jest.fn(),
}))

// ─── Mock transport ──
const mockTransportSubs = {}
jest.mock('../src/services/transport.js', () => ({
  __esModule: true,
  transport: {
    subscribe: (evt, h) => {
      if (!mockTransportSubs[evt]) mockTransportSubs[evt] = new Set()
      mockTransportSubs[evt].add(h)
      return jest.fn(() => mockTransportSubs[evt]?.delete(h))
    },
  },
  ServerEvent: {
    SONGS_CHANGED: 'songs-changed',
    SONGS_LIST: 'songs-list',
  },
}))

import { useSongs } from '../src/hooks/useSongs.js'
import * as songsCache from '../src/services/songsCache.js'

beforeEach(() => {
  mockList.mockReset()
  for (const k of Object.keys(mockTransportSubs)) delete mockTransportSubs[k]
  songsCache.__resetForTests()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

test('estado inicial: loading + fetch al mount', async () => {
  mockList.mockResolvedValue({ ok: true, items: [{ id: 1, title: 'A' }], count: 1, hasMore: false, serverVersion: 1 })
  const { result } = renderHook(() => useSongs())
  await act(async () => {
    jest.runAllTimers()
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.status).toBe('results'))
  expect(result.current.items).toHaveLength(1)
})

test('empty-catalog cuando catalogo vacio sin query', async () => {
  mockList.mockResolvedValue({ ok: true, items: [], count: 0, hasMore: false })
  const { result } = renderHook(() => useSongs())
  await act(async () => {
    jest.runAllTimers()
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.status).toBe('empty-catalog'))
})

test('empty cuando con query no hay matches', async () => {
  mockList.mockResolvedValue({ ok: true, items: [], count: 0, hasMore: false })
  const { result } = renderHook(() => useSongs())
  await act(async () => { jest.runAllTimers(); await Promise.resolve() })
  await act(async () => { result.current.setQuery('zzz') })
  await act(async () => {
    jest.advanceTimersByTime(400)
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.status).toBe('empty'))
})

test('error 401 → error con code auth_error', async () => {
  mockList.mockResolvedValue({ ok: false, error: 'auth_error', status: 401 })
  const { result } = renderHook(() => useSongs())
  await act(async () => {
    jest.runAllTimers()
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error.code).toBe('auth_error')
})

test('SONGS_CHANGED bulk invalida cache y refetch', async () => {
  mockList.mockResolvedValue({ ok: true, items: [{ id: 1, title: 'A' }], count: 1, hasMore: false })
  const { result } = renderHook(() => useSongs())
  await act(async () => {
    jest.runAllTimers()
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.status).toBe('results'))
  mockList.mockClear()
  mockList.mockResolvedValue({ ok: true, items: [], count: 0, hasMore: false })

  await act(async () => {
    const set = mockTransportSubs['songs-changed']
    set && set.forEach(h => h({ changeType: 'bulk', songIds: [], serverVersion: 999 }))
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(mockList).toHaveBeenCalled()
  expect(songsCache.getServerVersion()).toBe(999)
})

test('cache hit instantaneo evita fetch dentro de TTL', async () => {
  // Pre-popular el cache
  songsCache.setListing('|50|0', { items: [{ id: 10, title: 'Cached' }], count: 1, hasMore: false })
  mockList.mockResolvedValue({ ok: true, items: [{ id: 10, title: 'Cached' }], count: 1, hasMore: false })
  const { result } = renderHook(() => useSongs())
  // Sin esperar al fetch, ya deberiamos tener el item del cache.
  await act(async () => { await Promise.resolve() })
  expect(result.current.items[0].id).toBe(10)
})
