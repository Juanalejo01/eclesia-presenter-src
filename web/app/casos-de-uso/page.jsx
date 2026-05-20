import Link from 'next/link'

export const metadata = {
  title: 'Casos de uso — EclesiaPresenter',
  description: 'Historias de iglesias y comunidades que usan EclesiaPresenter para sus servicios. Comparte la tuya.',
}

// ============================================================
// Casos de uso reales — diseño honesto del empty state.
// Cuando lleguen testimonios reales, se añaden al array TESTIMONIALS.
// ============================================================

const TESTIMONIALS = [
  // Cuando una iglesia comparta su historia, se añade aquí con:
  // {
  //   id: 'iglesia-vida-cdmx',
  //   church: 'Iglesia Nueva Vida',
  //   city: 'Ciudad de México, MX',
  //   type: 'pequena',     // pequena | mediana | grande | multi | online
  //   size: '40-60 personas',
  //   author: 'Pastor Carlos M.',
  //   role: 'Pastor principal',
  //   quote: 'Reemplazamos PowerPoint en 2 servicios. El control desde el móvil cambió cómo predicamos.',
  //   highlights: ['Cloud sync', 'Control móvil', 'Biblia offline'],
  //   featured: true,
  //   submittedAt: '2026-06-15',
  // },
]

const CHURCH_TYPES = [
  { id: 'all',      label: 'Todos',          icon: '✦' },
  { id: 'pequena',  label: 'Pequeña',        icon: '◯',  desc: '<100 personas' },
  { id: 'mediana',  label: 'Mediana',        icon: '◎',  desc: '100-500' },
  { id: 'grande',   label: 'Grande',         icon: '⬢',  desc: '500+' },
  { id: 'multi',    label: 'Multi-campus',   icon: '⬡',  desc: 'Varias sedes' },
  { id: 'online',   label: 'Online',         icon: '◉',  desc: 'Solo streaming' },
]

// Use cases hipotéticos — diseñados como "así podría funcionar en tu iglesia"
// hasta que tengamos testimonios reales. Honestos sobre que son ejemplos.
const SCENARIOS = [
  {
    id: 'pequena',
    title: 'Iglesia pequeña (<100 personas)',
    subtitle: 'PowerPoint reemplazado en una tarde',
    icon: '◯',
    scenario: 'Reemplaza el típico PowerPoint con un proyector viejo conectado a un portátil.',
    benefits: [
      'Free plan cubre todo lo que necesita un equipo de 1-2 voluntarios',
      'Sin curva de aprendizaje — voluntarios sin formación técnica lo aprenden en 1 servicio',
      'Atajos de teclado para navegar rápido sin tocar el ratón durante el sermón',
      '3 biblias offline incluidas (RVR 1909, NVI básica) — funciona sin internet',
    ],
    features: ['Free plan', 'Biblia offline', 'Atajos teclado', 'UI simple'],
  },
  {
    id: 'mediana',
    title: 'Iglesia mediana (100-500 personas)',
    subtitle: 'Equipo de transmisión con OBS Studio',
    icon: '◎',
    scenario: 'Iglesia con equipo de audiovisuales que ya usa OBS para transmitir a YouTube.',
    benefits: [
      'Ventana overlay transparente capturable directamente por OBS — sin pantalla compartida',
      'Monitor PGM/PVW estilo broadcast con "Tomar al aire" para los operadores',
      'Stage Display separado para el predicador con notas y countdown',
      'Control remoto desde el móvil del director técnico — sin moverse de la cabina',
    ],
    features: ['Overlay OBS', 'PGM/PVW', 'Stage Display', 'Control móvil'],
  },
  {
    id: 'grande',
    title: 'Iglesia grande (500+ personas)',
    subtitle: 'Cloud sync entre varios PCs operadores',
    icon: '⬢',
    scenario: 'Iglesia con varios operadores que necesitan compartir la misma biblioteca de canciones.',
    benefits: [
      'Cloud sync (Pro) → la biblioteca de canciones aparece igual en cualquier PC tras login',
      'Plan Lifetime (249€) — pago único en vez de suscripción año tras año',
      'Hasta 3 PCs simultáneos en plan Pro Anual',
      'Backup automático de canciones a la nube — nunca pierdes nada',
    ],
    features: ['Cloud sync', 'Multi-PC', 'Plan Lifetime', 'Backup auto'],
  },
  {
    id: 'multi',
    title: 'Iglesia multi-campus',
    subtitle: 'Misma lista de canciones en todas las sedes',
    icon: '⬡',
    scenario: 'Iglesia con varias sedes que predican la misma serie sermónica.',
    benefits: [
      'Biblioteca de canciones sincronizada entre sedes vía Supabase',
      'Plantillas de tema compartidas para identidad visual unificada',
      'Cada sede mantiene su lista del día local + ediciones se propagan',
      'Conflict resolution last-write-wins → varias sedes pueden editar offline',
    ],
    features: ['Cloud sync', 'Templates compartidos', 'Conflict resolution'],
  },
  {
    id: 'online',
    title: 'Iglesia online / streaming',
    subtitle: 'Producción broadcast desde casa',
    icon: '◉',
    scenario: 'Pastor o lider que predica online desde su casa o un estudio pequeño.',
    benefits: [
      'Setup mínimo: 1 PC + OBS + EclesiaPresenter overlay transparente',
      'Biblioteca de 56 fondos worship CC0 incluida (Pexels curados)',
      'Custom title bar estilo Discord → estética profesional sin distracciones',
      'Auto-updater → siempre la última versión sin tener que descargar manual',
    ],
    features: ['Overlay OBS', 'Fondos incluidos', 'Auto-update'],
  },
]

// ============================================================
// Componentes
// ============================================================

function ScenarioCard({ s }) {
  return (
    <div className="rounded-2xl border border-copper-300/15 bg-bg-2 p-7 hover:border-copper-300/30 transition-colors">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-bg-3 to-bg-1 border border-copper-300/30 grid place-items-center text-2xl text-copper-200 shrink-0">
          {s.icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-xl text-ink-1 mb-1">{s.title}</h3>
          <p className="text-sm text-copper-200 italic">{s.subtitle}</p>
        </div>
      </div>

      <p className="text-sm text-ink-2 mb-5 leading-relaxed">{s.scenario}</p>

      <ul className="space-y-2 mb-5">
        {s.benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-ink-2 leading-relaxed">
            <span className="text-copper-200 mt-0.5 shrink-0">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1.5 pt-4 border-t border-copper-300/10">
        {s.features.map(f => (
          <span key={f} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-bg-3 text-ink-3 border border-copper-300/10">
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}

function TestimonialCard({ t }) {
  return (
    <article className="rounded-2xl border border-copper-300/15 bg-bg-2 p-7">
      <blockquote className="font-display text-lg italic text-ink-1 leading-relaxed mb-5">
        "{t.quote}"
      </blockquote>

      <div className="flex items-center gap-4 pt-4 border-t border-copper-300/10">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-copper-200 to-copper-400 grid place-items-center text-base font-bold text-[#1a0e08] shrink-0">
          {(t.author || '?')[0]}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-ink-1 text-sm">{t.author}</div>
          <div className="text-xs text-ink-3">{t.role} · {t.church}</div>
          <div className="text-xs text-ink-3 font-mono mt-0.5">{t.city} · {t.size}</div>
        </div>
      </div>

      {t.highlights && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {t.highlights.map(h => (
            <span key={h} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-bg-3 text-copper-200 border border-copper-300/20">
              {h}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

// ============================================================
// Página
// ============================================================

export default function CasosDeUso() {
  return (
    <div className="container mx-auto px-6 py-20 max-w-6xl">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="text-xs font-mono uppercase tracking-widest text-copper-200 mb-3">
          Beta abierta · 2026
        </div>
        <h1 className="font-display text-5xl md:text-6xl text-ink-1 mb-5">
          Casos de uso <em className="italic text-copper-200">reales</em>
        </h1>
        <p className="text-ink-2 text-lg max-w-2xl mx-auto leading-relaxed">
          EclesiaPresenter está diseñado para iglesias de cualquier tamaño y nivel
          técnico. Aquí cómo lo usan — y cómo podrías usarlo tú.
        </p>
      </div>

      {/* Empty state honesto: aún no hay testimonios reales */}
      {TESTIMONIALS.length === 0 && (
        <section className="rounded-3xl border-2 border-dashed border-copper-300/30 bg-bg-2/50 p-10 md:p-12 mb-20 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-bg-3 to-bg-1 border border-copper-300/30 mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#db9f75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>

          <h2 className="font-display text-3xl text-ink-1 mb-3">
            Tu historia podría ser <em className="italic text-copper-200">la primera</em>
          </h2>
          <p className="text-ink-2 max-w-xl mx-auto mb-7 leading-relaxed">
            EclesiaPresenter está en beta abierta y todavía no hemos publicado
            testimonios reales. Si tu iglesia lo está usando — sea para 30 o
            3.000 personas — nos encantaría conocer tu historia.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a
              href="mailto:juanlpz.dev@gmail.com?subject=Mi%20iglesia%20usa%20EclesiaPresenter&body=Hola%2C%0A%0AUsamos%20EclesiaPresenter%20en%3A%20%5Bnombre%20de%20la%20iglesia%5D%0ACiudad%2Fpa%C3%ADs%3A%20%0ATama%C3%B1o%20aproximado%3A%20%0AC%C3%B3mo%20lo%20usamos%3A%20%0A%0AEsta%20es%20mi%20historia%3A%20%5Btu%20testimonio%5D"
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-gradient-to-b from-copper-200 to-copper-300 text-[#1a0e08] font-semibold shadow-copper-glow hover:from-copper-100 hover:to-copper-200 transition-all"
            >
              Compartir mi historia →
            </a>
            <Link
              href="/contacto"
              className="inline-flex items-center justify-center h-12 px-6 rounded-lg border border-copper-300/30 bg-bg-3 text-ink-1 font-medium hover:bg-bg-2 transition-colors"
            >
              Otras formas de contactar
            </Link>
          </div>

          <p className="text-xs text-ink-3 mt-6 max-w-md mx-auto">
            Los testimonios publicados incluyen el nombre y ciudad de la iglesia.
            Si prefieres anonimato podemos usar solo "una iglesia en {'<'}ciudad{'>'}".
          </p>
        </section>
      )}

      {/* Testimonios reales — se mostrarán cuando lleguen */}
      {TESTIMONIALS.length > 0 && (
        <section className="mb-20">
          <h2 className="font-display text-3xl text-ink-1 mb-2">
            Historias <em className="italic text-copper-200">reales</em>
          </h2>
          <p className="text-ink-3 text-sm mb-8">
            Iglesias que ya están usando EclesiaPresenter en sus servicios.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {TESTIMONIALS.map(t => <TestimonialCard key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {/* Escenarios — siempre visibles */}
      <section>
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-ink-1 mb-3">
            Así <em className="italic text-copper-200">podrías</em> usarlo
          </h2>
          <p className="text-ink-2 max-w-2xl mx-auto">
            Cinco escenarios diseñados para los distintos perfiles de iglesia.
            Encuentra el que más se parece al tuyo.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {SCENARIOS.map(s => <ScenarioCard key={s.id} s={s} />)}
        </div>
      </section>

      {/* Stats placeholder — se actualizará con números reales */}
      <section className="mt-20 mb-20">
        <div className="rounded-2xl border border-copper-300/15 bg-bg-2 p-10 text-center">
          <div className="text-xs font-mono uppercase tracking-widest text-ink-3 mb-2">
            Estado actual
          </div>
          <h3 className="font-display text-2xl text-ink-1 mb-6">
            EclesiaPresenter en cifras
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-3xl font-display text-copper-100">7</div>
              <div className="text-xs text-ink-3 font-mono uppercase tracking-wider mt-1">
                Biblias offline
              </div>
            </div>
            <div>
              <div className="text-3xl font-display text-copper-100">56</div>
              <div className="text-xs text-ink-3 font-mono uppercase tracking-wider mt-1">
                Fondos CC0
              </div>
            </div>
            <div>
              <div className="text-3xl font-display text-copper-100">3</div>
              <div className="text-xs text-ink-3 font-mono uppercase tracking-wider mt-1">
                Plataformas
              </div>
            </div>
            <div>
              <div className="text-3xl font-display text-copper-100">0€</div>
              <div className="text-xs text-ink-3 font-mono uppercase tracking-wider mt-1">
                Plan Free
              </div>
            </div>
          </div>
          <p className="text-xs text-ink-3 mt-6 max-w-lg mx-auto">
            Cuando crucemos las primeras 100 instalaciones reportadas, esta
            sección incluirá descargas totales, iglesias activas y países.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="text-center">
        <h2 className="font-display text-3xl text-ink-1 mb-3">
          ¿Listo para probarlo en tu iglesia?
        </h2>
        <p className="text-ink-2 mb-6 max-w-xl mx-auto">
          Plan Free funcional sin tarjeta. Pro empieza desde 9€/mes con cloud sync
          y todas las features.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link
            href="/download"
            className="inline-flex items-center justify-center h-12 px-6 rounded-lg bg-gradient-to-b from-copper-200 to-copper-300 text-[#1a0e08] font-semibold shadow-copper-glow hover:from-copper-100 hover:to-copper-200 transition-all"
          >
            Descargar gratis
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center h-12 px-6 rounded-lg border border-copper-300/30 bg-bg-2 text-ink-1 font-medium hover:bg-bg-3 transition-colors"
          >
            Ver planes
          </Link>
        </div>
      </section>
    </div>
  )
}
