/**
 * PlannerListScreen (C3a) — ruta /plans
 *
 * Planificador de listas del día cloud (feature Pro): el usuario arma
 * el culto desde el móvil ("Culto 15 junio": canciones de su nube +
 * versículos + notas) y el desktop la importará al llegar a la iglesia
 * (C3b). Esta pantalla es el índice de listas.
 *
 * Gating x4 estados de cuenta (mismo patrón que el modo nube de
 * SongsScreen / C2, con CloudGateCard compartida):
 *   unconfigured → card "no disponible en esta build" (sin CTA)
 *   signedOut / pendingCode → card "inicia sesión" con CTA a /account
 *   free → card upsell con CTA a pricing web
 *   pro → lista de planes (título, fecha por locale via Intl, nº items,
 *         badge "Plantilla") ordenados por updated_at desc (lo hace el
 *         servicio) + "+ Nueva lista" + tap → editor + borrar con
 *         ConfirmModal danger.
 *
 * Al volver del editor con guardado OK, consumeFlash() trae el toast de
 * éxito (mismo mecanismo one-shot que SongsScreen/C2).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton.jsx'
import CloudGateCard from '../components/CloudGateCard.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import { useAccount } from '../hooks/useAccount.js'
import { useCloudSchedules } from '../hooks/useCloudSchedules.js'
import { AccountStatus } from '../services/account.js'
import * as cloudSchedules from '../services/cloudSchedules.js'
import { consumeFlash } from '../services/flashMessage.js'
import { tapLight, tapMedium } from '../services/haptics.js'
import { useT } from '../hooks/useT.js'
import { t as tGlobal, getLocale } from '../services/i18n.js'

// Mismo destino y patrón de link externo que SongsScreen/AccountScreen.
const PRICING_URL = 'https://eclesia-presenter.vercel.app/pricing'

function openExternal(url) {
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    // WebView sin window.open: no crasheamos
  }
}

const PLANNER_ERR_CODES = new Set(['network', 'unauthorized', 'not_found', 'validation', 'unknown'])

export function plannerErrText(code) {
  return tGlobal(`planner.err.${PLANNER_ERR_CODES.has(code) ? code : 'unknown'}`)
}

/**
 * Formatea service_date ('YYYY-MM-DD') con Intl.DateTimeFormat(locale).
 * Parse manual a Date LOCAL — new Date('YYYY-MM-DD') interpreta UTC y en
 * timezones negativas mostraría el día anterior.
 */
export function formatServiceDate(dateStr, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''))
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  } catch {
    return dateStr
  }
}

export default function PlannerListScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const account = useAccount()
  // Flash one-shot del editor (guardado OK) → toast.
  const [flash] = useState(() => consumeFlash())
  const [toast, setToast] = useState(flash || null)

  // Auto-clear del toast tras 2s.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(timer)
  }, [toast])

  const isPro = account.status === AccountStatus.SIGNED_IN && account.isPro

  return (
    <div
      className="px-4 pb-24 flex flex-col gap-4 min-h-full"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { tapLight(); nav(-1) }}
          aria-label={t('planner.backAria')}
          className="min-w-[44px] min-h-[44px] -ml-2 grid place-items-center rounded-lg
                     text-ink-2 hover:bg-bg-2 transition-colors text-xl"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink-1">{t('planner.title')}</h1>
          <p className="text-xs text-ink-3 mt-0.5">{t('planner.subtitle')}</p>
        </div>
      </header>

      <div className="flex-1 min-h-[140px]">
        {account.status === AccountStatus.UNCONFIGURED && (
          <section
            aria-label={t('account.unavailable')}
            className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-1"
          >
            <p className="text-sm text-ink-2">{t('account.unavailable')}</p>
            <p className="text-xs text-ink-4">{t('account.unavailableHint')}</p>
          </section>
        )}
        {account.status === AccountStatus.LOADING && (
          <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center text-sm text-ink-3">
            {t('planner.loading')}
          </div>
        )}
        {(account.status === AccountStatus.SIGNED_OUT
          || account.status === AccountStatus.PENDING_CODE) && (
          <CloudGateCard
            title={t('planner.signInTitle')}
            body={t('planner.signInBody')}
            cta={t('planner.signInCta')}
            ctaAria={t('planner.signInAria')}
            onCta={() => nav('/account')}
          />
        )}
        {account.status === AccountStatus.SIGNED_IN && !account.isPro && (
          <CloudGateCard
            title={t('planner.upsellTitle')}
            body={t('planner.upsellBody')}
            cta={t('planner.upsellCta')}
            ctaAria={t('planner.upsellAria')}
            onCta={() => openExternal(PRICING_URL)}
          />
        )}
        {isPro && (
          <PlannerPane
            onToast={setToast}
            onOpen={(id) => nav(`/plans/${id}`)}
            onCreate={() => nav('/plans/new')}
          />
        )}
      </div>

      {/* Toast aria-live + visual (patrón SongsScreen) */}
      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
        {toast || ''}
      </div>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-bg-3 border border-copper-200/40 text-ink-1 px-4 py-2 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

// Pane separado para que useCloudSchedules solo corra cuando el usuario
// es Pro (los hooks no pueden ser condicionales, los componentes sí).
function PlannerPane({ onToast, onOpen, onCreate }) {
  const { t } = useT()
  const { status, items, error, refetch } = useCloudSchedules()
  const [pendingDelete, setPendingDelete] = useState(null) // { id, title }
  const locale = getLocale()

  async function handleDeleteConfirm() {
    const target = pendingDelete
    if (!target) return
    tapMedium()
    const res = await cloudSchedules.remove(target.id)
    setPendingDelete(null)
    if (res.ok) {
      onToast(t('planner.deleted'))
      refetch()
    } else {
      onToast(plannerErrText(res.error))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BigButton onClick={() => { tapLight(); onCreate() }} aria-label={t('planner.newAria')}>
        {t('planner.new')}
      </BigButton>

      {status === 'loading' && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-bg-2 border border-line-1 animate-pulse" />
          ))}
        </div>
      )}

      {status === 'results' && (
        <ul className="flex flex-col gap-2" aria-label={t('planner.title')}>
          {items.map((plan) => {
            const n = Number(plan.items_count) || 0
            const meta = [
              plan.service_date ? formatServiceDate(plan.service_date, locale) : t('planner.noDate'),
              t(n === 1 ? 'planner.itemCount' : 'planner.itemCountPlural', { n }),
            ].join(' · ')
            return (
              <li key={plan.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => { tapLight(); onOpen(plan.id) }}
                  aria-label={t('planner.rowAria', { title: plan.title })}
                  className="flex-1 min-w-0 text-left rounded-xl bg-bg-2 border border-line-1 px-4 py-3
                             hover:bg-bg-3 active:scale-[0.99] transition"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base text-ink-1 truncate">{plan.title}</span>
                    {plan.is_template && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-copper-300/15 text-copper-100 text-[10px] font-mono uppercase tracking-wider">
                        {t('planner.templateBadge')}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-3 truncate mt-0.5">{meta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { tapLight(); setPendingDelete({ id: plan.id, title: plan.title }) }}
                  aria-label={t('planner.deleteAria', { title: plan.title })}
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
            )
          })}
        </ul>
      )}

      {status === 'empty' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-1">
          <p className="text-sm text-ink-2">{t('planner.empty')}</p>
          <p className="text-xs text-ink-4">{t('planner.emptyHint')}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-bg-2 border border-line-1 p-5 text-center space-y-3" role="alert">
          <p className="text-sm text-ink-2">{plannerErrText(error?.code)}</p>
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
        title={t('planner.deleteConfirmTitle')}
        message={t('planner.deleteConfirmBody')}
        confirmLabel={t('planner.deleteConfirmCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
