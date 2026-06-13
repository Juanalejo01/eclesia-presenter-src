import { useEffect, useState } from 'react'
import {
  subscribe, getItems, addItem, removeItem, toggleDone, moveItem, clear,
} from '../services/scheduleService.js'
import { confirm, alert as dialogAlert } from '../services/dialogService.js'
import { subscribe as onShortcut } from '../hooks/useShortcuts.js'
import {
  IconPlus, IconCheck, IconX, IconBible, IconMusic, IconList,
  IconImage, IconVideo, IconType,
} from './Icons.jsx'
import { useT } from '../services/i18n.js'
import { mapPlanItems } from '../services/cloudPlanImport.js'
import { resolveBibleReference } from '../services/bibleRefResolver.js'

// Resuelve una canción local por su cloud_id vía IPC. Devuelve el shape que
// scheduleService espera (id, title, sections, author).
async function findSongByCloudIdViaIPC(cloudSongId) {
  if (!cloudSongId || !window.electron?.songs?.getByCloudId) return null
  try { return await window.electron.songs.getByCloudId(cloudSongId) }
  catch { return null }
}

// Dispara un sync de canciones y espera (con timeout corto) a que termine,
// para que las canciones recién creadas en el móvil existan localmente ANTES
// de mapear los items 'song' de la lista. Decisión: best-effort, NO bloquea la
// importación — si el sync falla/tarda, seguimos y las canciones que falten
// generarán un aviso "no está en este PC (sincroniza primero)".
async function syncSongsBestEffort(timeoutMs = 6000) {
  if (!window.electron?.cloudSync?.syncNow) return
  try {
    await Promise.race([
      window.electron.cloudSync.syncNow(),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ])
  } catch {}
}

const TYPE_KEY = {
  song: 'schedule.type.song', bible: 'schedule.type.bible', note: 'schedule.type.note',
  image: 'schedule.type.image', video: 'schedule.type.video', text: 'schedule.type.text', blank: 'schedule.type.blank',
}

function TypeIcon({ type }) {
  if (type === 'bible') return <IconBible size={16} />
  if (type === 'song')  return <IconMusic size={16} />
  if (type === 'image') return <IconImage size={16} />
  if (type === 'video') return <IconVideo size={16} />
  if (type === 'text')  return <IconType size={16} />
  return <IconList size={16} />
}

export default function SchedulePanel({ onSendSlide }) {
  const t = useT()
  const [items, setItems] = useState(getItems)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [newNote, setNewNote] = useState('')

  // --- Cargar lista de la nube (C3b) ---
  const [cloudOpen, setCloudOpen] = useState(false)

  useEffect(() => subscribe(setItems), [])

  useEffect(() => {
    if (items.length === 0) return
    const send = (idx) => {
      const item = items[idx]
      if (!item) return
      setActiveIdx(idx)
      onSendSlide({ text: item.text, reference: item.reference, type: item.type })
    }
    const next = () => send(Math.min(items.length - 1, activeIdx + 1))
    const prev = () => send(Math.max(0, activeIdx - 1))
    const offN = onShortcut('navigate:next', next)
    const offP = onShortcut('navigate:prev', prev)
    return () => { offN(); offP() }
  }, [items, activeIdx])

  const sendItem = (item, idx) => {
    setActiveIdx(idx)
    onSendSlide({ text: item.text, reference: item.reference, type: item.type })
  }

  const addNote = () => {
    if (!newNote.trim()) return
    addItem({ type: 'note', title: newNote.trim(), text: newNote.trim() })
    setNewNote('')
  }

  // Importa una lista de la nube: sincroniza canciones, resuelve cada item,
  // aplica (reemplazar/añadir) y muestra un resumen con avisos.
  const importPlan = async (schedule, mode) => {
    // 1. Asegura que las canciones del móvil existan localmente antes de mapear.
    await syncSongsBestEffort()

    // 2. Resuelve cada item bíblico (async) por adelantado para poder pasar un
    //    resolver síncrono al mapeador puro.
    const items = Array.isArray(schedule.items) ? schedule.items : []
    const bibleCache = new Map()
    for (const it of items) {
      if (it && it.type === 'bible' && it.reference && !bibleCache.has(it.reference)) {
        bibleCache.set(it.reference, await resolveBibleReference(it.reference, it.version))
      }
    }
    const songCache = new Map()
    for (const it of items) {
      if (it && it.type === 'song' && it.cloudSongId && !songCache.has(it.cloudSongId)) {
        songCache.set(it.cloudSongId, await findSongByCloudIdViaIPC(it.cloudSongId))
      }
    }

    const { scheduleItems, warnings } = mapPlanItems(items, {
      findSongByCloudId: (id) => songCache.get(id) || null,
      resolveBibleRef: (ref) => bibleCache.get(ref) || null,
    })

    // 3. Aplica al schedule local.
    if (mode === 'replace') clear()
    for (const payload of scheduleItems) addItem(payload)

    // 4. Resumen.
    const n = scheduleItems.length
    let msg = `${n} ${n === 1 ? 'elemento añadido' : 'elementos añadidos'}`
    if (warnings.length > 0) {
      const head = warnings.length === 1 ? '1 aviso' : `${warnings.length} avisos`
      msg += ` · ${head}: ${warnings.join(' · ')}`
    }
    await dialogAlert({
      title: 'Lista cargada',
      message: msg,
      variant: 'info',
    })
  }

  const onDragStart = (e, idx) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onDragOver = (e, idx) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    if (dragOverIdx !== idx) setDragOverIdx(idx)
  }
  const onDragLeave = () => setDragOverIdx(null)
  const onDrop = (e, idx) => {
    e.preventDefault()
    const from = +(e.dataTransfer.getData('text/plain') || dragIdx)
    if (Number.isFinite(from) && from !== idx) moveItem(from, idx)
    setDragIdx(null); setDragOverIdx(null)
  }
  const onDragEnd = () => { setDragIdx(null); setDragOverIdx(null) }

  return (
    <div className="workspace">
      <div className="ws-header">
        <div className="ws-title">
          <h1 className="ws-h1">{t('schedule.title')}</h1>
          <span className="ws-sub">{t('schedule.subtitle', { n: items.length })}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setCloudOpen(true)} title="Cargar una lista planificada en el móvil">
            ☁ Cargar lista
          </button>
          {items.length > 0 && (
            <button className="btn btn-ghost btn-danger" onClick={async () => {
              const ok = await confirm({
                title: 'Vaciar lista del día',
                message: t('schedule.clearConfirm'),
                confirmLabel: 'Vaciar',
                cancelLabel: 'Cancelar',
                variant: 'danger',
              })
              if (ok) clear()
            }}>
              {t('schedule.clearAll')}
            </button>
          )}
        </div>
      </div>

      <div className="ws-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="input-wrap" style={{ flex: 1 }}>
              <IconPlus size={15} className="input-icon" />
              <input value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder={t('schedule.addNote')} />
            </div>
            <button className="btn btn-primary" onClick={addNote}>
              <IconPlus size={14} /> {t('schedule.add')}
            </button>
          </div>

          {items.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, borderStyle: 'dashed' }}>
              <p className="empty-text" style={{ fontSize: 13, marginBottom: 4 }}>{t('schedule.empty')}</p>
              <p className="empty-text" style={{ fontSize: 11 }}>
                {t('schedule.emptyHint')}
              </p>
            </div>
          )}

          <div>
            {items.map((item, idx) => {
              const isActive = idx === activeIdx
              const isDragging = idx === dragIdx
              const isDropTarget = idx === dragOverIdx && dragIdx !== null && dragIdx !== idx

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, idx)}
                  onDragEnd={onDragEnd}
                  className={'list-row' + (isActive ? ' now' : '')}
                  style={{
                    opacity: isDragging ? 0.3 : (item.done ? 0.55 : 1),
                    borderTopColor: isDropTarget ? 'var(--copper-200)' : undefined,
                    borderTopWidth: isDropTarget ? 2 : 1,
                  }}>
                  <span className="drag-handle" style={{ cursor: 'grab' }}>
                    <span className="dot" /><span className="dot" />
                    <span className="dot" /><span className="dot" />
                    <span className="dot" /><span className="dot" />
                  </span>
                  <span className="seq-num">{idx + 1}</span>
                  <span className={'song-icon ' + (item.type === 'bible' ? 'bible' : '')}>
                    <TypeIcon type={item.type} />
                  </span>
                  <div className="song-info" onClick={() => sendItem(item, idx)} style={{ cursor: 'pointer' }}>
                    <div className="song-title" style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
                      {item.title}
                      <span className="song-tag">{TYPE_KEY[item.type] ? t(TYPE_KEY[item.type]) : 'Item'}</span>
                      {isActive && <span className="tally live"><span className="led" /> {t('schedule.live')}</span>}
                    </div>
                    {item.reference && (
                      <div className="song-meta"><span className="author">{item.reference}</span></div>
                    )}
                    {item.text && item.text !== item.title && (
                      <div className="song-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.text}
                      </div>
                    )}
                  </div>
                  <span className="song-actions" style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" onClick={() => toggleDone(item.id)}
                      title={item.done ? t('schedule.markPending') : t('schedule.markDone')}>
                      <IconCheck size={13} />
                    </button>
                    <button className="btn btn-ghost btn-danger" onClick={() => removeItem(item.id)} title={t('schedule.remove')}>
                      <IconX size={13} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {cloudOpen && (
        <CloudPlanModal
          onClose={() => setCloudOpen(false)}
          onImport={importPlan}
        />
      )}
    </div>
  )
}

// ── Modal: Cargar lista de la nube (C3b) ───────────────────────────────────
function CloudPlanModal({ onClose, onImport }) {
  const [state, setState] = useState('loading') // loading | list | error | not_pro | empty | importing
  const [error, setError] = useState(null)
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState(null)

  const load = async () => {
    setState('loading'); setError(null)
    if (!window.electron?.cloudSchedules?.list) {
      setState('error'); setError('Esta función requiere la app instalada.'); return
    }
    const r = await window.electron.cloudSchedules.list()
    if (!r.ok) {
      if (r.error === 'not_pro') { setState('not_pro'); return }
      setState('error')
      setError(
        r.error === 'no_license' ? 'Activa tu licencia para cargar listas.' :
        r.error === 'unauthorized' ? 'Sesión no autorizada. Revisa tu licencia.' :
        r.error === 'network' ? 'Sin conexión. Revisa tu red e inténtalo de nuevo.' :
        'No se pudieron cargar las listas. Inténtalo de nuevo.'
      )
      return
    }
    if (!r.schedules || r.schedules.length === 0) { setState('empty'); return }
    setPlans(r.schedules)
    setState('list')
  }

  useEffect(() => { load() }, [])

  const doImport = async (plan, mode) => {
    setState('importing')
    const r = await window.electron.cloudSchedules.get(plan.id)
    if (!r.ok || !r.schedule) {
      setState('error')
      setError(
        r.error === 'not_found' ? 'Esa lista ya no está disponible en la nube.' :
        r.error === 'network' ? 'Sin conexión al traer la lista.' :
        'No se pudo abrir la lista. Inténtalo de nuevo.'
      )
      return
    }
    onClose()
    await onImport(r.schedule, mode)
  }

  const fmtDate = (d) => {
    if (!d) return null
    try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return d }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(560px, 92vw)' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">☁ Cargar lista del día</div>
          <button className="btn btn-ghost" onClick={onClose} title="Cerrar"><IconX size={14} /></button>
        </div>
        <div className="modal-body">
          {state === 'loading' && (
            <p className="empty-text" style={{ textAlign: 'center', padding: 24 }}>Cargando tus listas…</p>
          )}
          {state === 'importing' && (
            <p className="empty-text" style={{ textAlign: 'center', padding: 24 }}>Importando lista…</p>
          )}
          {state === 'empty' && (
            <div className="card" style={{ textAlign: 'center', padding: 32, borderStyle: 'dashed' }}>
              <p className="empty-text" style={{ fontSize: 13 }}>No tienes listas en la nube</p>
              <p className="empty-text" style={{ fontSize: 11, marginTop: 4 }}>
                Planifica una lista desde la app móvil y aparecerá aquí.
              </p>
            </div>
          )}
          {state === 'not_pro' && (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Función Pro</p>
              <p className="empty-text" style={{ fontSize: 12 }}>
                Importar las listas que planificas en el móvil requiere el plan Pro.
              </p>
            </div>
          )}
          {state === 'error' && (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <p className="empty-text" style={{ fontSize: 12, marginBottom: 12 }}>{error}</p>
              <button className="btn btn-primary" onClick={load}>Reintentar</button>
            </div>
          )}
          {state === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plans.map(p => {
                const isSel = selected?.id === p.id
                const date = fmtDate(p.service_date)
                return (
                  <div key={p.id}
                    className={'list-row' + (isSel ? ' now' : '')}
                    style={{ cursor: 'pointer', alignItems: 'center' }}
                    onClick={() => setSelected(p)}>
                    <span className="song-icon"><IconList size={16} /></span>
                    <div className="song-info" style={{ flex: 1 }}>
                      <div className="song-title">
                        {p.title || 'Sin título'}
                        {p.is_template && <span className="song-tag">Plantilla</span>}
                      </div>
                      <div className="song-meta">
                        <span className="author">
                          {date ? date + ' · ' : ''}{p.items_count || 0} {p.items_count === 1 ? 'elemento' : 'elementos'}
                        </span>
                      </div>
                    </div>
                    {isSel && (
                      <span style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost" onClick={() => doImport(p, 'append')}
                          title="Añade los elementos al final de la lista actual">
                          Añadir al final
                        </button>
                        <button className="btn btn-primary" onClick={() => doImport(p, 'replace')}
                          title="Vacía la lista actual y carga esta">
                          Reemplazar
                        </button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
