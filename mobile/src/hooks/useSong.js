/**
 * useSong.js (T10)
 *
 * Hook por-id que devuelve detalle de cancion con sus secciones.
 * Cache hit instantaneo via songsCache; abort en unmount; re-fetch
 * cuando songsCache emite invalidate(id).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as songsRemote from '../services/songsRemote.js'
import * as songsCache from '../services/songsCache.js'

export function useSong(id) {
  const [song, setSong] = useState(() => (id ? songsCache.getSong(id) : null))
  const [status, setStatus] = useState(() => (id ? (songsCache.getSong(id) ? 'ready' : 'loading') : 'idle'))
  const [error, setError] = useState(null)

  const mountedRef = useRef(true)
  const abortRef = useRef(null)
  const lastIdRef = useRef(id)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (abortRef.current) { try { abortRef.current.abort() } catch {} }
    }
  }, [])

  const runFetch = useCallback(async (targetId) => {
    if (!targetId) return
    if (abortRef.current) { try { abortRef.current.abort() } catch {} }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const cached = songsCache.getSong(targetId)
    if (cached && mountedRef.current) {
      setSong(cached)
      setStatus('ready')
      setError(null)
      // stale-while-revalidate
    } else if (mountedRef.current) {
      setStatus('loading')
    }
    const res = await songsRemote.get(targetId, { signal: ctrl.signal })
    if (lastIdRef.current !== targetId) return
    if (!mountedRef.current) return
    if (res.error === 'aborted') return
    if (res.ok && res.song) {
      songsCache.setSong(res.song)
      setSong(res.song)
      setStatus('ready')
      setError(null)
      return
    }
    if (cached) {
      // No rompemos UX si el refetch fallo: mantener el cache.
      setError({ code: res.error || 'unknown', status: res.status })
      return
    }
    setSong(null)
    setError({ code: res.error || 'unknown', status: res.status })
    setStatus('error')
  }, [])

  useEffect(() => {
    lastIdRef.current = id
    if (!id) {
      setSong(null)
      setStatus('idle')
      setError(null)
      return
    }
    runFetch(id)
  }, [id, runFetch])

  // Subscribe a cambios del cache.
  useEffect(() => {
    const off = songsCache.onChange((ev) => {
      if (!mountedRef.current) return
      if (!id) return
      if (ev?.type === 'invalidate') {
        // Cualquier invalidate que afecte a este id → refetch.
        runFetch(id)
      } else if (ev?.type === 'song-set' && ev.id === id) {
        const next = songsCache.getSong(id)
        if (next) setSong(next)
      }
    })
    return off
  }, [id, runFetch])

  const retry = useCallback(() => { if (id) runFetch(id) }, [id, runFetch])

  return { song, status, error, retry }
}
