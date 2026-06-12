/**
 * SongEditorScreen (C2) — rutas /songs/cloud/new y /songs/cloud/:id.
 *
 * Editor de canciones cloud: título (requerido), autor, etiquetas y
 * lista de SECCIONES (label + textarea de letra) con añadir / eliminar /
 * reordenar por botones ↑↓ (drag&drop táctil descartado a propósito:
 * complejidad alta, beneficio bajo en listas de <20 items).
 *
 * Guardar: valida (validateSong, la misma función del servicio) →
 * create/update → setFlash(toast éxito) → vuelve a /songs (SongsScreen
 * consume el flash y arranca en modo nube). Descartar con cambios sin
 * guardar pasa por ConfirmModal (patrón del SongEditor del desktop).
 *
 * LIMITACIÓN DOCUMENTADA (back de Android): la app usa <Routes>
 * declarativo (no data router), así que useBlocker no está disponible y
 * no interceptamos popstate — el botón físico/gesto back de Android sale
 * del editor SIN confirm. Cubierto: el botón ← de la UI y cualquier
 * navegación interna. Migrar a createBrowserRouter habilitaría
 * useBlocker, pero es un cambio de shell que no pertenece a C2.
 *
 * El editor solo manda los campos que gestiona (title/author/tags/
 * sections) — update() es parcial, así que tempo/key_signature/
 * max_lines/is_favorite editados en el desktop NO se pisan.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton.jsx'
import FormField from '../components/FormField.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import { useCloudSong } from '../hooks/useCloudSong.js'
import * as cloudSongs from '../services/cloudSongs.js'
import { setFlash } from '../services/flashMessage.js'
import { tapLight, tapMedium } from '../services/haptics.js'
import { useT } from '../hooks/useT.js'

// Chips de etiqueta rápida por sección. El label mostrado/insertado se
// traduce (es CONTENIDO que viaja a la BD, pero quien escribe en PT
// quiere 'Estrofe', no 'Estrofa'); el type es el canónico del desktop.
const CHIP_TYPES = ['verse', 'chorus', 'bridge', 'intro', 'outro']

const KNOWN_SAVE_ERRORS = new Set(['network', 'unauthorized', 'not_found', 'validation', 'unknown'])

function serializeForm({ title, author, tags, sections }) {
  return JSON.stringify({
    title,
    author,
    tags,
    sections: sections.map((s) => ({ label: s.label, text: s.text })),
  })
}

export default function SongEditorScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const { id } = useParams()
  const isNew = !id
  const { song, status: loadStatus, error: loadError, retry } = useCloudSong(isNew ? null : id)

  const keyRef = useRef(1)
  const newKey = () => `sec-${keyRef.current++}`

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [tags, setTags] = useState('')
  const [sections, setSections] = useState(() => (isNew
    ? [{ key: newKey(), type: 'verse', label: t('songEditor.defaultSectionLabel', { n: 1 }), text: '' }]
    : []))
  const [titleError, setTitleError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  // Snapshot del estado "limpio" para detectar cambios sin guardar.
  const initialRef = useRef(isNew
    ? serializeForm({ title: '', author: '', tags: '', sections: [{ label: t('songEditor.defaultSectionLabel', { n: 1 }), text: '' }] })
    : null)
  const hydratedRef = useRef(false)

  // Modo edición: hidratar el form UNA vez cuando llega la canción.
  useEffect(() => {
    if (isNew || !song || hydratedRef.current) return
    hydratedRef.current = true
    const secs = (Array.isArray(song.sections) ? song.sections : []).map((s) => ({
      key: newKey(),
      type: typeof s?.type === 'string' && s.type ? s.type : 'verse',
      label: String(s?.label ?? ''),
      text: String(s?.text ?? ''),
    }))
    const nextTitle = song.title || ''
    const nextAuthor = song.author || ''
    const nextTags = song.tags || ''
    setTitle(nextTitle)
    setAuthor(nextAuthor)
    setTags(nextTags)
    setSections(secs)
    initialRef.current = serializeForm({ title: nextTitle, author: nextAuthor, tags: nextTags, sections: secs })
  }, [isNew, song])

  const isDirty = initialRef.current != null
    && serializeForm({ title, author, tags, sections }) !== initialRef.current

  function handleBack() {
    if (isDirty) {
      setDiscardOpen(true)
      return
    }
    nav('/songs')
  }

  function patchSection(key, patch) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function handleLabelChange(key, label) {
    patchSection(key, { label, type: cloudSongs.inferSectionType(label) || 'verse' })
  }

  function handleChip(key, type) {
    tapLight()
    patchSection(key, { label: t(`songEditor.chip.${type}`), type })
  }

  function handleAddSection() {
    tapLight()
    setSections((prev) => ([
      ...prev,
      { key: newKey(), type: 'verse', label: t('songEditor.defaultSectionLabel', { n: prev.length + 1 }), text: '' },
    ]))
  }

  function handleRemoveSection(key) {
    tapLight()
    setSections((prev) => prev.filter((s) => s.key !== key))
  }

  function handleMove(key, delta) {
    tapLight()
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.key === key)
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
      author,
      tags,
      sections: sections.map(({ type, label, text }) => ({ type, label, text })),
    }
    const issue = cloudSongs.validateSong(payload)
    if (issue) {
      applyValidationIssue(issue)
      return
    }
    setTitleError(null)
    setSaveError(null)
    setSaving(true)
    tapMedium()
    const res = isNew
      ? await cloudSongs.create(payload)
      : await cloudSongs.update(id, payload)
    setSaving(false)
    if (res.ok) {
      setFlash(t('songEditor.saved'))
      nav('/songs')
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
      setTitleError(t(issue.reason === 'too_long' ? 'songEditor.err.title_too_long' : 'songEditor.err.title_required'))
      setSaveError(null)
      return
    }
    setTitleError(null)
    setSaveError(null)
    if (issue.field === 'sections') {
      setSaveError(issue.reason === 'too_many' ? 'sections_too_many' : 'section_text_too_long')
    } else {
      setSaveError('validation')
    }
  }

  const saveErrorText = saveError
    ? (saveError === 'sections_too_many'
      ? t('songEditor.err.sections_too_many')
      : saveError === 'section_text_too_long'
        ? t('songEditor.err.section_text_too_long')
        : t(`cloudSongs.err.${saveError}`))
    : null

  const showForm = isNew || loadStatus === 'ready' || hydratedRef.current

  return (
    <div
      className="px-4 pb-24 space-y-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t('songEditor.backAria')}
          className="min-w-[44px] min-h-[44px] -ml-2 grid place-items-center rounded-lg
                     text-ink-2 hover:bg-bg-2 transition-colors text-xl"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">
            {t(isNew ? 'songEditor.titleNew' : 'songEditor.titleEdit')}
          </h1>
          <p className="text-sm text-ink-3 mt-0.5">{t('songEditor.subtitle')}</p>
        </div>
      </header>

      {/* Live region para errores de guardado (patrón AccountScreen). */}
      <p role="status" aria-live="polite" className="sr-only">
        {saveErrorText || titleError || ''}
      </p>

      {!isNew && loadStatus === 'loading' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center text-sm text-ink-3">
          {t('songEditor.loading')}
        </div>
      )}

      {!isNew && loadStatus === 'error' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-3" role="alert">
          <p className="text-sm text-ink-2">
            {loadError?.code === 'not_found'
              ? t('cloudSongs.err.not_found')
              : t('songEditor.loadError')}
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
            label={t('songEditor.fieldTitle')}
            type="text"
            autoCapitalize="sentences"
            maxLength={cloudSongs.LIMITS.TITLE_MAX}
            placeholder={t('songEditor.fieldTitlePlaceholder')}
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null) }}
            error={titleError}
          />
          <FormField
            label={t('songEditor.fieldAuthor')}
            type="text"
            autoCapitalize="words"
            maxLength={cloudSongs.LIMITS.AUTHOR_MAX}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <FormField
            label={t('songEditor.fieldTags')}
            type="text"
            autoCapitalize="none"
            maxLength={cloudSongs.LIMITS.TAGS_MAX}
            hint={t('songEditor.fieldTagsHint')}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />

          <section aria-label={t('songEditor.sectionsTitle')} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium text-ink-2">{t('songEditor.sectionsTitle')}</h2>
              <p className="text-xs text-ink-4 mt-0.5">{t('songEditor.sectionsHint')}</p>
            </div>

            {sections.map((section, idx) => {
              const n = idx + 1
              return (
                <div
                  key={section.key}
                  className="rounded-xl bg-bg-2 border border-line-1 p-3 space-y-2"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      aria-label={t('songEditor.sectionLabelAria', { n })}
                      placeholder={t('songEditor.sectionLabelPlaceholder')}
                      maxLength={cloudSongs.LIMITS.SECTION_LABEL_MAX}
                      value={section.label}
                      onChange={(e) => handleLabelChange(section.key, e.target.value)}
                      className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-bg-1 border border-line-1
                                 text-sm text-ink-1 placeholder:text-ink-3
                                 focus:outline-none focus:border-copper-200 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => handleMove(section.key, -1)}
                      disabled={idx === 0}
                      aria-label={t('songEditor.moveUpAria', { n })}
                      className="min-w-[40px] min-h-[40px] grid place-items-center rounded-lg
                                 bg-bg-3 text-ink-2 disabled:opacity-30 hover:bg-bg-1 transition-colors"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(section.key, 1)}
                      disabled={idx === sections.length - 1}
                      aria-label={t('songEditor.moveDownAria', { n })}
                      className="min-w-[40px] min-h-[40px] grid place-items-center rounded-lg
                                 bg-bg-3 text-ink-2 disabled:opacity-30 hover:bg-bg-1 transition-colors"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(section.key)}
                      aria-label={t('songEditor.removeAria', { n })}
                      className="min-w-[40px] min-h-[40px] grid place-items-center rounded-lg
                                 bg-bg-3 text-ink-3 hover:text-live hover:bg-live/10 transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {CHIP_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleChip(section.key, type)}
                        aria-label={t('songEditor.chipAria', { label: t(`songEditor.chip.${type}`), n })}
                        className="h-8 px-3 rounded-full bg-bg-3 border border-line-1 text-xs text-ink-2
                                   hover:border-copper-200/60 hover:text-copper-100 transition-colors"
                      >
                        {t(`songEditor.chip.${type}`)}
                      </button>
                    ))}
                  </div>

                  <textarea
                    aria-label={t('songEditor.sectionTextAria', { n })}
                    placeholder={t('songEditor.sectionTextPlaceholder')}
                    maxLength={cloudSongs.LIMITS.SECTION_TEXT_MAX}
                    rows={4}
                    value={section.text}
                    onChange={(e) => patchSection(section.key, { text: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-bg-1 border border-line-1
                               text-sm text-ink-1 placeholder:text-ink-3 leading-relaxed resize-y
                               focus:outline-none focus:border-copper-200 transition-colors"
                  />
                </div>
              )
            })}

            <button
              type="button"
              onClick={handleAddSection}
              className="w-full min-h-[48px] rounded-xl border border-dashed border-line-2
                         text-sm text-ink-2 hover:text-copper-100 hover:border-copper-200/60 transition-colors"
            >
              {t('songEditor.addSection')}
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
            aria-label={t('songEditor.saveAria')}
          >
            {t('songEditor.save')}
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
        onConfirm={() => { setDiscardOpen(false); nav('/songs') }}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>
  )
}
