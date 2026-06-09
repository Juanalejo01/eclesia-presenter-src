/**
 * songsCache.test.js (T10)
 *
 * Tests del modulo de cache: get/set/invalidate, LRU, TTL, sessionStorage.
 */
const songsCache = require('../src/services/songsCache.js')

beforeEach(() => {
  songsCache.__resetForTests()
})

describe('listings', () => {
  test('set + get dentro de TTL devuelve mismo valor', () => {
    songsCache.setListing('|50|0', { items: [{ id: 1 }], count: 1, hasMore: false })
    const got = songsCache.getListing('|50|0')
    expect(got?.items).toEqual([{ id: 1 }])
  })

  test('cache miss tras TTL (mock Date.now)', () => {
    songsCache.setListing('|50|0', { items: [{ id: 1 }], count: 1, hasMore: false })
    const old = Date.now
    Date.now = () => old() + 6 * 60 * 1000
    const got = songsCache.getListing('|50|0')
    Date.now = old
    expect(got).toBeNull()
  })

  test('makeListingKey estable', () => {
    expect(songsCache.makeListingKey({ q: 'a', limit: 10, offset: 0 })).toBe('a|10|0')
    expect(songsCache.makeListingKey({})).toBe('|50|0')
  })
})

describe('songs', () => {
  test('setSong + getSong roundtrip', () => {
    songsCache.setSong({ id: 1, title: 'X' })
    expect(songsCache.getSong(1)).toEqual({ id: 1, title: 'X' })
  })

  test('getSong sin set → null', () => {
    expect(songsCache.getSong(999)).toBeNull()
  })
})

describe('invalidate', () => {
  test("scope='all' purga todo", () => {
    songsCache.setSong({ id: 1, title: 'X' })
    songsCache.setListing('|50|0', { items: [], count: 0, hasMore: false })
    songsCache.invalidate('all')
    expect(songsCache.getSong(1)).toBeNull()
    expect(songsCache.getListing('|50|0')).toBeNull()
  })

  test("scope='listing' solo purga listings", () => {
    songsCache.setSong({ id: 1, title: 'X' })
    songsCache.setListing('|50|0', { items: [], count: 0, hasMore: false })
    songsCache.invalidate('listing')
    expect(songsCache.getSong(1)).toEqual({ id: 1, title: 'X' })
    expect(songsCache.getListing('|50|0')).toBeNull()
  })

  test('scope=ids purga esos ids y limpia todas las listings', () => {
    songsCache.setSong({ id: 1, title: 'X' })
    songsCache.setSong({ id: 2, title: 'Y' })
    songsCache.setListing('|50|0', { items: [], count: 0, hasMore: false })
    songsCache.invalidate([1])
    expect(songsCache.getSong(1)).toBeNull()
    expect(songsCache.getSong(2)).toEqual({ id: 2, title: 'Y' })
    expect(songsCache.getListing('|50|0')).toBeNull()
  })
})

describe('serverVersion', () => {
  test('set/get', () => {
    songsCache.setServerVersion(123)
    expect(songsCache.getServerVersion()).toBe(123)
  })
})

describe('LRU', () => {
  test('cap de listings (>30 evict LRU)', () => {
    for (let i = 0; i < 35; i++) {
      songsCache.setListing(`k${i}`, { items: [], count: 0, hasMore: false })
    }
    expect(songsCache.__sizes().listings).toBeLessThanOrEqual(30)
  })

  test('cap de songs (>500 evict LRU)', () => {
    for (let i = 1; i <= 505; i++) {
      songsCache.setSong({ id: i, title: 't' + i })
    }
    expect(songsCache.__sizes().songs).toBeLessThanOrEqual(500)
  })
})

describe('onChange', () => {
  test('callback al setSong', () => {
    const cb = jest.fn()
    songsCache.onChange(cb)
    songsCache.setSong({ id: 1, title: 'X' })
    expect(cb).toHaveBeenCalled()
  })

  test('callback al invalidate', () => {
    const cb = jest.fn()
    songsCache.onChange(cb)
    songsCache.invalidate('all')
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'invalidate' }))
  })

  test('unsubscribe limpia', () => {
    const cb = jest.fn()
    const off = songsCache.onChange(cb)
    off()
    songsCache.setSong({ id: 1, title: 'X' })
    expect(cb).not.toHaveBeenCalled()
  })
})
