/**
 * PlannerEditorScreen (C3a) — rutas /plans/new y /plans/:id.
 *
 * Editor de una lista del día cloud: título (requerido), fecha del
 * culto (input type=date, opcional), toggle "plantilla" y la lista de
 * items con reordenar ↑↓ / eliminar (mismo patrón por botones que el
 * SongEditorScreen de C2 — drag&drop táctil descartado a propósito).
 *
 * "+ Añadir" abre un action sheet (bottom sheet estilo BiblePreviewSheet)
 * con 3 tipos de item:
 *   · Canción  → picker con buscador sobre cloudSongs.list (reutiliza el
 *                servicio y el hook de C2); tap añade
 *                { key, type:'song', cloudSongId, title } (title
 *                denormalizado: la lista se muestra sin join).
 *   · Versículo → input de referencia validado LOCALMENTE via
 *                bibleReference.js (T9 — sin red) + selector de versión.
 *                Solo viaja la REFERENCIA normalizada: el desktop
 *                resuelve el texto contra sus JSON al importar (C3b).
 *   · Nota     → título + texto libres.
 *
 * Guardar: valida (validateSchedule, la misma función del servicio) →
 * create/update → setFlash(toast éxito) → vuelve a /plans. Descartar
 * con cambios sin guardar pasa por ConfirmModal (strings de descarte
 * reutilizados de songEditor.* — son genéricos).
 *
 * LIMITACIÓN heredada de C2 (back de Android): <Routes> declarativo sin
 * useBlocker — el botón físico back sale del editor SIN confirm. El
 * botón ← de la UI sí confirma.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton.jsx'
import FormField from '../components/FormField.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import SongsSearchBar from '../components/SongsSearchBar.jsx'
import { useCloudSchedule } from '../hooks/useCloudSchedule.js'
import { useCloudSongs } from '../hooks/useCloudSongs.js'
import * as cloudSchedules from '../services/cloudSchedules.js'
import { parseReference } from '../services/bibleReference.js'
import { setFlash } from '../services/flashMessage.js'
import { tapLight, tapMedium } from '../services/haptics.js'
import { useT } from '../hooks/useT.js'

// Versiones ofrecidas en el selector — subconjunto de VERSION_IDS del
// server (src/server/bibleSearch.js). rvr1960 es el default del server.
export const BIBLE_VERSIONS = ['rvr1960', 'nvi', 'nbv', 'dhh', 'lbla', 'ntv', 'pdt', 'rv2020']
const DEFAULT_VERSION = 'rvr1960'

const KNOWN_SAVE_ERRORS = new Set(['network', 'unauthorized', 'not_found', 'validation', 'unknown'])

/**
 * Reconstruye la referencia canónica ("Juan 3:16-18") desde el parser
 * local de T9, o null si la query no parece una referencia (mismo
 * criterio que looksLikeReference: libro + capítulo o versículo).
 */
export function normalizeReference(raw) {
  const p = parseReference(raw)
  if (!p.bookText || (p.chapter == null && p.verse == null)) return null
  let ref = p.bookText
  if (p.chapter != null) ref += ` ${p.chapter}`
  if (p.verse != null) ref += (p.chapter != null ? `:${p.verse}` : ` ${p.verse}`)
  if (p.verseEnd != null) ref += `-${p.verseEnd}`
  return ref.slice(0, cloudSchedules.LIMITS.BIBLE_REF_MAX)
}

function serializeForm({ title, serviceDate, isTemplate, items }) {
  return JSON.stringify({ title, serviceDate, isTemplate, items })
}

// Texto secundario de un item según su type (la línea principal es el
// título / la referencia).
function itemSummary(item) {
  switch (item.type) {
    case 'song': return item.title
    case 'bible': return `${item.reference} · ${String(item.version || '').toUpperCase()}`
    case 'note':
    default: return item.title
  }
}

export default function PlannerEditorScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const { id } = useParams()
  const isNew = !id
  const { schedule, status: loadStatus, error: loadError, retry } = useCloudSchedule(isNew ? null : id)

  const [title, setTitle] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [isTemplate, setIsTemplate] = useState(false)
  const [items, setItems] = useState([])
  const [titleError, setTitleError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  // null (cerrado) | 'menu' | 'song' | 'bible' | 'note'
  const [sheetMode, setSheetMode] = useState(null)

  // Snapshot del estado "limpio" para detectar cambios sin guardar.
  const initialRef = useRef(isNew
    ? serializeForm({ title: '', serviceDate: '', isTemplate: false, items: [] })
    : null)
  const hydratedRef = useRef(false)

  // Modo edición: hidratar el form UNA vez cuando llega la lista.
  useEffect(() => {
    if (isNew || !schedule || hydratedRef.current) return
    hydratedRef.current = true
    const nextTitle = schedule.title || ''
    const nextDate = typeof schedule.service_date === 'string' ? schedule.service_date : ''
    const nextTemplate = !!schedule.is_template
    const nextItems = (Array.isArray(schedule.items) ? schedule.items : []).map((it) => ({
      ...it,
      key: typeof it?.key === 'string' && it.key ? it.key : cloudSchedules.makeItemKey(),
    }))
    setTitle(nextTitle)
    setServiceDate(nextDate)
    setIsTemplate(nextTemplate)
    setItems(nextItems)
    initialRef.current = serializeForm({
      title: nextTitle, serviceDate: nextDate, isTemplate: nextTemplate, items: nextItems,
    })
  }, [isNew, schedule])

  const isDirty = initialRef.current != null
    && serializeForm({ title, serviceDate, isTemplate, items }) !== initialRef.current

  function handleBack() {
    if (isDirty) {
      setDiscardOpen(true)
      return
    }
    nav('/plans')
  }

  function addItem(item) {
    tapLight()
    setItems((prev) => [...prev, { key: cloudSchedules.makeItemKey(), ...item }])
    setSheetMode(null)
  }

  function handleRemoveItem(key) {
    tapLight()
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  function handleMove(key, delta) {
    tapLight()
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.key === key)
      const target = idx + delta
      if (idx < 0 || target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      const [moved] = next.splice(idx, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  async function handleSave() {
    if (saving) return
    const payload = {
      title,
      service_date: serviceDate || null,
      is_template: isTemplate,
      items,
    }
    const issue = cloudSchedules.validateSchedule(payload)
    if (issue) {
      applyValidationIssue(issue)
      return
    }
    setTitleError(null)
    setSaveError(null)
    setSaving(true)
    tapMedium()
    const res = isNew
      ? await cloudSchedules.create(payload)
      : await cloudSchedules.update(id, payload)
    setSaving(false)
    if (res.ok) {
      setFlash(t('plannerEditor.saved'))
      nav('/plans')
      return
    }
    if (res.error === 'validation') {
      applyValidationIssue(res)
      return
    }
    setSaveError(KNOWN_SAVE_ERRORS.has(res.error) ? res.error : 'unknown')
  }

  function applyValidationIssue(issue) {
    if (issue.field === 'title') {
      setTitleError(t(issue.reason === 'too_long' ? 'plannerEditor.err.title_too_long' : 'plannerEditor.err.title_required'))
      setSaveError(null)
      return
    }
    setTitleError(null)
    if (issue.field === 'items') {
      setSaveError(issue.reason === 'too_many' ? 'items_too_many' : 'items_invalid')
    } else {
      setSaveError('validation')
    }
  }

  const saveErrorText = saveError
    ? (saveError === 'items_too_many'
      ? t('plannerEditor.err.items_too_many')
      : saveError === 'items_invalid'
        ? t('plannerEditor.err.items_invalid')
        : t(`planner.err.${saveError}`))
    : null

  const showForm = isNew || loadStatus === 'ready' || hydratedRef.current
  const canAddMore = items.length < cloudSchedules.LIMITS.ITEMS_MAX

  return (
    <div
      className="px-4 pb-24 space-y-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t('plannerEditor.backAria')}
          className="min-w-[44px] min-h-[44px] -ml-2 grid place-items-center rounded-lg
                     text-ink-2 hover:bg-bg-2 transition-colors text-xl"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">
            {t(isNew ? 'plannerEditor.titleNew' : 'plannerEditor.titleEdit')}
          </h1>
          <p className="text-sm text-ink-3 mt-0.5">{t('plannerEditor.subtitle')}</p>
        </div>
      </header>

      {/* Live region para errores de guardado (patrón C2). */}
      <p role="status" aria-live="polite" className="sr-only">
        {saveErrorText || titleError || ''}
      </p>

      {!isNew && loadStatus === 'loading' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center text-sm text-ink-3">
          {t('plannerEditor.loading')}
        </div>
      )}

      {!isNew && loadStatus === 'error' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-3" role="alert">
          <p className="text-sm text-ink-2">
            {loadError?.code === 'not_found'
              ? t('planner.err.not_found')
              : t('plannerEditor.loadError')}
          </p>
          <button
            type="button"
            onClick={retry}
            className="h-10 px-4 rounded-lg bg-bg-3 text-ink-1 text-sm font-medium hover:bg-bg-2 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {showForm && (
        <>
          <FormField
            label={t('plannerEditor.fieldTitle')}
            type="text"
            autoCapitalize="sentences"
            maxLength={cloudSchedules.LIMITS.TITLE_MAX}
            placeholder={t('plannerEditor.fieldTitlePlaceholder')}
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null) }}
            error={titleError}
          />
          <FormField
            label={t('plannerEditor.fieldDate')}
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />

          {/* Toggle plantilla */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-bg-2 border border-line-1 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-ink-1">{t('plannerEditor.template')}</p>
              <p className="text-xs text-ink-3 mt-0.5">{t('plannerEditor.templateHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isTemplate}
              aria-label={t('plannerEditor.template')}
              onClick={() => { tapLight(); setIsTemplate((v) => !v) }}
              className={
                'shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors '
                + (isTemplate ? 'bg-copper-300/60' : 'bg-bg-3 border border-line-1')
              }
            >
              <span
                aria-hidden="true"
                className={
                  'block h-6 w-6 rounded-full bg-ink-1 transition-transform '
                  + (isTemplate ? 'translate-x-5' : '')
                }
              />
            </button>
          </div>

          <section aria-label={t('plannerEditor.itemsTitle')} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium text-ink-2">{t('plannerEditor.itemsTitle')}</h2>
              <p className="text-xs text-ink-4 mt-0.5">{t('plannerEditor.itemsHint')}</p>
            </div>

            {items.length === 0 && (
              <p className="rounded-xl border border-dashed border-line-2 p-4 text-center text-xs text-ink-3">
                {t('plannerEditor.itemsEmpty')}
              </p>
            )}

            {items.map((item, idx) => {
              const n = idx + 1
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-1.5 rounded-xl bg-bg-2 border border-line-1 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-copper-200">
                      {t(`plannerEditor.type.${item.type}`)}
                    </p>
                    <p className="text-sm text-ink-1 truncate mt-0.5">{itemSummary(item)}</p>
                    {item.type === 'note' && item.text && (
                      <p className="text-xs text-ink-3 truncate mt-0.5">{item.text}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMove(item.key, -1)}
                    disabled={idx === 0}
                    aria-label={t('plannerEditor.moveUpAria', { n })}
                    className="min-w-[40px] min-h-[40px] grid place-items-center rounded-lg
                               bg-bg-3 text-ink-2 disabled:opacity-30 hover:bg-bg-1 transition-colors"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(item.key, 1)}
                    disabled={idx === items.length - 1}
                    aria-label={t('plannerEditor.moveDownAria', { n })}
                    className="min-w-[40px] min-h-[40px] grid place-items-center rounded-lg
                               bg-bg-3 text-ink-2 disabled:opacity-30 hover:bg-bg-1 transition-colors"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.key)}
                    aria-label={t('plannerEditor.removeAria', { n })}
                    className="min-w-[40px] min-h-[40px] grid place-items-center rounded-lg
                               bg-bg-3 text-ink-3 hover:text-live hover:bg-live/10 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => { tapLight(); setSheetMode('menu') }}
              disabled={!canAddMore}
              aria-label={t('plannerEditor.addAria')}
              className="w-full min-h-[48px] rounded-xl border border-dashed border-line-2
                         text-sm text-ink-2 hover:text-copper-100 hover:border-copper-200/60
                         disabled:opacity-40 transition-colors"
            >
              {t('plannerEditor.add')}
            </button>
          </section>

          {saveErrorText && (
            <div role="alert" className="rounded-lg bg-live/10 border border-live/40 p-3 text-sm text-ink-1">
              {saveErrorText}
            </div>
          )}

          <BigButton
            onClick={handleSave}
            loading={saving}
            aria-label={t('plannerEditor.saveAria')}
          >
            {t('plannerEditor.save')}
          </BigButton>
        </>
      )}

      <ConfirmModal
        open={discardOpen}
        variant="danger"
        title={t('songEditor.discardTitle')}
        message={t('songEditor.discardBody')}
        confirmLabel={t('songEditor.discardCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setDiscardOpen(false); nav('/plans') }}
        onCancel={() => setDiscardOpen(false)}
      />

      <AddItemSheet
        mode={sheetMode}
        onClose={() => setSheetMode(null)}
        onPickType={(type) => { tapLight(); setSheetMode(type) }}
        onAdd={addItem}
      />
    </div>
  )
}

/* ============================================================== */
/* Action sheet "+ Añadir" (bottom sheet estilo BiblePreviewSheet)  */
/* ============================================================== */

function AddItemSheet({ mode, onClose, onPickType, onAdd }) {
  const { t } = useT()
  const open = !!mode

  // Esc cierra (mismo patrón que BiblePreviewSheet).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const titleId = 'planner-add-sheet-title'

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-bg-1 border-t-2 border-copper-200/30 rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="pt-2 pb-1 grid place-items-center" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-ink-3/40" />
        </div>

        <div className="px-5 pt-2 pb-4 overflow-y-auto flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {mode !== 'menu' && (
              <button
                type="button"
                onClick={() => onPickType('menu')}
                aria-label={t('plannerSheet.backAria')}
                className="min-w-[40px] min-h-[40px] -ml-2 grid place-items-center rounded-lg
                           text-ink-2 hover:bg-bg-2 transition-colors text-lg"
              >
                ←
              </button>
            )}
            <p id={titleId} className="font-mono text-xs uppercase tracking-[0.16em] text-copper-200">
              {t('plannerSheet.title')}
            </p>
          </div>

          {mode === 'menu' && (
            <div role="group" aria-label={t('plannerSheet.menuAria')} className="flex flex-col gap-2">
              {[
                { id: 'song', label: t('plannerSheet.optionSong'), hint: t('plannerSheet.optionSongHint') },
                { id: 'bible', label: t('plannerSheet.optionBible'), hint: t('plannerSheet.optionBibleHint') },
                { id: 'note', label: t('plannerSheet.optionNote'), hint: t('plannerSheet.optionNoteHint') },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onPickType(opt.id)}
                  className="w-full text-left rounded-xl bg-bg-2 border border-line-1 px-4 py-3
                             hover:bg-bg-3 hover:border-copper-200/40 active:scale-[0.99] transition"
                >
                  <span className="block text-base text-ink-1">{opt.label}</span>
                  <span className="block text-xs text-ink-3 mt-0.5">{opt.hint}</span>
                </button>
              ))}
            </div>
          )}

          {mode === 'song' && <SongPickerPane onAdd={onAdd} />}
          {mode === 'bible' && <BibleItemForm onAdd={onAdd} />}
          {mode === 'note' && <NoteItemForm onAdd={onAdd} />}

          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-bg-3 text-ink-2 font-medium hover:bg-bg-2 transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Picker de canciones de la nube — reutiliza useCloudSongs/cloudSongs
// de C2 (buscador con debounce, estados loading/results/empty/error).
function SongPickerPane({ onAdd }) {
  const { t } = useT()
  const { search, setSearch, status, items, error, refetch } = useCloudSongs()

  return (
    <div className="flex flex-col gap-3">
      <SongsSearchBar
        value={search}
        onChange={setSearch}
        onClear={() => setSearch('')}
        loading={status === 'loading'}
        placeholder={t('cloudSongs.searchPlaceholder')}
      />

      {status === 'results' && (
        <ul className="flex flex-col gap-2" aria-label={t('plannerSheet.optionSong')}>
          {items.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => onAdd({ type: 'song', cloudSongId: song.id, title: song.title })}
                aria-label={t('plannerSheet.songPickAria', { title: song.title })}
                className="w-full text-left rounded-xl bg-bg-2 border border-line-1 px-4 py-3
                           hover:bg-bg-3 active:scale-[0.99] transition"
              >
                <span className="block text-base text-ink-1 truncate">{song.title}</span>
                {song.author && (
                  <span className="block text-xs text-ink-3 truncate mt-0.5">{song.author}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'empty' && (
        <p className="rounded-xl bg-bg-2 border border-line-1 p-4 text-center text-sm text-ink-2">
          {search.trim() ? t('cloudSongs.emptySearch') : t('cloudSongs.empty')}
        </p>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-4 text-center space-y-2" role="alert">
          <p className="text-sm text-ink-2">{t(`cloudSongs.err.${error?.code || 'unknown'}`)}</p>
          <button
            type="button"
            onClick={refetch}
            className="h-10 px-4 rounded-lg bg-bg-3 text-ink-1 text-sm font-medium hover:bg-bg-2 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
    </div>
  )
}

// Form de versículo: validación LOCAL de la referencia (bibleReference,
// T9) + selector de versión. Solo viaja la referencia — hint visible.
function BibleItemForm({ onAdd }) {
  const { t } = useT()
  const [reference, setReference] = useState('')
  const [version, setVersion] = useState(DEFAULT_VERSION)
  const [refError, setRefError] = useState(null)

  function handleAdd() {
    const normalized = normalizeReference(reference)
    if (!normalized) {
      setRefError(t('plannerSheet.refInvalid'))
      return
    }
    onAdd({ type: 'bible', reference: normalized, version })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label={t('plannerSheet.refLabel')}
        type="text"
        autoCapitalize="sentences"
        maxLength={cloudSchedules.LIMITS.BIBLE_REF_MAX}
        placeholder={t('plannerSheet.refPlaceholder')}
        value={reference}
        onChange={(e) => { setReference(e.target.value); if (refError) setRefError(null) }}
        error={refError}
      />

      <label className="block">
        <span className="block text-sm text-ink-2 mb-1.5 font-medium">{t('plannerSheet.versionLabel')}</span>
        <select
          aria-label={t('plannerSheet.versionAria')}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="w-full h-12 px-4 rounded-lg bg-bg-2 border border-line-1 text-ink-1
                     focus:outline-none focus:border-copper-200 transition-colors"
        >
          {BIBLE_VERSIONS.map((v) => (
            <option key={v} value={v}>{v.toUpperCase()}</option>
          ))}
        </select>
      </label>

      {/* Hint visible: el item bible viaja SIN texto — C3b lo resuelve. */}
      <p className="text-xs text-ink-3">{t('plannerSheet.refHint')}</p>

      <BigButton onClick={handleAdd} aria-label={t('plannerSheet.addBibleAria')}>
        {t('plannerSheet.addBible')}
      </BigButton>
    </div>
  )
}

// Form de nota: título (requerido) + texto libre.
function NoteItemForm({ onAdd }) {
  const { t } = useT()
  const [noteTitle, setNoteTitle] = useState('')
  const [noteText, setNoteText] = useState('')
  const [titleError, setTitleError] = useState(null)

  function handleAdd() {
    const trimmed = noteTitle.trim()
    if (!trimmed) {
      setTitleError(t('plannerSheet.noteTitleRequired'))
      return
    }
    onAdd({ type: 'note', title: trimmed, text: noteText })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label={t('plannerSheet.noteTitleLabel')}
        type="text"
        autoCapitalize="sentences"
        maxLength={cloudSchedules.LIMITS.NOTE_TITLE_MAX}
        placeholder={t('plannerSheet.noteTitlePlaceholder')}
        value={noteTitle}
        onChange={(e) => { setNoteTitle(e.target.value); if (titleError) setTitleError(null) }}
        error={titleError}
      />

      <label className="block">
        <span className="block text-sm text-ink-2 mb-1.5 font-medium">{t('plannerSheet.noteTextLabel')}</span>
        <textarea
          aria-label={t('plannerSheet.noteTextLabel')}
          placeholder={t('plannerSheet.noteTextPlaceholder')}
          maxLength={cloudSchedules.LIMITS.NOTE_TEXT_MAX}
          rows={4}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1
                     text-sm text-ink-1 placeholder:text-ink-3 leading-relaxed resize-y
                     focus:outline-none focus:border-copper-200 transition-colors"
        />
      </label>

      <BigButton onClick={handleAdd} aria-label={t('plannerSheet.addNoteAria')}>
        {t('plannerSheet.addNote')}
      </BigButton>
    </div>
  )
}
