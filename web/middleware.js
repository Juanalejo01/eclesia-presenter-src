import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Middleware defensivo: si Supabase no está configurado o falla,
// deja pasar la request en lugar de romper toda la web con un 500.
export async function middleware(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Si faltan las env vars, no podemos validar sesión. Dejamos pasar.
  if (!url || !anonKey || !isValidHttpUrl(url)) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request: { headers: request.headers } })

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        get(name) { return request.cookies.get(name)?.value },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    const path = request.nextUrl.pathname

    // Rutas protegidas: requieren sesión
    if (path.startsWith('/cuenta') && !user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', path)
      return NextResponse.redirect(loginUrl)
    }

    // Si ya está logueado y va a /login o /register → mándalo a /cuenta
    if (user && (path === '/login' || path === '/register')) {
      return NextResponse.redirect(new URL('/cuenta', request.url))
    }
  } catch (e) {
    // Si algo falla con Supabase (URL invalida, cookies corruptas, red caida...),
    // no rompemos la web. Loggeamos y seguimos sin sesión.
    console.error('[middleware] Supabase error:', e?.message || e)
  }

  return response
}

function isValidHttpUrl(s) {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export const config = {
  matcher: [
    // Aplica a todo excepto archivos estáticos, _next, imágenes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
