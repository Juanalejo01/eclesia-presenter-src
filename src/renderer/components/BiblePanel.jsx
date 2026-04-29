import { useEffect, useMemo, useState } from 'react'
import {
  getAllVersions, getActiveVersion, setActiveVersion,
  getBooks, getChapter, getChapterCount, searchText, combineVerses,
} from '../services/bibleService.js'
import { subscribe } from '../hooks/useShortcuts.js'
import { addItem as addToSchedule } from '../services/scheduleService.js'
import { IconSearch, IconPlus, IconStar, IconArrowRight, IconChevDown } from './Icons.jsx'

export default function BiblePanel({ onSendSlide }) {
  const [versions, setVersions] = useState(getAllVersions())
  const [versionId, setVersionId] = useState(getActiveVersion().id)

  const [books, setBooks]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [bookSearch, setBookSearch] = useState('')
  const [textSearch, setTextSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const [selectedBookIndex, setSelectedBookIndex] = useState(null)
  const [chapterNum, setChapterNum] = useState(1)
  const [maxChapters, setMaxChapters] = useState(0)

  const [chapter, setChapter] = useState(null)
  const [chapterLoading, setChapterLoading] = useState(false)
  const [selectedVerses, setSelectedVerses] = useState([])

  useEffect(() => {
    setVersions(getAllVersions())
    setActiveVersion(versionId)
    setLoading(true); setLoadError(null); setBooks([])
    setSelectedBookIndex(null); setChapter(null)
    getBooks(versionId)
      .then(b => { setBooks(b); setLoading(false) })
      .catch(err => { setLoadError(err.message); setLoading(false) })
  }, [versionId])

  useEffect(() => {
    if (selectedBookIndex === null) return
    getChapterCount(selectedBookIndex, versionId).then(setMaxChapters)
    setChapterNum(1); setSelectedVerses([])
  }, [selectedBookIndex, versionId])

  useEffect(() => {
    if (selectedBookIndex === null) return
    setChapterLoading(true)
    getChapter(selectedBookIndex, chapterNum, versionId)
      .then(c => { setChapter(c); setChapterLoading(false) })
      .catch(err => { setLoadError(err.message); setChapterLoading(false) })
    setSelectedVerses([])
  }, [selectedBookIndex, chapterNum, versionId])

  useEffect(() => {
    if (textSearch.length < 3) { setSearchResults([]); return }
    const t = setTimeout(() => {
      searchText(textSearch, 30, versionId).then(setSearchResults).catch(() => setSearchResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [textSearch, versionId])

  const toggleVerse = (verseNum, event) => {
    if (event?.shiftKey && selectedVerses.length > 0) {
      const anchor = selectedVerses[0]
      const [from, to] = [Math.min(anchor, verseNum), Math.max(anchor, verseNum)]
      const range = []
      for (let i = from; i <= to; i++) range.push(i)
      setSelectedVerses(range); return
    }
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedVerses(prev =>
        prev.includes(verseNum) ? prev.filter(v => v !== verseNum) : [...prev, verseNum].sort((a, b) => a - b)
      )
      return
    }
    setSelectedVerses([verseNum])
  }

  const selectAll = () => setSelectedVerses(chapter?.verses.map(v => v.verseNum) || [])
  const clearAll  = () => setSelectedVerses([])

  const addCurrentToList = () => {
    if (!chapter || selectedVerses.length === 0) return
    const versesData = chapter.verses.filter(v => selectedVerses.includes(v.verseNum))
    const combined = combineVerses(chapter.bookName, chapter.chapterNum, versesData)
    if (combined) addToSchedule({
      type: 'bible', title: combined.reference, text: combined.text, reference: combined.reference,
      meta: { bookIndex: selectedBookIndex, chapterNum, verseNums: [...selectedVerses] },
    })
  }

  useEffect(() => {
    if (!chapter || selectedVerses.length === 0) return
    const versesData = chapter.verses.filter(v => selectedVerses.includes(v.verseNum))
    const combined = combineVerses(chapter.bookName, chapter.chapterNum, versesData)
    if (combined) onSendSlide({ ...combined, type: 'bible' })
  }, [selectedVerses, chapter])

  useEffect(() => {
    if (selectedBookIndex === null || !chapter) return
    const max = chapter.verses.length
    const next = () => {
      const current = selectedVerses[0] ?? 0
      if (current < max) setSelectedVerses([current + 1])
      else if (chapterNum < maxChapters) { setChapterNum(chapterNum + 1); setSelectedVerses([1]) }
    }
    const prev = () => {
      const current = selectedVerses[0] ?? 1
      if (current > 1) setSelectedVerses([current - 1])
      else if (chapterNum > 1) setChapterNum(chapterNum - 1)
    }
    const clear = () => setSelectedVerses([])
    const offNext  = subscribe('navigate:next', next)
    const offPrev  = subscribe('navigate:prev', prev)
    const offClear = subscribe('selection:clear', clear)
    return () => { offNext(); offPrev(); offClear() }
  }, [chapter, selectedBookIndex, selectedVerses, chapterNum, maxChapters])

  const filteredBooks = useMemo(
    () => books.filter(b => b.name.toLowerCase().includes(bookSearch.toLowerCase())),
    [books, bookSearch]
  )

  const activeVersion = versions.find(v => v.id === versionId)
  const isRemote = activeVersion?.type === 'apibible'

  return (
    <div className="workspace">
      <div className="ws-header">
        <div className="ws-title">
          <h1 className="ws-h1">Biblia</h1>
          <span className="ws-sub">
            {books.length > 0 && `${books.length} libros · `}{activeVersion?.license}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={versionId} onChange={e => setVersionId(e.target.value)} className="select" style={{ height: 32 }}>
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                {v.short}{v.type === 'apibible' ? ' 🔒' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ws-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loadError && (
            <div style={{
              background: 'rgba(244, 184, 64, 0.1)', border: '1px solid rgba(244, 184, 64, 0.4)',
              borderRadius: 'var(--r-md)', padding: 12, fontSize: 13, color: 'var(--preview)',
            }}>⚠️ {loadError}</div>
          )}

          {loading && <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '16px 0' }}>Cargando {activeVersion?.short}...</div>}

          {!loading && !loadError && books.length > 0 && (
            <>
              {/* Search */}
              {!isRemote && (
                <div>
                  <div className="input-wrap">
                    <IconSearch size={15} className="input-icon" />
                    <input placeholder='Buscar texto, versículo o referencia (ej: "Juan 3:16", "gracia")'
                      value={textSearch} onChange={e => setTextSearch(e.target.value)} />
                    <span className="input-kbd"><span className="kbd">/</span></span>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="card" style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', padding: 6 }}>
                      {searchResults.map((r, i) => (
                        <div key={i}
                          onClick={() => {
                            setSelectedBookIndex(r.bookIndex)
                            setChapterNum(r.chapterNum)
                            setSelectedVerses([r.verseNum])
                            setTextSearch('')
                          }}
                          style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <p style={{ fontSize: 11, color: 'var(--copper-200)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                            {r.reference}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 0' }}>{r.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isRemote && (
                <p className="empty-text" style={{ fontStyle: 'italic' }}>
                  Búsqueda de texto deshabilitada en versiones remotas (cada consulta usa cuota de tu API key).
                </p>
              )}

              {/* Books grid */}
              <div>
                <div className="section-h">
                  <h3>Libros</h3>
                  <span className="sub">{books.length} · {activeVersion?.short}</span>
                </div>
                <div className="input-wrap" style={{ marginBottom: 10 }}>
                  <IconSearch size={14} className="input-icon" />
                  <input placeholder="Buscar libro..." value={bookSearch} onChange={e => setBookSearch(e.target.value)} />
                </div>
                <div className="book-grid" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {filteredBooks.map(book => (
                    <div key={book.index}
                      className={'book-item' + (selectedBookIndex === book.index ? ' active' : '')}
                      onClick={() => setSelectedBookIndex(book.index)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verses */}
              {selectedBookIndex !== null && (
                <div>
                  <div className="section-h" style={{ alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <h3>{books[selectedBookIndex]?.name}</h3>
                      <select value={chapterNum} onChange={e => setChapterNum(+e.target.value)} className="select" style={{ height: 28 }}>
                        {Array.from({ length: maxChapters }, (_, i) => (
                          <option key={i + 1} value={i + 1}>Capítulo {i + 1}</option>
                        ))}
                      </select>
                      {chapter && <span className="sub">{chapter.verses.length} versículos</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', marginRight: 6 }}>
                        {selectedVerses.length > 0
                          ? `${selectedVerses.length} seleccionado${selectedVerses.length > 1 ? 's' : ''}`
                          : 'Click · Shift = rango · Ctrl = agregar'}
                      </span>
                      <button className="btn btn-ghost" onClick={clearAll} disabled={selectedVerses.length === 0}>Limpiar</button>
                      <button className="btn" onClick={selectAll} disabled={!chapter}>Todos</button>
                      <button className="btn" onClick={addCurrentToList} disabled={selectedVerses.length === 0}>
                        <IconPlus size={12} /> Añadir a lista
                      </button>
                    </div>
                  </div>

                  <div className="card" style={{ padding: 8 }}>
                    {chapterLoading && (
                      <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: 24 }}>
                        {isRemote ? 'Consultando api.bible...' : 'Cargando...'}
                      </p>
                    )}
                    {!chapterLoading && chapter && (
                      <div className="verse-list">
                        {chapter.verses.map(verse => {
                          const selected = selectedVerses.includes(verse.verseNum)
                          return (
                            <div key={verse.verseNum}
                              className={'verse-row' + (selected ? ' selected' : '')}
                              onClick={(e) => toggleVerse(verse.verseNum, e)}>
                              <span className="verse-num">{verse.verseNum}</span>
                              <span className="verse-text">{verse.text}</span>
                              <span className="verse-actions" />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
