import { Suspense } from 'react'
import Link from 'next/link'
import RegisterForm from './register-form'

export const metadata = { title: 'Crear cuenta — EclesiaPresenter' }

export default function RegisterPage() {
  return (
    <div className="container mx-auto px-6 py-20 max-w-md">
      <div className="text-center mb-8">
        <h1 className="font-display text-4xl text-ink-1 mb-2">Crear cuenta</h1>
        <p className="text-ink-3 text-sm">
          Gratis para siempre. Sin tarjeta. Actualiza a Pro cuando lo necesites.
        </p>
      </div>

      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>

      <p className="text-center text-xs text-ink-4 mt-6">
        Al registrarte aceptas nuestros{' '}
        <Link href="/legal/terminos" className="text-ink-3 hover:text-copper-200">términos</Link>
        {' '}y{' '}
        <Link href="/legal/privacidad" className="text-ink-3 hover:text-copper-200">privacidad</Link>.
      </p>
    </div>
  )
}
