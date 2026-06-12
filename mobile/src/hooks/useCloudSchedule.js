/**
 * useCloudSchedule.js (C3a)
 *
 * Una lista del día cloud por id para PlannerEditorScreen. Sin cache:
 * el editor quiere SIEMPRE la versión fresca de la nube. Mismo patrón
 * que useCloudSong (C2).
 *
 * Estados: 'idle' (id null — modo crear) | 'loading' | 'ready' | 'error'.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as cloudSchedules from '../services/cloudSchedules.js'

export function useCloudSchedule(id) {
  const [schedule, setSchedule] = useState(null)
  const [status, setStatus] = useState(id ? 'loading' : 'idle')
  const [error, setError] = useState(null)

  const mountedRef = useRef(true)
  const seqRef = useRef(0)
  const lastIdRef = useRef(id)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const runFetch = useCallback(async (targetId) => {
    if (!targetId) return
    const seq = ++seqRef.current
    if (mountedRef.current) {
      setStatus('loading')
      setError(null)
    }
    const res = await cloudSchedules.get(targetId)
    if (!mountedRef.current || seq !== seqRef.current) return
    if (lastIdRef.current !== targetId) return
    if (res.ok && res.schedule) {
      setSchedule(res.schedule)
      setError(null)
      setStatus('ready')
    } else {
      setSchedule(null)
      setError({ code: res.error || 'unknown' })
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    lastIdRef.current = id
    if (!id) {
      setSchedule(null)
      setStatus('idle')
      setError(null)
      return
    }
    runFetch(id)
  }, [id, runFetch])

  const retry = useCallback(() => { if (id) runFetch(id) }, [id, runFetch])

  return { schedule, status, error, retry }
}
