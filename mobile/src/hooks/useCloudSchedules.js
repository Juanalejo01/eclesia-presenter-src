/**
 * useCloudSchedules.js (C3a)
 *
 * Lista de listas del día cloud para PlannerListScreen. Mismo patrón
 * que useCloudSongs (C2) pero sin búsqueda: el volumen esperado es de
 * unas pocas listas por usuario, no hace falta buscador.
 *
 * Estados: 'loading' | 'results' | 'empty' | 'error'.
 * Latest-request-wins con un contador de secuencia — una respuesta
 * vieja jamás pisa una nueva.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as cloudSchedules from '../services/cloudSchedules.js'

export function useCloudSchedules() {
  const [status, setStatus] = useState('loading')
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)

  const mountedRef = useRef(true)
  const seqRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const runFetch = useCallback(async () => {
    const seq = ++seqRef.current
    if (mountedRef.current) {
      setStatus('loading')
      setError(null)
    }
    const res = await cloudSchedules.list()
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
    runFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refetch = useCallback(() => { runFetch() }, [runFetch])

  return { status, items, error, refetch }
}
