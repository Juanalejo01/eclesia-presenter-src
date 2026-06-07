export default function ServiceScreen() {
  return (
    <div className="p-4 space-y-4">
      <header className="pt-safe-t" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="font-display text-3xl text-ink-1">Servicio</h1>
        <p className="text-sm text-ink-3">Mando remoto — sin emparejar todavía</p>
      </header>

      {/* PGM Preview placeholder */}
      <div className="aspect-video bg-bg-3 border border-line-1 rounded-xl
                      grid place-items-center text-ink-3 text-sm">
        Preview del slide actual (próximamente)
      </div>

      {/* Botones placeholder */}
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-copper py-6 text-lg" disabled>◀ Prev</button>
        <button className="btn-copper py-6 text-lg" disabled>Next ▶</button>
      </div>
      <p className="text-center text-xs text-ink-3 font-mono uppercase tracking-widest">
        T2-T6 conectarán este panel al desktop
      </p>
    </div>
  )
}
