/**
 * BibleScreen (T9)
 *
 * Pantalla funcional de Biblia en el remoto móvil:
 *   - input de búsqueda con debounce 300ms (useBibleSearch)
 *   - chips de referencias frecuentes (visibles solo en idle)
 *   - lista de resultados con tap → BiblePreviewSheet
 *   - botón "Proyectar" en el sheet → transport.send BIBLE_PROJECT_DIRECT
 *
 * El server resuelve la búsqueda vía /api/bible/search (Bearer auth +
 * rate-limit). El mobile NO carga los JSON locales — bundle slim. Cuando
 * el operador da a Proyectar, el WS forwardea el slide armado y el
 * renderer del PC llama setLive directamente (sin re-buscar).
 *
 * Estados: idle | loading | results | empty | error | offline | sheetOpen.
 * aria-live anuncia el cambio de status para screen readers.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatusPill from '../components/StatusPill.jsx'
import BibleSearchBar from '../components/BibleSearchBar.jsx'
import BibleQuickChips from '../components/BibleQuickChips.jsx'
import BibleResultList from '../components/BibleResultList.jsx'
import BiblePreviewSheet from '../components/BiblePreviewSheet.jsx'
import BibleEmptyState from '../components/BibleEmptyState.jsx'
import { transport, ClientCommand, ServerEvent } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { useBibleSearch } from '../hooks/useBibleSearch.js'
import { tapLight, tapMedium } from '../services/haptics.js'

export default function BibleScreen() {
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  const {
    query, setQuery, status, results, mode, error, retry, reset,
  } = useBibleSearch()
  const [selected, setSelected] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const mountedRef = useRef(true)

  // AUTH_ERROR → nav /pair y disconnect. Mismo patrón que ServiceScreen.
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

  // Si el hook devuelve error de auth (401), también navegamos.
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

  function handlePickChip(chip) {
    setQuery(chip)
  }

  function handleTapResult(item) {
    if (!item) return
    tapLight()
    setSelected(item)
    setSheetOpen(true)
  }

  function handleCloseSheet() {
    setSheetOpen(false)
    // Mantenemos selected para que la animación no flashea — se limpia
    // al abrir uno nuevo.
  }

  function handleProject(item) {
    if (!isConnected || !item) return
    tapMedium()
    transport.send({
      type: ClientCommand.BIBLE_PROJECT_DIRECT,
      payload: {
        reference: item.reference,
        text: item.text,
        version: 'rvr1960',
        bookIndex: item.bookIndex,
        chapterNum: item.chapter,
        verseNum: item.verse,
        verseEnd: item.verseEnd || null,
      },
    })
    setSheetOpen(false)
    setToast(`Proyectado: ${item.reference}`)
  }

  // Subtitle dinámico del header según status
  const subtitle = !isConnected
    ? (isConnecting ? 'Reconectando con el PC…' : 'Sin conexión con el PC')
    : status === 'loading'
      ? 'Buscando…'
      : status === 'results'
        ? `${results.length} resultado${results.length === 1 ? '' : 's'}`
        : status === 'empty'
          ? 'Sin resultados'
          : status === 'error'
            ? errorSubtitle(error)
            : 'Buscar y proyectar versículos'

  return (
    <div
      className="px-4 pb-4 flex flex-col gap-4 min-h-full"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">Biblia</h1>
          <p className="text-xs text-ink-3 mt-0.5" aria-live="polite">
            {subtitle}
          </p>
        </div>
        <StatusPill />
      </header>

      {/* Offline banner */}
      {!isConnected && (
        <div
          className="rounded-lg bg-bg-2 border border-line-1 p-3 text-center text-sm text-ink-3"
          role="alert"
        >
          {isConnecting
            ? 'Reconectando con el PC…'
            : 'Sin conexión con el PC. Comprueba la WiFi.'}
        </div>
      )}

      {/* Input */}
      <BibleSearchBar
        value={query}
        onChange={setQuery}
        onClear={reset}
        loading={status === 'loading'}
        disabled={!isConnected}
      />

      {/* Chips solo en idle */}
      {status === 'idle' && (
        <BibleQuickChips onPick={handlePickChip} disabled={!isConnected} />
      )}

      {/* Resultados / estados vacíos */}
      <div className="flex-1 min-h-[140px]">
        {status === 'idle' && (
          <BibleEmptyState
            variant="idle"
            message="Escribe una referencia o palabras clave"
            hint="Ej: Juan 3:16, salmos 23, amor de Dios"
          />
        )}
        {status === 'loading' && <SkeletonRows />}
        {status === 'results' && (
          <BibleResultList results={results} mode={mode} onTap={handleTapResult} />
        )}
        {status === 'empty' && (
          <BibleEmptyState
            variant="empty"
            message="No encontramos versículos para tu búsqueda"
            hint="Prueba con otra referencia o palabra clave"
          />
        )}
        {status === 'error' && (
          <BibleEmptyState
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

      {/* Toast aria-live */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {toast || ''}
      </div>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-bg-3 border border-copper-200/40 text-ink-1 px-4 py-2 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Preview sheet */}
      <BiblePreviewSheet
        open={sheetOpen}
        item={selected}
        isConnected={isConnected}
        onClose={handleCloseSheet}
        onProject={handleProject}
      />
    </div>
  )
}

function errorSubtitle(err) {
  switch (err?.code) {
    case 'auth_error': return 'Sesión expirada'
    case 'rate_limited': return 'Demasiadas búsquedas'
    case 'offline': return 'Sin respuesta del PC'
    case 'q_too_short': return 'Escribe al menos 3 letras'
    case 'book_not_found': return 'Libro no reconocido'
    case 'reference_not_found': return 'Referencia fuera de rango'
    default: return 'Error en la búsqueda'
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
    case 'q_too_short':
      return 'Escribe al menos 3 letras o una referencia (Juan 3:16).'
    case 'book_not_found':
      return 'No reconocemos ese libro. Prueba con el nombre completo.'
    case 'reference_not_found':
      return 'Esa referencia no existe en esta versión.'
    case 'no_credentials':
      return 'No hay credenciales guardadas. Vuelve a parear.'
    default:
      return 'No pudimos completar la búsqueda.'
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
