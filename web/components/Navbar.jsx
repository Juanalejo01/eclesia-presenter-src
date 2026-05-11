import Link from 'next/link'
import Logo from './Logo'

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-bg-0/70 border-b border-copper-300/10">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <Logo size={28} />
          <span className="font-semibold tracking-tight">
            Eclesia<span className="text-text-3 font-normal">Presenter</span>
          </span>
          <span className="hidden md:inline text-[10px] font-mono text-text-3 uppercase tracking-wider px-2 py-0.5 border border-copper-300/20 rounded">
            v 0.2
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/#features" className="text-text-2 hover:text-text-1 link-underline transition-colors">
            Funciones
          </Link>
          <Link href="/pricing" className="text-text-2 hover:text-text-1 link-underline transition-colors">
            Precios
          </Link>
          <Link href="/docs" className="text-text-2 hover:text-text-1 link-underline transition-colors">
            Documentación
          </Link>
          <Link href="/download" className="text-text-2 hover:text-text-1 link-underline transition-colors">
            Descargar
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden md:inline text-sm text-text-2 hover:text-text-1 transition-colors">
            Iniciar sesión
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg
                       bg-gradient-to-b from-copper-200 to-copper-300
                       text-[#1a0e08] text-sm font-semibold
                       shadow-copper-glow hover:from-copper-100 hover:to-copper-200
                       transition-all"
          >
            Descargar gratis
          </Link>
        </div>
      </div>
    </header>
  )
}
