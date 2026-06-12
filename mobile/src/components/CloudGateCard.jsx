/**
 * CloudGateCard (C2 → extraída en C3a)
 *
 * Card de gating de las features cloud (inicia sesión / upsell Pro) —
 * mismo lenguaje visual que la card de login de AccountScreen. Vivía
 * privada en SongsScreen (C2); C3a la promueve a componente compartido
 * porque PlannerListScreen usa el mismo gating x4 estados de cuenta.
 */
import BigButton from './BigButton.jsx'

export default function CloudGateCard({ title, body, cta, ctaAria, onCta }) {
  return (
    <section
      aria-label={title}
      className="border border-copper-300/25 rounded-xl p-5 bg-bg-2 space-y-4"
    >
      <div>
        <h2 className="font-display text-xl text-copper-100">{title}</h2>
        <p className="text-sm text-ink-2 mt-1">{body}</p>
      </div>
      <BigButton onClick={onCta} aria-label={ctaAria}>
        {cta}
      </BigButton>
    </section>
  )
}
