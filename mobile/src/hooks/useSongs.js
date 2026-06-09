/**
 * useSongs.js (T10)
 *
 * Hook del catalogo de canciones. Mismo patron que useBibleSearch:
 *   - controla query con debounce 300ms
 *   - AbortController cancela requests viejas
 *   - estados: idle | loading | results | empty | empty-catalog | error
 *   - escucha SONGS_CHANGED → invalida cache + refetch silencioso
 *   - escucha songsCache.onChange → re-render externo cuando otro componente
 *     muta el cache
 *
 * Devuelve items con shape:
 *   { id, title, author, tags, sectionsCount, isFavorite, updatedAt, matchKind?, snippet? }
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as songsRemote from '../services/songsRemote.js'
import * as songsCache from '../services/songsCache.js'
import { transport, ServerEvent } from '../services/transport.js'

const DEBOUNCE_MS = 300
const DEFAULT_LIMIT = 50

export function useSongs(options = {}) {
  const limit = options.limit || DEFAULT_LIMIT

  const [query, setQueryRaw] = useState('')
  const [status, setStatus] = useState('idle')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

  const mountedRef = useRef(true)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)
  const lastQueryRef = useRef('')
  const offsetRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (abortRef.current) { try { abortRef.current.abort() } catch {} }
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runFetch = useCallback(async (q, { silent = false } = {}) => {
    if (abortRef.current) { try { abortRef.current.abort() } catch {} }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    lastQueryRef.current = q
    offsetRef.current = 0

    const cacheKey = songsCache.makeListingKey({ q, limit, offset: 0 })
    const cached = songsCache.getListing(cacheKey)
    if (cached && mountedRef.current) {
      setItems(cached.items)
      setTotal(cached.count)
      setHasMore(cached.hasMore)
      setStatus(cached.items.length === 0 ? (q ? 'empty' : 'empty-catalog') : 'results')
      setError(null)
      setLastUpdatedAt(cached.ts)
      // stale-while-revalidate: fetch en background sin spinner si el cache
      // esta dentro de TTL. NO retornamos — caemos a fetch para refresh.
      if (!silent) silent = true
    } else if (mountedRef.current && !silent) {
      setStatus('loading')
    }

    const res = await songsRemote.list({ q, limit, offset: 0, signal: ctrl.signal })

    if (lastQueryRef.current !== q) return
    if (!mountedRef.current) return
    if (res.error === 'aborted') return

    if (res.ok) {
      const next = res.items || []
      setItems(next)
      setTotal(res.count || 0)
      setHasMore(!!res.hasMore)
      setError(null)
      setStatus(next.length === 0 ? (q ? 'empty' : 'empty-catalog') : 'results')
      setLastUpdatedAt(Date.now())
      if (typeof res.serverVersion === 'number') {
        songsCache.setServerVersion(res.serverVersion)
      }
      songsCache.setListing(cacheKey, {
        items: next, count: res.count || 0, hasMore: !!res.hasMore,
      })
      return
    }

    // Error path — pero si tenemos cache hit, no romper UX: mantener items.
    if (!cached) {
      setItems([])
      setTotal(0)
      setHasMore(false)
    }
    setError({
      code: res.error || 'unknown',
      status: res.status,
      retryAfterMs: res.retryAfterMs,
    })
    setStatus('error')
  }, [limit])

  // Debounce sobre query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runFetch(query.trim())
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, runFetch])

  // Fetch inicial al mount (sin debounce).
  useEffect(() => {
    runFetch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SONGS_CHANGED → invalidacion + refetch silencioso.
  useEffect(() => {
    const off = transport.subscribe(ServerEvent.SONGS_CHANGED, (payload) => {
      if (!payload) return
      const { changeType, songIds, serverVersion } = payload
      if (typeof serverVersion === 'number') {
        songsCache.setServerVersion(serverVersion)
      }
      if (changeType === 'bulk') {
        songsCache.invalidate('all')
      } else if (changeType === 'deleted' || changeType === 'updated' || changeType === 'created') {
        songsCache.invalidate(Array.isArray(songIds) ? songIds : [])
      }
      // Refetch silencioso de la query actual.
      runFetch(lastQueryRef.current || '', { silent: true })
    })
    return off
  }, [runFetch])

  // Cache externo cambia (otro componente) → re-emite items.
  useEffect(() => {
    const off = songsCache.onChange((ev) => {
      if (!mountedRef.current) return
      if (ev?.type === 'invalidate') {
        // Refetch el mismo q.
        runFetch(lastQueryRef.current || '', { silent: true })
      }
    })
    return off
  }, [runFetch])

  const setQuery = useCallback((q) => setQueryRaw(typeof q === 'string' ? q : ''), [])

  const retry = useCallback(() => {
    runFetch(lastQueryRef.current || '')
  }, [runFetch])

  const reset = useCallback(() => {
    setQueryRaw('')
    setError(null)
    setStatus('loading')
    runFetch('')
  }, [runFetch])

  const invalidateAll = useCallback(() => {
    songsCache.invalidate('all')
    runFetch(lastQueryRef.current || '', { silent: true })
  }, [runFetch])

  return {
    query, setQuery,
    status, items, total, hasMore, error,
    retry, reset, invalidate: invalidateAll,
    lastUpdatedAt,
    debounceMs: DEBOUNCE_MS,
  }
}
