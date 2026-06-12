/**
 * AccountScreen (C1) — ruta /account, subpantalla de Más.
 *
 * Login OTP por email (mismo flujo que web/app/login/login-form.jsx:
 * signInWithOtp → código de 6 dígitos → verifyOtp) + visualización del
 * plan Free/Pro. Todo el estado vive en services/account.js; esta
 * pantalla es presentacional + inputs locales.
 *
 * Estados (account.status):
 *   unconfigured — build sin credenciales Supabase: mensaje gris benigno
 *                  (no error), sin formularios.
 *   signedOut    — card brand con beneficio + email + CTA enviar código.
 *   pendingCode  — input de 6 dígitos (inputMode numeric, autoComplete
 *                  one-time-code) + verificar + reenviar + cambiar email.
 *   signedIn     — email + badge de plan (Free gris / PRO cobre),
 *                  gestionar cuenta (web), upsell si Free, cerrar sesión
 *                  con ConfirmModal.
 *
 * a11y: los errores se anuncian en un live region (role=status +
 * aria-live=polite) SIEMPRE montado — montar el contenedor junto con el
 * error hace que algunos screen readers se lo pierdan.
 *
 * Links externos: el mobile no tenía patrón previo — window.open con
 * noopener (en Capacitor abre el browser del sistema; en PWA, pestaña).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MoreSection from '../components/MoreSection.jsx'
import BigButton from '../components/BigButton.jsx'
import FormField from '../components/FormField.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import PlanBadge from '../components/PlanBadge.jsx'
import { account, AccountStatus } from '../services/account.js'
import { useAccount } from '../hooks/useAccount.js'
import { useT } from '../hooks/useT.js'

const MANAGE_URL = 'https://eclesia-presenter.vercel.app/cuenta'
const PRICING_URL = 'https://eclesia-presenter.vercel.app/pricing'

function openExternal(url) {
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    // WebView sin window.open: no hay fallback razonable, no crasheamos
  }
}

export default function AccountScreen() {
  const { t } = useT()
  const nav = useNavigate()
  const { status, email, plan, isPro, error } = useAccount()

  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resent, setResent] = useState(false)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)

  async function handleSendCode(e) {
    e?.preventDefault?.()
    if (submitting) return
    setSubmitting(true)
    setResent(false)
    await account.requestCode(emailInput)
    setSubmitting(false)
  }

  async function handleVerify(e) {
    e?.preventDefault?.()
    if (submitting) return
    setSubmitting(true)
    const { ok } = await account.verifyCode(email, codeInput)
    setSubmitting(false)
    if (ok) setCodeInput('')
  }

  async function handleResend() {
    if (submitting) return
    setSubmitting(true)
    setResent(false)
    const { ok } = await account.requestCode(email)
    setSubmitting(false)
    if (ok) setResent(true)
  }

  function handleChangeEmail() {
    setCodeInput('')
    setResent(false)
    account.backToEmail()
  }

  async function handleSignOutConfirm() {
    setSignOutConfirmOpen(false)
    await account.signOut()
  }

  const errorText = error ? t(`account.err.${error}`) : null

  return (
    <div
      className="px-4 pb-24 space-y-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
    >
      {/* Header con back a Más (subpantalla, BottomNav sigue visible). */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => nav('/more')}
          aria-label={t('account.backAria')}
          className="min-w-[44px] min-h-[44px] -ml-2 grid place-items-center rounded-lg
                     text-ink-2 hover:bg-bg-2 transition-colors text-xl"
        >
          ←
        </button>
        <div>
          <h1 className="font-display text-3xl text-ink-1">{t('account.title')}</h1>
          <p className="text-sm text-ink-3 mt-0.5">{t('account.subtitle')}</p>
        </div>
      </header>

      {/* Live region SIEMPRE montada (ver doc-block a11y). */}
      <p role="status" aria-live="polite" className="sr-only">
        {errorText || ''}
      </p>

      {status === AccountStatus.UNCONFIGURED && (
        <MoreSection title={t('account.title')}>
          <p className="text-sm text-ink-3">{t('account.unavailable')}</p>
          <p className="text-xs text-ink-4">{t('account.unavailableHint')}</p>
        </MoreSection>
      )}

      {status === AccountStatus.LOADING && (
        <MoreSection title={t('account.title')}>
          <p className="text-sm text-ink-3">{t('account.loading')}</p>
        </MoreSection>
      )}

      {status === AccountStatus.SIGNED_OUT && (
        <section
          aria-label={t('account.title')}
          className="border border-copper-300/25 rounded-xl p-5 bg-bg-2 space-y-4"
        >
          <div>
            <h2 className="font-display text-xl text-copper-100">{t('account.signInTitle')}</h2>
            <p className="text-sm text-ink-2 mt-1">{t('account.benefit')}</p>
          </div>
          <form onSubmit={handleSendCode} className="space-y-3">
            <FormField
              label={t('account.emailLabel')}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('account.emailPlaceholder')}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              error={errorText}
            />
            <BigButton
              type="submit"
              loading={submitting}
              disabled={!emailInput.trim()}
              aria-label={t('account.sendCodeAria')}
            >
              {t('account.sendCode')}
            </BigButton>
          </form>
        </section>
      )}

      {status === AccountStatus.PENDING_CODE && (
        <section
          aria-label={t('account.title')}
          className="border border-copper-300/25 rounded-xl p-5 bg-bg-2 space-y-4"
        >
          <p className="text-sm text-ink-2">
            {t('account.codeSentTo', { email: email || '' })}
          </p>
          <form onSubmit={handleVerify} className="space-y-3">
            <FormField
              label={t('account.codeLabel')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder={t('account.codePlaceholder')}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
              error={errorText}
              hint={resent ? t('account.resent') : undefined}
              hintTone="success"
            />
            <BigButton
              type="submit"
              loading={submitting}
              disabled={codeInput.length !== 6}
              aria-label={t('account.verifyAria')}
            >
              {t('account.verify')}
            </BigButton>
          </form>
          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting}
              className="text-xs text-ink-3 hover:text-copper-200 underline underline-offset-2
                         disabled:opacity-50"
            >
              {t('account.resend')}
            </button>
            <button
              type="button"
              onClick={handleChangeEmail}
              className="text-xs text-ink-3 hover:text-copper-200 underline underline-offset-2"
            >
              {t('account.changeEmail')}
            </button>
          </div>
        </section>
      )}

      {status === AccountStatus.SIGNED_IN && (
        <>
          <MoreSection title={t('account.sectionSession')}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono uppercase tracking-wider text-ink-3">
                  {t('account.signedInAs')}
                </p>
                <p className="text-sm text-ink-1 truncate">{email}</p>
              </div>
              <PlanBadge isPro={isPro} />
            </div>
            <BigButton
              variant="ghost"
              onClick={() => openExternal(MANAGE_URL)}
              aria-label={t('account.manageAria')}
            >
              {t('account.manage')}
            </BigButton>
          </MoreSection>

          {!isPro && plan !== null && (
            <MoreSection title={t('account.sectionUpgrade')}>
              <p className="text-sm text-ink-2">{t('account.upsellHint')}</p>
              <BigButton
                onClick={() => openExternal(PRICING_URL)}
                aria-label={t('account.upsellAria')}
              >
                {t('account.upsell')}
              </BigButton>
            </MoreSection>
          )}

          <MoreSection title={t('account.sectionDanger')} tone="danger">
            <button
              type="button"
              onClick={() => setSignOutConfirmOpen(true)}
              className="w-full text-left p-3 rounded-lg text-base text-live
                         hover:bg-live/10 transition-colors
                         underline underline-offset-2 decoration-live/40"
              aria-label={t('account.signOutAria')}
            >
              {t('account.signOut')}
            </button>
          </MoreSection>

          <ConfirmModal
            open={signOutConfirmOpen}
            variant="danger"
            title={t('account.signOutConfirmTitle')}
            message={t('account.signOutConfirm')}
            confirmLabel={t('account.signOutCta')}
            cancelLabel={t('common.cancel')}
            onConfirm={handleSignOutConfirm}
            onCancel={() => setSignOutConfirmOpen(false)}
          />
        </>
      )}
    </div>
  )
}
