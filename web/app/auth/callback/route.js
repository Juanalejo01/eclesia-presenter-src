// Endpoint que procesa el magic link de Supabase.
// El email del usuario contiene:  /auth/callback?code=XXXX&next=/cuenta
import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase/server'

// SEGURIDAD: valida que `next` sea una ruta INTERNA. Previene open redirect
// del tipo /auth/callback?next=//evil.com que el navegador interpreta como
// protocol-relative → te lleva a evil.com (phishing post-login).
function safeNextPath(next) {
  if (!next || typeof next !== 'string') return '/cuenta'
  // Debe empezar por exactamente UN slash y no por doble slash
  if (!next.startsWith('/') || next.startsWith('//')) return '/cuenta'
  // Bloquear /\evil.com (Windows-style back-slashes que algunos parsers tratan como slash)
  if (next.startsWith('/\\')) return '/cuenta'
  // No permitir protocolos escapados embebidos
  if (next.match(/^\/+[a-z]+:/i)) return '/cuenta'
  // Whitelist de prefijos válidos
  const ALLOWED = ['/cuenta', '/checkout', '/pricing', '/docs', '/download', '/']
  if (!ALLOWED.some(p => next === p || next.startsWith(p + '?') || next.startsWith(p + '/'))) {
    return '/cuenta'
  }
  return next
}

function safePlan(plan) {
  const ALLOWED = ['pro_monthly', 'pro_yearly', 'lifetime']
  return ALLOWED.includes(plan) ? plan : null
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))
  const plan = safePlan(searchParams.get('plan'))

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Si venía de /pricing con un plan, lo mandamos a Stripe Checkout
      if (plan) {
        return NextResponse.redirect(`${origin}/checkout?plan=${plan}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Si algo falló, vuelve a /login con mensaje de error
  return NextResponse.redirect(`${origin}/login?error=link_invalido`)
}
