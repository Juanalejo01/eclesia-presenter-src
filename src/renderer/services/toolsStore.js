// Store persistente para Countdown, Cronómetro y Notas del predicador.
//
// Los componentes del ToolsPanel se desmontan cada vez que cambias de panel
// (Ctrl+B, Ctrl+Q, etc), lo que reseteaba el estado de los timers. Este
// módulo mantiene el estado vivo a nivel de módulo (singleton), independiente
// del ciclo de vida React. Patrón idéntico a slideStore.js / themeStore.js.

import { useEffect, useState } from 'react'

// ============================================================
// COUNTDOWN STATE
// ============================================================
const countdown = {
  mode: 'duration',         // 'duration' | 'target'
  hours: 0,
  minutes: 15,
  seconds: 0,
  targetDate: '',
  message: 'El servicio inicia en',
  endMessage: '¡Empezamos!',
  autoProject: true,
  running: false,
  endsAt: null,             // timestamp ms cuando termina
}

const cdListeners = new Set()
let cdTimer = null  // interval id

function cdEmit() {
  for (const fn of cdListeners) try { fn({ ...countdown, now: Date.now() }) } catch {}
  // Broadcast al main process para que Stage Display lo vea
  try {
    window.electron?.projection?.setCountdown({
      running: countdown.running,
      endsAt: countdown.endsAt,
      message: countdown.message,
      endMessage: countdown.endMessage,
    })
  } catch {}
}

function startTicking() {
  if (cdTimer) return
  cdTimer = setInterval(() => cdEmit(), 250)
}
function stopTicking() {
  if (!cdTimer) return
  clearInterval(cdTimer)
  cdTimer = null
}

export function getCountdownState() {
  return { ...countdown, now: Date.now() }
}

export function subscribeCountdown(fn) {
  cdListeners.add(fn)
  fn({ ...countdown, now: Date.now() })
  return () => cdListeners.delete(fn)
}

export function setCountdownField(patch) {
  Object.assign(countdown, patch)
  cdEmit()
}

export function startCountdown() {
  let end
  if (countdown.mode === 'duration') {
    const ms = (countdown.hours * 3600 + countdown.minutes * 60 + countdown.seconds) * 1000
    if (ms <= 0) return
    end = Date.now() + ms
  } else {
    if (!countdown.targetDate) return
    end = new Date(countdown.targetDate).getTime()
    if (end <= Date.now()) return
  }
  countdown.endsAt = end
  countdown.running = true
  startTicking()
  cdEmit()
}

export function pauseCountdown() {
  countdown.running = false
  stopTicking()
  cdEmit()
}

export function resetCountdown() {
  countdown.running = false
  countdown.endsAt = null
  stopTicking()
  cdEmit()
}

/** Hook React */
export function useCountdown() {
  const [state, setState] = useState(() => ({ ...countdown, now: Date.now() }))
  useEffect(() => subscribeCountdown(setState), [])
  return state
}

// ============================================================
// STOPWATCH STATE
// ============================================================
const stopwatch = {
  running: false,
  startedAt: null,
  elapsed: 0,
  laps: [],
}

const swListeners = new Set()
let swTimer = null

function swEmit() {
  const current = stopwatch.running && stopwatch.startedAt
    ? stopwatch.elapsed + (Date.now() - stopwatch.startedAt)
    : stopwatch.elapsed
  for (const fn of swListeners) try { fn({ ...stopwatch, current }) } catch {}
}

function swStartTicking() { if (!swTimer) swTimer = setInterval(() => swEmit(), 50) }
function swStopTicking()  { if (swTimer) { clearInterval(swTimer); swTimer = null } }

export function startStopwatch() {
  if (stopwatch.running) return
  stopwatch.startedAt = Date.now()
  stopwatch.running = true
  swStartTicking()
  swEmit()
}

export function stopStopwatch() {
  if (!stopwatch.running) return
  stopwatch.elapsed = stopwatch.elapsed + (Date.now() - stopwatch.startedAt)
  stopwatch.running = false
  stopwatch.startedAt = null
  swStopTicking()
  swEmit()
}

export function resetStopwatch() {
  stopwatch.running = false
  stopwatch.startedAt = null
  stopwatch.elapsed = 0
  stopwatch.laps = []
  swStopTicking()
  swEmit()
}

export function lapStopwatch() {
  const current = stopwatch.running && stopwatch.startedAt
    ? stopwatch.elapsed + (Date.now() - stopwatch.startedAt)
    : stopwatch.elapsed
  stopwatch.laps = [{ time: current, n: stopwatch.laps.length + 1 }, ...stopwatch.laps]
  swEmit()
}

export function useStopwatch() {
  const [state, setState] = useState(() => ({ ...stopwatch, current: stopwatch.elapsed }))
  useEffect(() => {
    const off = (s) => setState(s)
    swListeners.add(off)
    swEmit()
    // Si está corriendo cuando el componente se monta de nuevo, retomar ticking
    if (stopwatch.running) swStartTicking()
    return () => swListeners.delete(off)
  }, [])
  return state
}

// ============================================================
// NOTES STATE — sincronizado con Stage Display vía IPC
// ============================================================
let notesText = ''
const notesListeners = new Set()

export function getNotes() { return notesText }

export function setNotes(text) {
  notesText = String(text || '')
  for (const fn of notesListeners) try { fn(notesText) } catch {}
  // Push al main process para que Stage Display las muestre
  try { window.electron?.projection?.setNotes(notesText) } catch {}
}

export function useNotes() {
  const [text, setText] = useState(notesText)
  useEffect(() => {
    notesListeners.add(setText)
    return () => notesListeners.delete(setText)
  }, [])
  return text
}
