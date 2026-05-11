import { Suspense } from 'react'
import LoginForm from './login-form'
import Link from 'next/link'

export const metadata = { title: 'Iniciar sesión — EclesiaPresenter' }

export default function LoginPage() {
  return (
    <div className="container mx-auto px-6 py-20 max-w-md">
      <div className="text-center mb-8">
        <h1 className="font-display text-4xl text-ink-1 mb-2">Iniciar sesión</h1>
        <p className="text-ink-3 text-sm">
          Te enviamos un enlace mágico al correo. Sin contraseñas.
        </p>
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <p className="text-center text-xs text-ink-4 mt-6">
        Al iniciar sesión aceptas nuestros{' '}
        <Link href="/legal/terminos" className="text-ink-3 hover:text-copper-200">términos</Link>
        {' '}y{' '}
        <Link href="/legal/privacidad" className="text-ink-3 hover:text-copper-200">privacidad</Link>.
      </p>
    </div>
  )
}
