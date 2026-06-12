/**
 * SongsScreen (T10 · C2)
 *
 * Pantalla del Cantorral con DOS modos via segmented control:
 *
 * Modo "PC" (default — cero regresión sobre T10):
 *   - busqueda con debounce 300ms (useSongs)
 *   - lista de resultados con tap → SongPreviewSheet
 *   - tap en SongSectionButton → transport.send SONG_PROJECT_DIRECT
 *   - PGM_UPDATE con type:'song' resalta la seccion live
 *   - AUTH_ERROR → /pair
 *   Estados: idle | loading | results | empty | empty-catalog | error | offline.
 *
 * Modo "Mi nube" (C2 — biblioteca cloud_songs, feature Pro):
 *   Gating por estado de cuenta (useAccount):
 *     unconfigured → el segmented NO se renderiza (solo modo PC, como T10)
 *     signedOut    → card "inicia sesión" con CTA a /account
 *     free         → card upsell con CTA a pricing web (patrón AccountScreen)
 *     pro          → buscador + lista (título · autor · fecha relativa) +
 *                    "+ Nueva canción" + tap → editor + borrar con ConfirmModal
 *
 * Al volver del editor con guardado OK, consumeFlash() trae el toast de
 * éxito Y fuerza el modo nube inicial (el usuario estaba editando su
 * nube; aterrizarlo en el modo PC sería desorientador).
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatusPill from '../components/StatusPill.jsx'
import SongsSearchBar from '../components/SongsSearchBar.jsx'
import SongsResultList from '../components/SongsResultList.jsx'
import SongsEmptyState from '../components/SongsEmptyState.jsx'
import SongPreviewSheet from '../components/SongPreviewSheet.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import BigButton from '../components/BigButton.jsx'
import CloudGateCard from '../components/CloudGateCard.jsx'
import { transport, ClientCommand, ServerEvent } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { useSongs } from '../hooks/useSongs.js'
import { useSong } from '../hooks/useSong.js'
import { useAccount } from '../hooks/useAccount.js'
import { useCloudSongs } from '../hooks/useCloudSongs.js'
import { AccountStatus } from '../services/account.js'
import * as cloudSongs from '../services/cloudSongs.js'
import { consumeFlash } from '../services/flashMessage.js'
import { tapLight, tapMedium } from '../services/haptics.js'
import { useT } from '../hooks/useT.js'
import { t as tGlobal } from '../services/i18n.js'

// Mismo destino y patrón de link externo que AccountScreen.
const PRICING_URL = 'https://eclesia-presenter.vercel.app/pricing'

function openExternal(url) {
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    // WebView sin window.open: no crasheamos
  }
}

export default function SongsScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const { isConnected, isConnecting } = useConnection()
  const account = useAccount()
  const {
    query, setQuery, status, items, total, error, retry, reset,
  } = useSongs()
  const [selectedId, setSelectedId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Flash one-shot del editor (guardado OK) → toast + arrancar en nube.
  const [flash] = useState(() => consumeFlash())
  const [mode, setMode] = useState(flash ? 'cloud' : 'pc')
  const [toast, setToast] = useState(flash || null)
  const [livePgm, setLivePgm] = useState(null)  // { songId, sectionId }
  const mountedRef = useRef(true)
  const { song: detail, status: detailStatus } = useSong(sheetOpen ? selectedId : null)

  const cloudAvailable = account.status !== AccountStatus.UNCONFIGURED
  const cloudMode = cloudAvailable && mode === 'cloud'

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
    setToast(t('songs.toastProjected', { title: detail.title, section: section.label }))
    // NO cerramos el sheet: workflow en directo el operador suele saltar
    // entre secciones de la misma cancion.
  }

  function handleClearLive() {
    if (!isConnected) return
    tapMedium()
    transport.send({ type: ClientCommand.CLEAR })
    setToast(t('songs.toastCleared'))
  }

  // Subtitle dinamico segun status (modo PC) o fijo (modo nube).
  const resultCount = total || items.length
  const pcSubtitle = !isConnected
    ? (isConnecting ? t('songs.reconnecting') : t('songs.offline'))
    : status === 'loading'
      ? t('songs.searching')
      : status === 'results'
        ? t(resultCount === 1 ? 'songs.totalCount' : 'songs.totalCountPlural', { n: resultCount })
        : status === 'empty'
          ? t('songs.noResults')
          : status === 'empty-catalog'
            ? t('songs.emptyCatalog')
            : status === 'error'
              ? errorSubtitle(error)
              : t('songs.subtitleIdle')
  const subtitle = cloudMode ? t('cloudSongs.subtitle') : pcSubtitle

  function handlePickMode(next) {
    if (next === mode) return
    tapLight()
    setMode(next)
  }

  return (
    <div
      className="px-4 pb-4 flex flex-col gap-4 min-h-full"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">{t('songs.title')}</h1>
          <p className="text-xs text-ink-3 mt-0.5" aria-live="polite">
            {subtitle}
          </p>
        </div>
        <StatusPill />
      </header>

      {/* Segmented PC | Mi nube — oculto si la build no trae Supabase. */}
      {cloudAvailable && (
        <div
          role="radiogroup"
          aria-label={t('cloudSongs.modeAria')}
          className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-bg-2 border border-line-1"
        >
          {[
            { id: 'pc', label: t('cloudSongs.modePc') },
            { id: 'cloud', label: t('cloudSongs.modeCloud') },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={mode === opt.id}
              onClick={() => handlePickMode(opt.id)}
              className={
                'min-h-[44px] rounded-lg text-sm font-medium transition-colors '
                + (mode === opt.id
                  ? 'bg-copper-300/15 text-copper-100 ring-1 ring-copper-300/30'
                  : 'text-ink-3 hover:text-ink-2 hover:bg-white/5')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {!cloudMode && (
        <>
          {!isConnected && (
            <div
              className="rounded-lg bg-bg-2 border border-line-1 p-3 text-center text-sm text-ink-3"
              role="alert"
            >
              {isConnecting
                ? t('songs.reconnecting')
                : t('songs.offlineCache')}
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
                message={t('songs.emptyMessage')}
                hint={t('songs.emptyHint')}
              />
            )}
            {status === 'empty-catalog' && (
              <SongsEmptyState
                variant="empty-catalog"
                message={t('songs.emptyCatalogMessage')}
                hint={t('songs.emptyCatalogHint')}
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
                      {t('common.retry')}
                    </button>
                  )
                }
              />
            )}
          </div>
        </>
      )}

      {cloudMode && (
        <div className="flex-1 min-h-[140px]">
          {account.status === AccountStatus.LOADING && (
            <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center text-sm text-ink-3">
              {t('cloudSongs.loading')}
            </div>
          )}
          {(account.status === AccountStatus.SIGNED_OUT
            || account.status === AccountStatus.PENDING_CODE) && (
            <CloudGateCard
              title={t('cloudSongs.signInTitle')}
              body={t('cloudSongs.signInBody')}
              cta={t('cloudSongs.signInCta')}
              ctaAria={t('cloudSongs.signInAria')}
              onCta={() => nav('/account')}
            />
          )}
          {account.status === AccountStatus.SIGNED_IN && !account.isPro && (
            <CloudGateCard
              title={t('cloudSongs.upsellTitle')}
              body={t('cloudSongs.upsellBody')}
              cta={t('cloudSongs.upsellCta')}
              ctaAria={t('cloudSongs.upsellAria')}
              onCta={() => openExternal(PRICING_URL)}
            />
          )}
          {account.status === AccountStatus.SIGNED_IN && account.isPro && (
            <CloudSongsPane
              onToast={setToast}
              onEdit={(id) => nav(`/songs/cloud/${id}`)}
              onCreate={() => nav('/songs/cloud/new')}
            />
          )}
        </div>
      )}

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

// Codigos con string dedicado en el dict (songs.err.* / songs.errMsg.*);
// cualquier otro cae al generico *.unknown.
const ERR_SUBTITLE_CODES = new Set(['auth_error', 'rate_limited', 'offline', 'not_found'])

function errorSubtitle(err) {
  const code = ERR_SUBTITLE_CODES.has(err?.code) ? err.code : 'unknown'
  return tGlobal(`songs.err.${code}`)
}

const ERR_MSG_CODES = new Set(['auth_error', 'rate_limited', 'offline', 'no_credentials'])

function errorMessage(err) {
  const code = ERR_MSG_CODES.has(err?.code) ? err.code : 'unknown'
  if (code === 'rate_limited') {
    const sec = err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : 60
    return tGlobal('songs.errMsg.rate_limited', { sec })
  }
  return tGlobal(`songs.errMsg.${code}`)
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

/* ============================================================== */
/* Modo "Mi nube" (C2)                                             */
/* ============================================================== */

// La card de gating (inicia sesión / upsell Pro) se extrajo a
// components/CloudGateCard.jsx en C3a — PlannerListScreen la comparte.

const CLOUD_ERR_CODES = new Set(['network', 'unauthorized', 'not_found', 'validation', 'unknown'])

function cloudErrText(code) {
  return tGlobal(`cloudSongs.err.${CLOUD_ERR_CODES.has(code) ? code : 'unknown'}`)
}

// Fecha relativa de edición ("hace 5 min", "hace 3 días", o fecha corta).
function relativeTime(iso, t) {
  const ts = Date.parse(iso || '')
  if (!Number.isFinite(ts)) return ''
  const diffMin = Math.floor((Date.now() - ts) / 60000)
  if (diffMin < 1) return t('cloudSongs.time.now')
  if (diffMin < 60) return t('cloudSongs.time.minutes', { n: diffMin })
  const h = Math.floor(diffMin / 60)
  if (h < 24) return t('cloudSongs.time.hours', { n: h })
  const d = Math.floor(h / 24)
  if (d < 7) return t('cloudSongs.time.days', { n: d })
  return new Date(ts).toLocaleDateString()
}

// Biblioteca cloud del usuario Pro: buscador + lista + crear + borrar.
// Componente separado para que useCloudSongs solo corra cuando el modo
// nube está activo Y el usuario es Pro (los hooks no pueden ser
// condicionales, los componentes sí).
function CloudSongsPane({ onToast, onEdit, onCreate }) {
  const { t } = useT()
  const { search, setSearch, status, items, error, refetch } = useCloudSongs()
  const [pendingDelete, setPendingDelete] = useState(null) // { id, title }

  function handleTapRow(id) {
    tapLight()
    onEdit(id)
  }

  async function handleDeleteConfirm() {
    const target = pendingDelete
    if (!target) return
    tapMedium()
    const res = await cloudSongs.remove(target.id)
    setPendingDelete(null)
    if (res.ok) {
      onToast(t('cloudSongs.deleted'))
      refetch()
    } else {
      onToast(cloudErrText(res.error))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BigButton onClick={() => { tapLight(); onCreate() }} aria-label={t('cloudSongs.newAria')}>
        {t('cloudSongs.new')}
      </BigButton>

      <SongsSearchBar
        value={search}
        onChange={setSearch}
        onClear={() => setSearch('')}
        loading={status === 'loading'}
        placeholder={t('cloudSongs.searchPlaceholder')}
      />

      {status === 'loading' && <SkeletonRows />}

      {status === 'results' && (
        <ul className="flex flex-col gap-2" aria-label={t('cloudSongs.modeCloud')}>
          {items.map((song) => (
            <li key={song.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => handleTapRow(song.id)}
                aria-label={t('cloudSongs.rowAria', { title: song.title })}
                className="flex-1 min-w-0 text-left rounded-xl bg-bg-2 border border-line-1 px-4 py-3
                           hover:bg-bg-3 active:scale-[0.99] transition"
              >
                <span className="block text-base text-ink-1 truncate">{song.title}</span>
                <span className="block text-xs text-ink-3 truncate mt-0.5">
                  {[song.author, relativeTime(song.updated_at, t)].filter(Boolean).join(' · ')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => { tapLight(); setPendingDelete({ id: song.id, title: song.title }) }}
                aria-label={t('cloudSongs.deleteAria', { title: song.title })}
                className="w-12 grid place-items-center rounded-xl bg-bg-2 border border-line-1
                           text-ink-3 hover:text-live hover:bg-live/10 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true" className="h-5 w-5"
                >
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'empty' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-1">
          <p className="text-sm text-ink-2">
            {search.trim() ? t('cloudSongs.emptySearch') : t('cloudSongs.empty')}
          </p>
          {!search.trim() && (
            <p className="text-xs text-ink-4">{t('cloudSongs.emptyHint')}</p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-3" role="alert">
          <p className="text-sm text-ink-2">{cloudErrText(error?.code)}</p>
          <button
            type="button"
            onClick={refetch}
            className="h-10 px-4 rounded-lg bg-bg-3 text-ink-1 text-sm font-medium hover:bg-bg-2 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        variant="danger"
        title={t('cloudSongs.deleteConfirmTitle')}
        message={t('cloudSongs.deleteConfirmBody')}
        confirmLabel={t('cloudSongs.deleteConfirmCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
