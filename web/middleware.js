import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ────────────────────────────────────────────────────────────────────
// CORS allowlist para /api/*
// Permitimos solo origenes legítimos:
//   - Nuestra propia web (Vercel production + Vercel preview deploys)
//   - localhost (dev local + tests E2E)
//   - Apps Electron empaquetadas (envían Origin nulo o file://)
// Cualquier otro origen → bloqueado en preflight (OPTIONS) y rechazado.
// ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN_EXACT = new Set([
  'https://eclesia-presenter.vercel.app',
  'http://localhost:3000',
  'http://localhost:3434',  // server LAN embebido del Electron
  'http://127.0.0.1:3000',
])
const ALLOWED_ORIGIN_REGEX = [
  /^https:\/\/.*\.eclesia-presenter\.vercel\.app$/,  // preview deploys de Vercel
  /^https:\/\/eclesia-presenter-.*-juanalejo01\.vercel\.app$/, // branches
]

function isOriginAllowed(origin) {
  if (!origin) return true  // null/undefined = same-origin o Electron file:// = OK
  if (ALLOWED_ORIGIN_EXACT.has(origin)) return true
  return ALLOWED_ORIGIN_REGEX.some(rx => rx.test(origin))
}

function corsHeaders(origin) {
  const headers = new Headers()
  if (isOriginAllowed(origin) && origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-License-Key, X-Device-Id')
  headers.set('Access-Control-Max-Age', '86400')  // cache preflight 24h
  return headers
}

// Middleware defensivo: si Supabase no está configurado o falla,
// deja pasar la request en lugar de romper toda la web con un 500.
export async function middleware(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const path = request.nextUrl.pathname
  const origin = request.headers.get('origin')

  // ─── Gestión de CORS para /api/* ───
  if (path.startsWith('/api/')) {
    // Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      const allowed = isOriginAllowed(origin)
      if (!allowed) {
        return new NextResponse(null, { status: 403, headers: { 'X-CORS-Reject': 'origin-not-allowed' } })
      }
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
    }
    // POST/GET reales: bloquear origenes cross-origin desconocidos antes de procesar
    if (origin && !isOriginAllowed(origin)) {
      return new NextResponse(JSON.stringify({ error: 'forbidden_origin' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }
    // Procesar normal y añadir headers CORS a la response
    const response = NextResponse.next()
    const cors = corsHeaders(origin)
    cors.forEach((v, k) => response.headers.set(k, v))
    return response
  }

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

    // Rutas protegidas: requieren sesión
    if (path.startsWith('/cuenta') && !user) {
      const loginUrl = new URL('/login', request.url)
      // path siempre empieza con '/' simple porque viene de request.nextUrl.pathname.
      // Pero por seguridad defensiva: solo lo pasamos si es ruta interna válida.
      if (path.startsWith('/') && !path.startsWith('//')) {
        loginUrl.searchParams.set('next', path)
      }
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
