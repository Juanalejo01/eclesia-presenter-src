/**
 * useCloudSong.js (C2)
 *
 * Una canción cloud por id para SongEditorScreen. Sin cache: el editor
 * quiere SIEMPRE la versión fresca de la nube (otra persona o el propio
 * desktop pudo editarla hace un minuto).
 *
 * Estados: 'idle' (id null — modo crear) | 'loading' | 'ready' | 'error'.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as cloudSongs from '../services/cloudSongs.js'

export function useCloudSong(id) {
  const [song, setSong] = useState(null)
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
    const res = await cloudSongs.get(targetId)
    if (!mountedRef.current || seq !== seqRef.current) return
    if (lastIdRef.current !== targetId) return
    if (res.ok && res.song) {
      setSong(res.song)
      setError(null)
      setStatus('ready')
    } else {
      setSong(null)
      setError({ code: res.error || 'unknown' })
      setStatus('error')
    }
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

  const retry = useCallback(() => { if (id) runFetch(id) }, [id, runFetch])

  return { song, status, error, retry }
}
