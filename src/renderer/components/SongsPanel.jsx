import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listSongs, createSong, updateSong, deleteSong, toggleFavorite, isUsingSQLite,
  songMatchesQuery, findLyricSnippet,
} from '../services/songsService.js'
import { normalizeText } from '../services/textUtils.js'
import SongEditor from './SongEditor.jsx'
import ResizableDivider from './ResizableDivider.jsx'
import { subscribe, emit } from '../hooks/useShortcuts.js'
import { confirm } from '../services/dialogService.js'
import { addItem as addToSchedule, setScheduleDragPayload } from '../services/scheduleService.js'
import { getSongsCache, updateSongsCache } from '../services/panelStateCache.js'
import { songToSlides } from '../services/songSplit.js'
import {
  IconSearch, IconPlus, IconEdit, IconTrash, IconArrowRight,
  IconStar, IconStarFill, IconMusic, IconRefresh, IconX, IconUpload,
} from './Icons.jsx'
import { useT } from '../services/i18n.js'

// ============================================================
// Persistencia del ORDEN del Servicio del día.
// Se almacena solo IDs en localStorage. La pertenencia (favorito)
// sigue persistiendo en SQLite vía is_favorite — esto solo guarda
// EL ORDEN custom dado por drag&drop dentro de la columna.
// ============================================================
const SERVICE_ORDER_KEY = 'eclesia.service.order'
const loadServiceOrder = () => {
  try { return JSON.parse(localStorage.getItem(SERVICE_ORDER_KEY) || '[]') }
  catch { return [] }
}
const saveServiceOrder = (ids) => {
  try { localStorage.setItem(SERVICE_ORDER_KEY, JSON.stringify(ids)) } catch {}
}

// Persistencia del toggle "Ocultar referencia" (título · sección en
// proyección). Por defecto se muestra (referencia visible).
const HIDE_REF_KEY = 'eclesia.songs.hideReference'
const loadHideRef = () => {
  try { return localStorage.getItem(HIDE_REF_KEY) === '1' } catch { return false }
}
const saveHideRef = (v) => {
  try { localStorage.setItem(HIDE_REF_KEY, v ? '1' : '0') } catch {}
}

// Persistencia del ANCHO de la columna 1 (Biblioteca) en el split de Canciones.
const SONGS_COL1_KEY = 'eclesia.layout.songsCol1'
const SONGS_COL1_MIN = 240
const SONGS_COL1_MAX = 900
const SONGS_COL1_DEFAULT = 420
const loadSongsCol1 = () => {
  try {
    const n = parseInt(localStorage.getItem(SONGS_COL1_KEY) || '', 10)
    if (Number.isFinite(n)) {
      return Math.max(SONGS_COL1_MIN, Math.min(SONGS_COL1_MAX, n))
    }
  } catch {}
  return SONGS_COL1_DEFAULT
}
const saveSongsCol1 = (w) => {
  try { localStorage.setItem(SONGS_COL1_KEY, String(w)) } catch {}
}

export default function SongsPanel({ onSendSlide }) {
  const t = useT()
  // Restaurar estado de sesión previa al volver al panel
  const _restore = getSongsCache()

  const [songs, setSongs]         = useState([])     // todas, alfabético
  const [search, setSearch]       = useState(_restore.search || '')
  const [selected, setSelected]   = useState(null)   // se completa al cargar songs
  const [sectionIndex, setSectionIndex] = useState(_restore.sectionIndex || 0)
  const [editing, setEditing]     = useState(null)
  const [serviceOrderIds, setServiceOrderIds] = useState(loadServiceOrder())
  // Ancho de la columna 1 (Biblioteca) — divisor arrastrable
  const [col1Width, setCol1Width] = useState(loadSongsCol1)
  // Toggle "Ocultar referencia": cuando está activo, los slides de canción
  // se proyectan SIN la línea "Título · Sección". Se mantiene en localStorage.
  const [hideReference, setHideReferenceState] = useState(loadHideRef)
  const toggleHideReference = () => {
    setHideReferenceState(v => {
      const next = !v
      saveHideRef(next)
      return next
    })
  }
  // Drag&drop visual feedback
  const [dragOverId, setDragOverId] = useState(null)  // id sobre el que está hovering
  const [dropZone, setDropZone]     = useState(null)  // 'service-empty' | 'service-end' | null

  const refresh = async () => {
    const data = await listSongs({ search: '' })  // siempre TODAS (filtro en cliente)
    setSongs(data)
  }

  useEffect(() => { refresh() }, [])

  // Ctrl+F global → enfoca el buscador de canciones.
  const searchRef = useRef(null)
  useEffect(() => {
    return subscribe('search:focus', () => {
      requestAnimationFrame(() => searchRef.current?.focus())
    })
  }, [])

  // Tras cargar songs, restaurar la canción seleccionada de la sesión previa
  useEffect(() => {
    if (songs.length === 0) return
    if (selected) return
    const cachedId = _restore.selectedId
    if (cachedId) {
      const found = songs.find(s => s.id === cachedId)
      if (found) setSelected(found)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs])

  // Persistir cambios al cache de sesión
  useEffect(() => {
    updateSongsCache({
      selectedId: selected?.id || null,
      sectionIndex,
      slideIndex: 0,  // se actualiza más abajo
      search,
    })
  }, [selected, sectionIndex, search])

  // Cuando cambian las canciones, mantén el orden del servicio sincronizado:
  // - quita IDs que ya no son favoritos
  // - añade favoritos nuevos al final
  useEffect(() => {
    if (songs.length === 0) return
    const favIds = new Set(songs.filter(s => s.is_favorite).map(s => s.id))
    const existing = serviceOrderIds.filter(id => favIds.has(id))
    const toAdd = [...favIds].filter(id => !existing.includes(id))
    const next = [...existing, ...toAdd]
    if (next.length !== serviceOrderIds.length || next.some((id, i) => id !== serviceOrderIds[i])) {
      setServiceOrderIds(next)
      saveServiceOrder(next)
    }
  }, [songs])

  // Cancion filtrada por búsqueda (col 1).
  // Usa songMatchesQuery del service para que la búsqueda sea consistente
  // y SIN tildes — fundamental para letras en español ("corazon" debe
  // encontrar "corazón"). Busca en título, autor, etiquetas Y letra
  // completa de cada sección.
  const normalizedQuery = useMemo(() => {
    return search.trim() ? normalizeText(search.trim()) : ''
  }, [search])

  const allSongsFiltered = useMemo(() => {
    if (!normalizedQuery) return songs
    return songs.filter(s => songMatchesQuery(s, normalizedQuery))
  }, [songs, normalizedQuery])

  // Canciones del servicio (col 2) en el orden del servicio
  const serviceSongs = useMemo(() => {
    const byId = new Map(songs.map(s => [s.id, s]))
    return serviceOrderIds.map(id => byId.get(id)).filter(Boolean)
  }, [songs, serviceOrderIds])

  // === ACCIONES CRUD ===

  const handleSave = async (data) => {
    if (editing === 'new') await createSong(data)
    else                   await updateSong(editing.id, data)
    setEditing(null)
    refresh()
  }

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Eliminar canción',
      message: t('songs.deleteConfirm'),
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await deleteSong(id)
    if (selected?.id === id) setSelected(null)
    // Quitar del orden del servicio si estaba
    if (serviceOrderIds.includes(id)) {
      const next = serviceOrderIds.filter(x => x !== id)
      setServiceOrderIds(next); saveServiceOrder(next)
    }
    refresh()
  }

  const handleToggleFavorite = async (id) => {
    await toggleFavorite(id)
    refresh()
  }

  // === DRAG & DROP ===

  // Inicia drag — guarda el ID, la columna de origen, Y un payload
  // compatible con la Lista del día (así también se puede arrastrar la
  // canción al ScheduleStrip de la derecha).
  const onDragStart = (e, song, source) => {
    e.dataTransfer.effectAllowed = source === 'col2' ? 'move' : 'copy'
    e.dataTransfer.setData('text/song-id', String(song.id))
    e.dataTransfer.setData('text/song-source', source)
    // Payload para Lista del día
    setScheduleDragPayload(e, {
      type: 'song',
      title: song.title,
      text: song.sections?.[0]?.text || song.title,
      reference: song.author || '',
      meta: { songId: song.id, sections: song.sections },
    })
  }

  // Mueve un song dentro del servicio a la posición de targetId
  const reorderService = (draggedId, targetId) => {
    if (draggedId === targetId) return
    const without = serviceOrderIds.filter(id => id !== draggedId)
    const targetIdx = without.indexOf(targetId)
    if (targetIdx === -1) return
    const next = [...without.slice(0, targetIdx), draggedId, ...without.slice(targetIdx)]
    setServiceOrderIds(next); saveServiceOrder(next)
  }

  // Añade song al final del servicio (toggle favorite ON si no lo era)
  const addToService = async (songId) => {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    if (!song.is_favorite) {
      await toggleFavorite(songId)
    }
    // Asegurar que esté en el orden y al final
    setServiceOrderIds(prev => {
      if (prev.includes(songId)) return prev
      const next = [...prev, songId]
      saveServiceOrder(next)
      return next
    })
    refresh()
  }

  // Quita del servicio (toggle favorite OFF)
  const removeFromService = async (songId) => {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    if (song.is_favorite) await toggleFavorite(songId)
    setServiceOrderIds(prev => {
      const next = prev.filter(id => id !== songId)
      saveServiceOrder(next)
      return next
    })
    refresh()
  }

  // Drop handlers para col 2
  const onServiceDragOver = (e, targetId = null, zone = null) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (targetId) setDragOverId(targetId)
    if (zone) setDropZone(zone)
  }
  const onServiceDragLeave = () => {
    setDragOverId(null); setDropZone(null)
  }
  const onServiceDrop = async (e, targetId = null) => {
    e.preventDefault()
    setDragOverId(null); setDropZone(null)
    const draggedId = +e.dataTransfer.getData('text/song-id')
    const source = e.dataTransfer.getData('text/song-source')
    if (!draggedId) return
    if (source === 'col1') {
      await addToService(draggedId)
    } else if (source === 'col2' && targetId) {
      reorderService(draggedId, targetId)
    }
  }

  // === PROYECCIÓN ===

  const flatSlides = selected
    ? songToSlides(selected, { maxLines: selected.maxLines ?? 4 })
    : []
  const [slideIndex, setSlideIndex] = useState(0)

  useEffect(() => { setSlideIndex(0) }, [selected?.id])

  // Helper: añade las claves del theme_override de la canción al slide.
  // SlideRenderer.mergeThemeWithSlide las aplicará automáticamente.
  // Si el usuario activó "Ocultar referencia" en el header, forzamos
  // referenceVisible:false en el slide — SlideRenderer ya respeta este flag.
  const slideWithOverride = (slide, song) => ({
    ...slide,
    type: 'song',
    ...(song?.theme_override || {}),
    ...(hideReference ? { referenceVisible: false } : null),
  })

  const sendSlide = (idx) => {
    if (!flatSlides[idx]) return
    setSlideIndex(idx)
    setSectionIndex(flatSlides[idx].sectionIndex)
    onSendSlide(slideWithOverride({
      text: flatSlides[idx].text,
      reference: flatSlides[idx].reference,
    }, selected))
  }

  const handleSendSection = (song, section, idx) => {
    setSelected(song)
    setSectionIndex(idx)
    const slides = songToSlides(song, { maxLines: song.maxLines ?? 4 })
    const firstSlideOfSection = slides.findIndex(s => s.sectionIndex === idx)
    if (firstSlideOfSection !== -1) {
      setSlideIndex(firstSlideOfSection)
      onSendSlide(slideWithOverride({
        text: slides[firstSlideOfSection].text,
        reference: slides[firstSlideOfSection].reference,
      }, song))
    }
  }

  useEffect(() => {
    if (flatSlides.length === 0) return
    const next = () => sendSlide(Math.min(flatSlides.length - 1, slideIndex + 1))
    const prev = () => sendSlide(Math.max(0, slideIndex - 1))
    const offNext = subscribe('navigate:next', next)
    const offPrev = subscribe('navigate:prev', prev)
    return () => { offNext(); offPrev() }
  }, [selected, slideIndex, flatSlides.length])

  // Ref mutable para acceder a `songs` dentro de handlers sin re-suscribir
  // cada vez que cambia el array. Antes la dependencia [songs] en useEffect
  // causaba un window de desuscripcion/re-suscripcion en cada mutacion donde
  // los eventos del remoto podian perderse.
  const songsRef = useRef(songs)
  useEffect(() => { songsRef.current = songs }, [songs])

  // Click simple en la Lista del dia → seleccionar la cancion aqui.
  useEffect(() => {
    return subscribe('songs:focus-item', (payload) => {
      const id = payload?.songId || payload?.id
      if (!id) return
      const found = songsRef.current.find(s => s.id === id)
      if (found) {
        setSelected(found)
      } else {
        listSongs({}).then(all => {
          setSongs(all)
          const s = all.find(x => x.id === id)
          if (s) setSelected(s)
        })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return subscribe('songs:remote-project', (payload) => {
      const id = payload?.id
      if (!id) return
      const targetSection = Number.isInteger(payload?.sectionIndex) && payload.sectionIndex >= 0
        ? payload.sectionIndex
        : null
      const found = songsRef.current.find(s => s.id === id)
      const doProject = (song) => {
        if (!song) return
        setSelected(song)
        const slides = songToSlides(song, { maxLines: song.maxLines ?? 4 })
        if (slides.length === 0) return
        // T10 backward-compat: si el mobile manda sectionIndex (legacy 'song'
        // event extendido), saltamos al primer slide de esa seccion. Sin
        // sectionIndex, comportamiento clasico (slide 0).
        let slideIdx = 0
        if (targetSection != null) {
          const candidate = slides.findIndex(s => s.sectionIndex === targetSection)
          if (candidate >= 0) slideIdx = candidate
        }
        setSlideIndex(slideIdx)
        setSectionIndex(slides[slideIdx].sectionIndex)
        onSendSlide(slideWithOverride({
          text: slides[slideIdx].text,
          reference: slides[slideIdx].reference,
        }, song))
      }
      if (found) doProject(found)
      else listSongs({}).then(all => {
        setSongs(all)
        doProject(all.find(s => s.id === id))
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearService = async () => {
    const ok = await confirm({
      title: 'Vaciar lista del día',
      message: t('songs.clearListConfirm'),
      confirmLabel: 'Vaciar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    for (const id of serviceOrderIds) {
      const s = songs.find(x => x.id === id)
      if (s?.is_favorite) await toggleFavorite(id)
    }
    setServiceOrderIds([]); saveServiceOrder([])
    refresh()
  }

  return (
    <div className="workspace">
      <div className="ws-header">
        <div className="ws-title">
          <h1 className="ws-h1">{t('nav.songs')}</h1>
          <span className="ws-sub">
            {t('songs.subtitle', { n: songs.length, storage: isUsingSQLite() ? t('songs.storageSqlite') : t('songs.storageLocal') })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Toggle global "Ocultar referencia" — afecta TODOS los slides de
              canción mientras esté activo. La referencia (Título · Sección)
              se omite en proyección y en preview. Persistido en localStorage. */}
          <button
            className="btn"
            onClick={toggleHideReference}
            title={hideReference
              ? 'Volver a mostrar el título · sección en la proyección'
              : 'Ocultar el título · sección en la proyección (solo letra)'}
            style={hideReference ? {
              borderColor: 'rgba(232, 181, 145, 0.45)',
              background: 'linear-gradient(180deg, rgba(168, 95, 51, 0.18), rgba(128, 64, 18, 0.08))',
              color: 'var(--copper-100)',
            } : null}>
            {hideReference ? '🏷️ Referencia oculta' : '🏷️ Ocultar referencia'}
          </button>
          <button
            className="btn"
            onClick={() => emit('settings:open', { section: 'canciones' })}
            title="Importar o exportar canciones desde Ajustes">
            <IconUpload size={14} /> Importar / Exportar
          </button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <IconPlus size={14} /> {t('songs.new')}
          </button>
        </div>
      </div>

      <div className="ws-body">
        {/* ═══════════════════════════════════════════════════
             LAYOUT 2 COLUMNAS:
              col 1 → todas las canciones (alfabético, fijo)
              col 2 → servicio del día (drag&drop reordenable)
            ═══════════════════════════════════════════════════ */}
        <div style={{
          display: 'grid',
          // Layout con divisor arrastrable: [col1] [6px divider] [col2].
          // col1 toma el ancho persistido; col2 ocupa lo que queda.
          gridTemplateColumns: `${col1Width}px 6px minmax(0, 1fr)`,
          gap: 8,
          height: '100%',
          minHeight: 0,
        }}>

          {/* ─── COLUMNA 1: Biblioteca ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <div className="section-h">
              <h3 style={{ fontSize: 14 }}>Biblioteca</h3>
              <span className="sub">{allSongsFiltered.length} · alfabético</span>
            </div>
            <div className="input-wrap">
              <IconSearch size={15} className="input-icon" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('songs.searchPlaceholder')} />
              <span className="input-kbd"><span className="kbd">/</span></span>
            </div>

            {allSongsFiltered.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <p className="empty-text">
                  {search ? t('songs.emptySearch') : t('songs.empty')}
                </p>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                {allSongsFiltered.map(song => {
                  // Si el match fue por letra (no por título/autor/tag),
                  // mostramos un snippet bajo el título — así el usuario
                  // entiende POR QUÉ aparece esa canción al buscar un
                  // fragmento de letra.
                  const isTitleMatch = normalizedQuery && normalizeText(song.title).includes(normalizedQuery)
                  const isAuthorMatch = normalizedQuery && normalizeText(song.author || '').includes(normalizedQuery)
                  const isTagMatch = normalizedQuery && normalizeText(song.tags || '').includes(normalizedQuery)
                  const lyricMatch = (normalizedQuery && !isTitleMatch && !isAuthorMatch && !isTagMatch)
                    ? findLyricSnippet(song, normalizedQuery)
                    : null
                  return (
                    <SongCard
                      key={song.id}
                      song={song}
                      expanded={selected?.id === song.id}
                      column="col1"
                      inService={serviceOrderIds.includes(song.id)}
                      sectionIndex={sectionIndex}
                      lyricMatch={lyricMatch}
                      onSelect={() => setSelected(s => s?.id === song.id ? null : song)}
                      onFavorite={() => handleToggleFavorite(song.id)}
                      onAddToList={() => addToSchedule({
                        type: 'song', title: song.title,
                        text: song.sections?.[0]?.text || song.title,
                        reference: song.author || '',
                        meta: { songId: song.id, sections: song.sections },
                      })}
                      onEdit={() => setEditing(song)}
                      onDelete={() => handleDelete(song.id)}
                      onSendSection={(sec, i) => handleSendSection(song, sec, i)}
                      onDragStart={(e) => onDragStart(e, song, 'col1')}
                      t={t}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Divisor arrastrable entre Biblioteca y Servicio del día */}
          <ResizableDivider
            size={col1Width}
            onResize={setCol1Width}
            onCommit={saveSongsCol1}
            direction="left"
            min={SONGS_COL1_MIN}
            max={SONGS_COL1_MAX}
            variant="inner"
          />

          {/* ─── COLUMNA 2: Servicio del día ─── */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}
            onDragOver={(e) => {
              // Drop sobre la columna en general (no sobre un item) → añade al final
              e.preventDefault()
              if (serviceSongs.length === 0) setDropZone('service-empty')
              else setDropZone('service-end')
            }}
            onDragLeave={() => setDropZone(null)}
            onDrop={(e) => onServiceDrop(e)}
          >
            <div className="section-h">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ fontSize: 14, color: 'var(--copper-100)' }}>
                  Servicio del día
                </h3>
                <span className="sub">{serviceSongs.length}</span>
              </div>
              {serviceSongs.length > 0 && (
                <button className="btn btn-ghost btn-danger" onClick={clearService}
                  style={{ fontSize: 11 }}
                  title="Vaciar el servicio del día (no borra las canciones, solo las quita de aquí)">
                  Vaciar servicio
                </button>
              )}
            </div>

            {serviceSongs.length === 0 ? (
              <div
                className="card"
                style={{
                  flex: 1,
                  display: 'grid', placeItems: 'center',
                  textAlign: 'center',
                  padding: 40,
                  border: dropZone === 'service-empty'
                    ? '2px dashed var(--copper-200)'
                    : '2px dashed var(--line-1)',
                  background: dropZone === 'service-empty'
                    ? 'rgba(168, 95, 51, 0.08)'
                    : 'var(--bg-2)',
                  transition: 'all 0.15s',
                }}>
                <div style={{ opacity: 0.7 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🎶</div>
                  <p className="empty-text" style={{ marginBottom: 4 }}>
                    Sin canciones para hoy
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    Arrastra canciones desde la biblioteca →
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                {serviceSongs.map((song, idx) => (
                  <div
                    key={song.id}
                    onDragOver={(e) => { e.stopPropagation(); onServiceDragOver(e, song.id) }}
                    onDragLeave={onServiceDragLeave}
                    onDrop={(e) => { e.stopPropagation(); onServiceDrop(e, song.id) }}
                    style={{
                      borderTop: dragOverId === song.id ? '2px solid var(--copper-200)' : '2px solid transparent',
                      transition: 'border-color 0.12s',
                    }}>
                    <SongCard
                      song={song}
                      expanded={selected?.id === song.id}
                      column="col2"
                      inService={true}
                      serviceIndex={idx + 1}
                      sectionIndex={sectionIndex}
                      onSelect={() => setSelected(s => s?.id === song.id ? null : song)}
                      onRemove={() => removeFromService(song.id)}
                      onEdit={() => setEditing(song)}
                      onSendSection={(sec, i) => handleSendSection(song, sec, i)}
                      onDragStart={(e) => onDragStart(e, song, 'col2')}
                      t={t}
                    />
                  </div>
                ))}
                {/* Drop zone al final de la lista */}
                <div
                  onDragOver={(e) => { e.stopPropagation(); onServiceDragOver(e, null, 'service-end') }}
                  onDrop={(e) => { e.stopPropagation(); onServiceDrop(e) }}
                  style={{
                    height: dropZone === 'service-end' ? 40 : 12,
                    border: dropZone === 'service-end' ? '2px dashed var(--copper-200)' : 'none',
                    borderRadius: 8,
                    transition: 'all 0.15s',
                    marginTop: 6,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <SongEditor
          song={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// SongCard — tarjeta de canción común a ambas columnas.
// La columna ('col1' | 'col2') decide qué acciones se muestran:
//   col1 → favorito (estrella), añadir lista, editar, borrar
//   col2 → número de orden, quitar del servicio, editar
//
// LAYOUT (rediseñado para portátiles estrechos):
//   ┌──────────────────────────────────────────────┐
//   │ [⠿] [♪]  TÍTULO DE LA CANCIÓN  ⭐ [tags...]    │   ← fila 1: título completo
//   │         Autor · 4 secciones                  │   ← fila 2: metadata
//   │         [«lyric snippet» si matchea letra]    │   ← fila 3 opcional
//   │                          [acciones]          │   ← fila 4: botones
//   └──────────────────────────────────────────────┘
//   El título YA NO se solapa con los botones — siempre toma toda
//   la fila. Los botones están debajo, alineados a la derecha.
// ============================================================
function SongCard({
  song, expanded, column, inService, serviceIndex, sectionIndex,
  onSelect, onFavorite, onAddToList, onEdit, onDelete, onRemove,
  onSendSection, onDragStart, t, lyricMatch,
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        className="song-row"
        draggable
        onDragStart={onDragStart}
        style={{
          ...(expanded ? { borderColor: 'rgba(232, 181, 145, 0.4)' } : {}),
          cursor: 'grab',
          ...(column === 'col2' ? { background: 'linear-gradient(180deg, rgba(168,95,51,0.04), transparent)' } : {}),
        }}
        onMouseDown={e => e.currentTarget.style.cursor = 'grabbing'}
        onMouseUp={e => e.currentTarget.style.cursor = 'grab'}>

        {column === 'col2' ? (
          <span className="song-row-handle" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 26, height: 26, borderRadius: '50%',
            background: 'rgba(168, 95, 51, 0.18)',
            border: '1px solid rgba(232, 181, 145, 0.3)',
            color: 'var(--copper-100)',
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>{serviceIndex}</span>
        ) : (
          <span className="drag-handle song-row-handle">
            <span className="dot" /><span className="dot" />
            <span className="dot" /><span className="dot" />
            <span className="dot" /><span className="dot" />
          </span>
        )}

        <span className="song-icon"><IconMusic size={16} /></span>

        <div className="song-info" onClick={onSelect}>
          {/* Fila 1: título (ocupa todo el ancho disponible) */}
          <div className="song-title">
            <span className="song-title-text">{song.title}</span>
            {column === 'col1' && song.is_favorite && (
              <span style={{ color: 'var(--copper-200)', flexShrink: 0 }}><IconStarFill size={11} /></span>
            )}
            {song.tags && song.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3).map(t => (
              <span key={t} className="song-tag">{t}</span>
            ))}
          </div>
          {/* Fila 2: autor + cuenta de secciones */}
          <div className="song-meta">
            <span className="author">{song.author || t('songs.noAuthor')}</span>
            {song.sections?.length > 0 && (
              <>
                <span style={{ margin: '0 8px', color: 'var(--text-4)' }}>·</span>
                {t('songs.sectionsCount', { n: song.sections.length })}
              </>
            )}
          </div>
          {/* Fila 3 opcional: fragmento de letra que matcheó la búsqueda */}
          {lyricMatch && (
            <div className="song-lyric-match" title="Coincide con tu búsqueda en la letra">
              <span className="song-lyric-label">{lyricMatch.label}</span>
              <span className="song-lyric-snippet">«{lyricMatch.snippet}»</span>
            </div>
          )}
          {/* Fila 4: acciones (alineadas a la derecha, DEBAJO del título) */}
          <span className="song-actions">
            {column === 'col1' && (
              <>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onFavorite() }}
                  title={song.is_favorite ? 'Quitar del servicio' : 'Añadir al servicio del día'}>
                  {song.is_favorite
                    ? <span style={{ color: 'var(--copper-200)' }}><IconStarFill size={13} /></span>
                    : <IconStar size={13} />}
                </button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onAddToList() }} title={t('songs.addToList')}>
                  <IconPlus size={13} /> {t('songs.list')}
                </button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onEdit() }} title="Editar">
                  <IconEdit size={13} />
                </button>
                <button className="btn btn-ghost btn-danger" onClick={(e) => { e.stopPropagation(); onDelete() }} title="Eliminar">
                  <IconTrash size={13} />
                </button>
              </>
            )}
            {column === 'col2' && (
              <>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onEdit() }} title="Editar">
                  <IconEdit size={13} />
                </button>
                <button className="btn btn-ghost btn-danger" onClick={(e) => { e.stopPropagation(); onRemove() }}
                  title="Quitar del servicio del día (la canción no se borra)">
                  <IconX size={13} />
                </button>
              </>
            )}
          </span>
        </div>
      </div>

      {expanded && song.sections?.length > 0 && (
        <div style={{
          margin: '4px 0 8px 36px', paddingLeft: 14,
          borderLeft: '2px solid var(--line-2)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {song.sections.map((section, i) => {
            const active = sectionIndex === i
            return (
              <button key={i}
                onClick={() => onSendSection(section, i)}
                style={{
                  textAlign: 'left', padding: '8px 12px',
                  borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  background: active
                    ? 'linear-gradient(180deg, rgba(168,95,51,0.22), rgba(128,64,18,0.14))'
                    : 'transparent',
                  border: '1px solid ' + (active ? 'rgba(232,181,145,0.35)' : 'transparent'),
                  transition: 'all 0.15s ease',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                    color: active ? 'var(--copper-100)' : 'var(--copper-200)', fontWeight: 600,
                  }}>{section.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    · {section.type}
                  </span>
                </div>
                <p style={{
                  fontSize: 12, color: 'var(--text-2)', margin: 0,
                  whiteSpace: 'pre-line',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{section.text}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
