// Endpoint que procesa el magic link de Supabase.
// El email del usuario contiene:  /auth/callback?code=XXXX&next=/cuenta
import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase/server'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/cuenta'
  const plan = searchParams.get('plan')

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
