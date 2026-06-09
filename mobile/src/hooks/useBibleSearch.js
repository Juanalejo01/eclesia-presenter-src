/**
 * useBibleSearch.js
 *
 * Hook que encapsula la lógica de búsqueda bíblica en el mobile:
 *   - controla el state del input (query)
 *   - debounce 300ms antes de pegar al server
 *   - AbortController para cancelar requests en vuelo cuando el query cambia
 *   - máquina de estados: idle | loading | results | empty | error
 *   - retry() para reintentar la última búsqueda fallida
 *
 * Por qué un hook custom y no useQuery / SWR: el bundle del mobile es
 * sensible al tamaño (T8 ya está cerca de los presupuestos del APK). El
 * patrón fetch + debounce + abort lo escribimos en ~80 líneas sin deps
 * y queda específico de este caso de uso.
 *
 * Edge cases:
 *   - Si el query baja a vacío, status vuelve a 'idle'.
 *   - Si llega un AUTH_ERROR (401), emitimos en `error` con code='auth'
 *     y dejamos que el caller maneje la nav (no nos atamos a router aquí).
 *   - mountedRef evita setState después de unmount (StrictMode + slow LAN).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as bibleRemote from '../services/bibleRemote.js'

const DEBOUNCE_MS = 300
const MIN_QUERY_LEN = 3  // ref directas pueden ser más cortas; el server las acepta vía parseReference

export function useBibleSearch(options = {}) {
  const version = options.version || 'rvr1960'
  const limit = options.limit || 20

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('idle')  // idle|loading|results|empty|error
  const [results, setResults] = useState([])
  const [mode, setMode] = useState(null)         // 'ref' | 'text'
  const [error, setError] = useState(null)       // { code, message?, retryAfterMs? }

  const mountedRef = useRef(true)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)
  const lastQueryRef = useRef('')

  // Limpieza al unmount: aborta y limpia timers.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (abortRef.current) { try { abortRef.current.abort() } catch {} }
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runSearch = useCallback(async (q) => {
    // Aborta cualquier fetch anterior.
    if (abortRef.current) { try { abortRef.current.abort() } catch {} }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    lastQueryRef.current = q

    if (mountedRef.current) setStatus('loading')

    const res = await bibleRemote.search(q, { version, limit, signal: ctrl.signal })

    // Si llegamos aquí pero el query mutó mientras estábamos en vuelo,
    // ignoramos el resultado. lastQueryRef guarda el último query enviado.
    if (lastQueryRef.current !== q) return
    if (!mountedRef.current) return
    if (res.error === 'aborted') return  // un nuevo query lo canceló

    if (res.ok) {
      setMode(res.mode || 'text')
      setResults(res.results || [])
      setError(null)
      setStatus((res.results || []).length === 0 ? 'empty' : 'results')
      return
    }

    // Error
    setResults([])
    setMode(null)
    setError({
      code: res.error || 'unknown',
      status: res.status,
      retryAfterMs: res.retryAfterMs,
      parsed: res.parsed,
    })
    setStatus('error')
  }, [version, limit])

  // Debounce sobre el query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Query vacío → idle.
    if (!query || query.trim().length === 0) {
      // Aborta requests en vuelo y limpia results.
      if (abortRef.current) { try { abortRef.current.abort() } catch {} }
      lastQueryRef.current = ''
      setStatus('idle')
      setResults([])
      setError(null)
      setMode(null)
      return
    }

    debounceRef.current = setTimeout(() => {
      runSearch(query.trim())
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  const retry = useCallback(() => {
    if (lastQueryRef.current) runSearch(lastQueryRef.current)
  }, [runSearch])

  const reset = useCallback(() => {
    setQuery('')
    setResults([])
    setError(null)
    setMode(null)
    setStatus('idle')
    if (abortRef.current) { try { abortRef.current.abort() } catch {} }
  }, [])

  return {
    query, setQuery,
    status, results, mode, error,
    retry, reset,
    debounceMs: DEBOUNCE_MS,
    minQueryLen: MIN_QUERY_LEN,
  }
}
