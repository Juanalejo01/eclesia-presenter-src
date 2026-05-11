import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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
    }
  )

  // Refresca tokens si están a punto de caducar
  const { data: { user } } = await supabase.auth.getUser()

  const url = request.nextUrl
  const path = url.pathname

  // Rutas protegidas: requieren sesión
  const isProtected = path.startsWith('/cuenta')
  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // Si ya está logueado y va a /login o /register → mándalo a /cuenta
  if (user && (path === '/login' || path === '/register')) {
    return NextResponse.redirect(new URL('/cuenta', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Aplica a todo excepto archivos estáticos, _next, imágenes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
