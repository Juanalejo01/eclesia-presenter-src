/**
 * SongsScreen (T10)
 *
 * Pantalla funcional del Cantorral remoto:
 *   - busqueda con debounce 300ms (useSongs)
 *   - lista de resultados con tap → SongPreviewSheet
 *   - tap en SongSectionButton → transport.send SONG_PROJECT_DIRECT
 *   - PGM_UPDATE con type:'song' resalta la seccion live
 *   - AUTH_ERROR → /pair
 *
 * Estados: idle | loading | results | empty | empty-catalog | error | offline.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatusPill from '../components/StatusPill.jsx'
import SongsSearchBar from '../components/SongsSearchBar.jsx'
import SongsResultList from '../components/SongsResultList.jsx'
import SongsEmptyState from '../components/SongsEmptyState.jsx'
import SongPreviewSheet from '../components/SongPreviewSheet.jsx'
import { transport, ClientCommand, ServerEvent } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { useSongs } from '../hooks/useSongs.js'
import { useSong } from '../hooks/useSong.js'
import { tapLight, tapMedium } from '../services/haptics.js'

export default function SongsScreen() {
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  const {
    query, setQuery, status, items, total, error, retry, reset,
  } = useSongs()
  const [selectedId, setSelectedId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [livePgm, setLivePgm] = useState(null)  // { songId, sectionId }
  const mountedRef = useRef(true)
  const { song: detail, status: detailStatus } = useSong(sheetOpen ? selectedId : null)

  // AUTH_ERROR del transport → /pair.
  useEffect(() => {
    mountedRef.current = true
    const offAuth = transport.subscribe(ServerEvent.AUTH_ERROR, () => {
      if (!mountedRef.current) return
      transport.disconnect()
      nav('/pair', { replace: true })
    })
    return () => {
      mountedRef.current = false
      try { offAuth() } catch {}
    }
  }, [nav])

  // PGM_UPDATE con type:'song' → resalta seccion live en el sheet.
  useEffect(() => {
    const off = transport.subscribe(ServerEvent.PGM_UPDATE, (payload) => {
      if (!mountedRef.current) return
      if (payload && payload.type === 'song' && payload.meta?.songId != null) {
        setLivePgm({
          songId: Number(payload.meta.songId),
          sectionId: typeof payload.meta.sectionId === 'string' ? payload.meta.sectionId : null,
        })
      } else {
        setLivePgm(null)
      }
    })
    return off
  }, [])

  // Si el hook devuelve auth_error tambien navegamos.
  useEffect(() => {
    if (status === 'error' && error?.code === 'auth_error') {
      transport.disconnect()
      nav('/pair', { replace: true })
    }
  }, [status, error, nav])

  // Auto-clear del toast tras 2s.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  function handleTapRow(song) {
    if (!song) return
    tapLight()
    setSelectedId(song.id)
    setSheetOpen(true)
  }

  function handleCloseSheet() {
    setSheetOpen(false)
    // No limpiamos selectedId para que la transicion no parpadee.
  }

  function handleProjectSection(section) {
    if (!isConnected || !section || !detail) return
    tapMedium()
    const reference = `${detail.title} · ${section.label}`.slice(0, 200)
    transport.send({
      type: ClientCommand.SONG_PROJECT_DIRECT,
      payload: {
        songId: detail.id,
        sectionId: section.sectionId,
        text: section.text,
        reference,
      },
    })
    setToast(`Proyectado: ${detail.title} · ${section.label}`)
    // NO cerramos el sheet: workflow en directo el operador suele saltar
    // entre secciones de la misma cancion.
  }

  function handleClearLive() {
    if (!isConnected) return
    tapMedium()
    transport.send({ type: ClientCommand.CLEAR })
    setToast('Live limpiado')
  }

  // Subtitle dinamico segun status.
  const subtitle = !isConnected
    ? (isConnecting ? 'Reconectando con el PC…' : 'Sin conexión con el PC')
    : status === 'loading'
      ? 'Buscando…'
      : status === 'results'
        ? `${total || items.length} ${(total || items.length) === 1 ? 'canción' : 'canciones'}`
        : status === 'empty'
          ? 'Sin resultados'
          : status === 'empty-catalog'
            ? 'Repertorio vacío'
            : status === 'error'
              ? errorSubtitle(error)
              : 'Repertorio · Buscar y proyectar'

  return (
    <div
      className="px-4 pb-4 flex flex-col gap-4 min-h-full"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">Canciones</h1>
          <p className="text-xs text-ink-3 mt-0.5" aria-live="polite">
            {subtitle}
          </p>
        </div>
        <StatusPill />
      </header>

      {!isConnected && (
        <div
          className="rounded-lg bg-bg-2 border border-line-1 p-3 text-center text-sm text-ink-3"
          role="alert"
        >
          {isConnecting
            ? 'Reconectando con el PC…'
            : 'Sin conexión con el PC. Mostrando caché si la hay.'}
        </div>
      )}

      <SongsSearchBar
        value={query}
        onChange={setQuery}
        onClear={reset}
        loading={status === 'loading'}
        disabled={!isConnected}
      />

      <div className="flex-1 min-h-[140px]">
        {status === 'loading' && <SkeletonRows />}
        {status === 'results' && (
          <SongsResultList items={items} onTap={handleTapRow} />
        )}
        {status === 'empty' && (
          <SongsEmptyState
            variant="empty"
            message="No encontramos coincidencias"
            hint="Prueba con otro título, autor o palabra de la letra"
          />
        )}
        {status === 'empty-catalog' && (
          <SongsEmptyState
            variant="empty-catalog"
            message="No hay canciones en el repertorio"
            hint="Añade canciones desde el PC para verlas aquí"
          />
        )}
        {status === 'error' && (
          <SongsEmptyState
            variant="error"
            message={errorMessage(error)}
            action={
              error?.code !== 'auth_error' && (
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 h-10 px-4 rounded-lg bg-bg-3 text-ink-1 text-sm font-medium hover:bg-bg-2 transition-colors"
                >
                  Reintentar
                </button>
              )
            }
          />
        )}
      </div>

      {/* Toast aria-live + visual */}
      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
        {toast || ''}
      </div>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-bg-3 border border-copper-200/40 text-ink-1 px-4 py-2 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}

      <SongPreviewSheet
        open={sheetOpen}
        song={detail}
        loading={detailStatus === 'loading'}
        isConnected={isConnected}
        livePgm={livePgm}
        onClose={handleCloseSheet}
        onProjectSection={handleProjectSection}
        onClearLive={handleClearLive}
      />
    </div>
  )
}

function errorSubtitle(err) {
  switch (err?.code) {
    case 'auth_error':   return 'Sesión expirada'
    case 'rate_limited': return 'Demasiadas búsquedas'
    case 'offline':      return 'Sin respuesta del PC'
    case 'not_found':    return 'No encontrada'
    default:             return 'Error al buscar'
  }
}

function errorMessage(err) {
  switch (err?.code) {
    case 'auth_error':
      return 'Sesión expirada. Vuelve a parear este mando.'
    case 'rate_limited': {
      const sec = err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : 60
      return `Demasiadas búsquedas. Espera ${sec}s e inténtalo de nuevo.`
    }
    case 'offline':
      return 'Sin respuesta del PC. Comprueba la WiFi.'
    case 'no_credentials':
      return 'No hay credenciales guardadas. Vuelve a parear.'
    default:
      return 'No pudimos cargar el repertorio.'
  }
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="h-16 rounded-xl bg-bg-2 border border-line-1 animate-pulse"
        />
      ))}
    </div>
  )
}
