// Cache de estado por sesión para BiblePanel y SongsPanel.
//
// Los paneles se desmontan al cambiar de panel en el sidebar. Para que el
// usuario pueda volver y CONTINUAR donde lo dejó (libro, capítulo, versículo,
// historial...) guardamos las claves relevantes a nivel módulo.
//
// El estado SOLO vive en memoria — al cerrar la app o recargar el renderer
// se pierde. Es intencional: cada sesión empieza limpia.
//
// Uso:
//   const initial = getBibleCache()
//   const [step, setStep] = useState(initial.step)
//   useEffect(() => { updateBibleCache({ step }) }, [step])

// ─────────────────────────────────────────────────────────────
// BIBLIA
// ─────────────────────────────────────────────────────────────

let _bible = {
  selectedBookIndex: null,
  chapterNum: 1,
  step: 'book',                 // 'book' | 'chapter' | 'verse'
  selectedVerses: [],
  bookSearch: '',
  verseHistory: [],
  // NOTA: 'chapter' (objeto con verses) NO se cachea — se re-carga
  // de los servicios cuando selectedBookIndex+chapterNum se restauran.
}

export function getBibleCache() { return _bible }
export function updateBibleCache(patch) { _bible = { ..._bible, ...patch } }
export function resetBibleCache() {
  _bible = {
    selectedBookIndex: null,
    chapterNum: 1,
    step: 'book',
    selectedVerses: [],
    bookSearch: '',
    verseHistory: [],
  }
}

// ─────────────────────────────────────────────────────────────
// CANCIONES
// ─────────────────────────────────────────────────────────────

let _songs = {
  selectedId: null,             // id de la canción expandida
  sectionIndex: 0,              // sección actualmente proyectada
  slideIndex: 0,                // sub-slide dentro de esa sección
  search: '',                   // búsqueda activa en col 1
}

export function getSongsCache() { return _songs }
export function updateSongsCache(patch) { _songs = { ..._songs, ...patch } }
export function resetSongsCache() {
  _songs = { selectedId: null, sectionIndex: 0, slideIndex: 0, search: '' }
}
