import Link from 'next/link'

export const metadata = {
  title: 'Contacto — EclesiaPresenter',
  description: 'Habla con nosotros sobre planes para iglesia grande, soporte, alianzas o cualquier duda.',
}

const REASONS = [
  {
    key: 'iglesia-grande',
    title: 'Plan Iglesia Grande',
    desc: 'Más de 5 PCs simultáneos, multi-sede, formación a operadores, branding propio.',
    sla: 'Respuesta en < 24h hábiles',
  },
  {
    key: 'soporte',
    title: 'Soporte técnico',
    desc: 'Algo no funciona y necesitas ayuda urgente.',
    sla: 'Respuesta en < 24h',
  },
  {
    key: 'partner',
    title: 'Alianza / Partner',
    desc: 'Eres integrador, consultor o vendedor que quiere ofrecer EclesiaPresenter a sus clientes.',
    sla: 'Respuesta en < 48h',
  },
  {
    key: 'feedback',
    title: 'Feedback / Sugerencia',
    desc: 'Idea de mejora, bug report, o cosa que te gustaría ver añadida.',
    sla: 'Leemos todo',
  },
]

export default function ContactoPage({ searchParams }) {
  const focus = REASONS.find(r => r.key === searchParams?.asunto)

  return (
    <div className="container mx-auto px-6 py-20 max-w-4xl">
      <div className="text-center mb-12">
        <div className="text-xs font-mono uppercase tracking-widest text-copper-200 mb-3">
          Contacto directo
        </div>
        <h1 className="font-display text-5xl text-ink-1 mb-4">
          Hablemos
        </h1>
        <p className="text-ink-2 text-lg max-w-2xl mx-auto">
          Escríbenos directamente — leemos todos los emails personalmente.
          Sin tickets, sin formularios largos.
        </p>
      </div>

      {/* Dos canales: email + WhatsApp */}
      <div className="grid md:grid-cols-2 gap-5 mb-10">
        {/* Email */}
        <div className={
          'rounded-2xl border-2 p-7 text-center transition-all ' +
          (focus
            ? 'border-copper-300/50 bg-gradient-to-br from-copper-300/15 to-bg-2 shadow-copper-glow'
            : 'border-copper-300/25 bg-bg-2')
        }>
          {focus && (
            <div className="text-[10px] font-mono uppercase tracking-widest text-copper-200 mb-3">
              Asunto · {focus.title}
            </div>
          )}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-bg-3 to-bg-1 border border-copper-300/30 mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#db9f75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-ink-1 mb-1">Email</h2>
          <p className="font-mono text-sm text-copper-200 mb-2 break-all">
            juanlpz.dev@gmail.com
          </p>
          <p className="text-ink-3 text-xs mb-5">
            {focus ? focus.sla : 'Respuesta < 24h hábiles'}
          </p>
          <a
            href={`mailto:juanlpz.dev@gmail.com${
              focus
                ? `?subject=${encodeURIComponent('[' + focus.title + '] ')}`
                : ''
            }`}
            className="inline-flex items-center justify-center h-11 px-6 rounded-lg
                       bg-gradient-to-b from-copper-200 to-copper-300
                       text-[#1a0e08] font-semibold text-sm
                       hover:from-copper-100 hover:to-copper-200 transition-all"
          >
            Abrir cliente de correo →
          </a>
        </div>

        {/* WhatsApp */}
        <div className="rounded-2xl border-2 border-emerald-500/25 bg-emerald-500/[0.04] p-7 text-center transition-all">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#22c55e">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488"/>
            </svg>
          </div>
          <h2 className="font-display text-2xl text-ink-1 mb-1">WhatsApp</h2>
          <p className="font-mono text-sm text-emerald-400 mb-2">
            +34 624 766 578
          </p>
          <p className="text-ink-3 text-xs mb-5">
            Respuesta más rápida en horario laboral CET
          </p>
          <a
            href={`https://wa.me/34624766578${
              focus
                ? `?text=${encodeURIComponent('[' + focus.title + '] Hola, te escribo desde la web de EclesiaPresenter.')}`
                : `?text=${encodeURIComponent('Hola, te escribo desde la web de EclesiaPresenter.')}`
            }`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center h-11 px-6 rounded-lg
                       bg-emerald-500 text-white font-semibold text-sm
                       hover:bg-emerald-400 transition-colors"
          >
            Abrir WhatsApp →
          </a>
        </div>
      </div>

      {/* Razones por las que escribir */}
      <div className="mb-12">
        <h3 className="font-display text-2xl text-ink-1 mb-6 text-center">
          ¿Sobre qué quieres escribirnos?
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {REASONS.map(r => (
            <Link
              key={r.key}
              href={`/contacto?asunto=${r.key}`}
              className={
                'rounded-xl border p-5 transition-all hover:translate-y-[-1px] block ' +
                (focus?.key === r.key
                  ? 'border-copper-300/40 bg-copper-300/[0.06]'
                  : 'border-copper-300/15 bg-bg-2 hover:border-copper-300/30')
              }>
              <h4 className="font-display text-lg text-ink-1 mb-1">{r.title}</h4>
              <p className="text-sm text-ink-2 leading-relaxed mb-2">{r.desc}</p>
              <p className="text-xs font-mono text-copper-200 uppercase tracking-widest">
                {r.sla}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* Plantillas sugeridas según el asunto */}
      {focus?.key === 'iglesia-grande' && (
        <div className="rounded-xl border border-copper-300/15 bg-bg-2 p-6 mb-10">
          <h3 className="font-display text-lg text-ink-1 mb-3">
            Datos útiles para que te respondamos rápido
          </h3>
          <p className="text-sm text-ink-2 mb-4">
            Si quieres acelerar el presupuesto, incluye en el correo:
          </p>
          <ul className="space-y-2 text-sm text-ink-2">
            <li>· Nombre de la iglesia / organización y ciudad</li>
            <li>· Número aproximado de PCs / campus / templos donde se usará</li>
            <li>· ¿Necesitas formación inicial al equipo de operadores?</li>
            <li>· ¿Tienes integración con algún software existente (CCLI, ProPresenter, etc.)?</li>
            <li>· Plazo deseado para empezar a usarlo</li>
          </ul>
        </div>
      )}

      {focus?.key === 'soporte' && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-6 mb-10">
          <h3 className="font-display text-lg text-ink-1 mb-3 flex items-center gap-2">
            <span className="text-amber-300">⚠</span> Antes de escribirnos
          </h3>
          <p className="text-sm text-ink-2 mb-4">
            Quizás encuentres la solución en segundos:
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/instalacion" className="text-sm text-copper-200 hover:text-copper-100">
              → Guía de instalación
            </Link>
            <Link href="/docs/licencias" className="text-sm text-copper-200 hover:text-copper-100">
              → Activar licencias
            </Link>
            <Link href="/docs/obs" className="text-sm text-copper-200 hover:text-copper-100">
              → Captura OBS
            </Link>
            <Link href="/docs" className="text-sm text-copper-200 hover:text-copper-100">
              → Toda la documentación
            </Link>
          </div>
        </div>
      )}

      <div className="text-center text-xs text-ink-3 mt-8">
        Estamos en Madrid, España · Horario UTC+1 / UTC+2
      </div>
    </div>
  )
}
