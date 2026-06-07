import { useEffect, useState } from 'react'
import {
  subscribe, getItems, addItem, removeItem, toggleDone, moveItem, clear,
} from '../services/scheduleService.js'
import { confirm } from '../services/dialogService.js'
import { subscribe as onShortcut } from '../hooks/useShortcuts.js'
import {
  IconPlus, IconCheck, IconX, IconBible, IconMusic, IconList,
  IconImage, IconVideo, IconType,
} from './Icons.jsx'
import { useT } from '../services/i18n.js'

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
    </div>
  )
}
