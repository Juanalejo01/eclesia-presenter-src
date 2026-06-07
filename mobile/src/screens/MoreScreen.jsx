export default function MoreScreen() {
  return (
    <div className="p-4 space-y-4">
      <header className="pt-safe-t" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="font-display text-3xl text-ink-1">Más</h1>
        <p className="text-sm text-ink-3">Ajustes y cuenta</p>
      </header>

      <div className="bg-bg-3 border border-line-1 rounded-xl p-8
                      grid place-items-center text-ink-3 text-sm min-h-[200px]">
        <div className="text-center space-y-2">
          <div className="text-4xl" aria-hidden="true">⋯</div>
          <div>Emparejamiento, ajustes, cuenta</div>
          <div className="text-xs text-ink-4">(próximamente)</div>
        </div>
      </div>

      <p className="text-center text-xs text-ink-3 font-mono uppercase tracking-widest">
        T3 traerá el pairing QR aquí
      </p>
    </div>
  )
}
