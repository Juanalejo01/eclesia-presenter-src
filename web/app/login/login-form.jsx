'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../lib/supabase/client'
import Turnstile from '../../components/Turnstile'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/cuenta'
  const plan = searchParams.get('plan')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [captchaToken, setCaptchaToken] = useState(null)

  // Verificacion por codigo de 6 digitos
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Si Turnstile no está configurado, el componente devuelve 'disabled' y dejamos pasar.
  const captchaReady = captchaToken !== null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    if (!captchaReady) {
      setError('Por favor, completa la verificación de seguridad.')
      return
    }
    setLoading(true); setError(null)

    const supabase = createClient()
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${plan ? `&plan=${plan}` : ''}`

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('La petición a Supabase tardó más de 15 segundos. Verifica tu conexión y que los Redirect URLs estén configurados en Supabase → Auth → URL Configuration.')), 15000)
    )

    try {
      // Opciones de signInWithOtp: pasamos captchaToken solo si tenemos uno real.
      // Si el captcha está deshabilitado (sin env var), captchaToken === 'disabled'
      // y NO lo enviamos a Supabase (sino fallaría).
      const otpOptions = {
        emailRedirectTo: callbackUrl,
        shouldCreateUser: true,
      }
      if (captchaToken && captchaToken !== 'disabled') {
        otpOptions.captchaToken = captchaToken
      }

      const result = await Promise.race([
        supabase.auth.signInWithOtp({
          email: email.trim(),
          options: otpOptions,
        }),
        timeoutPromise,
      ])

      setLoading(false)
      if (result.error) {
        console.error('[login] Supabase error:', result.error)
        setError(result.error.message || JSON.stringify(result.error))
        // Resetear token: Turnstile genera otro automáticamente
        setCaptchaToken(null)
      } else {
        setSent(true)
      }
    } catch (e) {
      setLoading(false)
      console.error('[login] Exception:', e)
      setError(e?.message || String(e))
      setCaptchaToken(null)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    const token = code.trim()
    if (token.length !== 6) { setError('El código tiene 6 dígitos'); return }
    setVerifying(true); setError(null)

    const supabase = createClient()
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: email.trim(), token, type: 'email',
      })
      setVerifying(false)
      if (vErr) {
        setError(vErr.message || 'Código incorrecto o caducado')
      } else {
        const dest = plan ? `/checkout?plan=${plan}` : next
        router.push(dest)
        router.refresh()
      }
    } catch (err) {
      setVerifying(false)
      setError(err?.message || String(err))
    }
  }

  const handleResend = async () => {
    setError(null)
    const supabase = createClient()
    const { error: rErr } = await supabase.auth.signInWithOtp({
      email: email.trim(), options: { shouldCreateUser: true },
    })
    if (rErr) setError(rErr.message)
  }

  if (sent) {
    return (
      <form onSubmit={handleVerify} className="rounded-2xl border border-copper-300/30 bg-copper-300/5 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-copper-300/20 grid place-items-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l2-2h14l2 2"
              stroke="#db9f75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-display text-2xl text-ink-1 mb-2">Revisa tu correo</h2>
        <p className="text-ink-2 text-sm mb-6 leading-relaxed">
          Enviamos un código de 6 dígitos a <b className="text-copper-200">{email}</b>.
        </p>

        <input
          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000" autoFocus
          className="w-full h-16 text-center text-3xl tracking-[0.5em] font-mono
                     rounded-lg bg-bg-1 border border-copper-300/25 text-copper-100
                     outline-none focus:border-copper-300/60 focus:ring-2 focus:ring-copper-300/15 mb-4"
        />

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-md mb-4">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={verifying || code.length !== 6}
          className="w-full h-12 rounded-lg bg-gradient-to-b from-copper-200 to-copper-300
                     text-[#1a0e08] font-semibold disabled:opacity-50 disabled:cursor-not-allowed
                     hover:from-copper-100 hover:to-copper-200 transition-all"
        >
          {verifying ? 'Verificando…' : 'Verificar y entrar'}
        </button>

        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <button type="button" onClick={handleResend}
            className="text-ink-3 hover:text-copper-200 underline underline-offset-2">
            Reenviar código
          </button>
          <button type="button" onClick={() => { setSent(false); setCode(''); setCaptchaToken(null) }}
            className="text-ink-3 hover:text-copper-200 underline underline-offset-2">
            Otro correo
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-copper-300/20 bg-bg-2 p-8 space-y-5">
      {plan && (
        <div className="text-xs text-copper-200 bg-copper-300/10 border border-copper-300/20 px-3 py-2 rounded-md">
          Plan seleccionado: <b className="capitalize">{plan.replace('_', ' ')}</b>
        </div>
      )}

      <div>
        <label className="block text-xs font-mono uppercase tracking-widest text-ink-3 mb-2">
          Correo electrónico
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tu@iglesia.com"
          required
          autoFocus
          className="w-full h-12 px-4 rounded-lg bg-bg-1 border border-copper-300/15
                     text-ink-1 placeholder-ink-4 outline-none
                     focus:border-copper-300/50 focus:ring-2 focus:ring-copper-300/15"
        />
      </div>

      {/* Cloudflare Turnstile — invisible si no hay env var, "managed" si la hay */}
      <Turnstile onVerify={setCaptchaToken} theme="dark" />

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim() || !captchaReady}
        className="w-full h-12 rounded-lg
                   bg-gradient-to-b from-copper-200 to-copper-300
                   text-[#1a0e08] font-semibold
                   disabled:opacity-50 disabled:cursor-not-allowed
                   hover:from-copper-100 hover:to-copper-200 transition-all"
      >
        {loading ? 'Enviando…' : 'Enviar código de acceso'}
      </button>

      <p className="text-xs text-ink-3 text-center pt-2">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/register" className="text-copper-200 hover:text-copper-100 underline underline-offset-2">
          Crear cuenta
        </Link>
        <br/>
        Te enviamos un código de 6 dígitos a tu correo para entrar.
      </p>
    </form>
  )
}
