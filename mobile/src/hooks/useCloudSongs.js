/**
 * useCloudSongs.js (C2)
 *
 * Lista de canciones cloud para el modo "Mi nube" de SongsScreen.
 * Mucho más simple que useSongs (sin cache, sin transport): fetch on
 * demand contra services/cloudSongs.js.
 *
 * Estados: 'loading' | 'results' | 'empty' | 'error'.
 * Búsqueda con debounce 300ms (mismo valor que useSongs); el fetch
 * inicial del mount es inmediato. Latest-request-wins con un contador
 * de secuencia — una respuesta vieja jamás pisa una nueva.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as cloudSongs from '../services/cloudSongs.js'

const DEBOUNCE_MS = 300

export function useCloudSongs() {
  const [search, setSearchRaw] = useState('')
  const [status, setStatus] = useState('loading')
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)

  const mountedRef = useRef(true)
  const seqRef = useRef(0)
  const debounceRef = useRef(null)
  const searchRef = useRef('')
  const firstRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runFetch = useCallback(async (q) => {
    const seq = ++seqRef.current
    searchRef.current = q
    if (mountedRef.current) {
      setStatus('loading')
      setError(null)
    }
    const res = await cloudSongs.list({ search: q })
    if (!mountedRef.current || seq !== seqRef.current) return
    if (res.ok) {
      const next = res.items || []
      setItems(next)
      setError(null)
      setStatus(next.length === 0 ? 'empty' : 'results')
    } else {
      setError({ code: res.error || 'unknown' })
      setStatus('error')
    }
  }, [])

  // Fetch inicial inmediato.
  useEffect(() => {
    runFetch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce sobre search (saltando el primer render).
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runFetch(search.trim())
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, runFetch])

  const setSearch = useCallback((q) => setSearchRaw(typeof q === 'string' ? q : ''), [])

  const refetch = useCallback(() => {
    runFetch(searchRef.current || '')
  }, [runFetch])

  return { search, setSearch, status, items, error, refetch, debounceMs: DEBOUNCE_MS }
}
