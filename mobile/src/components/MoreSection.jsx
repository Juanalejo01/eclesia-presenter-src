/**
 * MoreSection
 *
 * Wrapper de card visual para las 5 secciones de MoreScreen. Centralizamos
 * el className para que el look (bg/border/padding) se mantenga consistente
 * sin repetir strings de Tailwind en cada uso. El tono "danger" cambia el
 * borde a rojo sutil — para signalar zonas destructivas (panic button).
 *
 * Props:
 *   title    — string visible en el header de la card (<h2>).
 *   tone     — 'default' | 'danger'. Default = card neutra; danger = borde rojo.
 *   children — el contenido de la card.
 *
 * Accesibilidad: el title se renderiza como <h2> para que el outline de la
 * pantalla sea navegable con landmarks; el id se enlaza via aria-labelledby
 * del <section> para anunciar bien la region.
 */
const TONE_CLS = {
  default: 'bg-bg-2 border-line-1',
  danger:  'bg-bg-3 border-live/30',
}

const TITLE_CLS = {
  default: 'text-ink-3',
  danger:  'text-live/80',
}

// id-safe slug: el title se transforma a un id estable que no choque con
// otros (basta con que sea unico dentro de la pantalla, donde cada section
// tiene un title distinto).
function slugify(str) {
  return String(str || 'section')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'section'
}

export default function MoreSection({ title, tone = 'default', children }) {
  const toneCls = TONE_CLS[tone] || TONE_CLS.default
  const titleCls = TITLE_CLS[tone] || TITLE_CLS.default
  const id = `more-section-${slugify(title)}`
  return (
    <section
      aria-labelledby={id}
      className={`border rounded-xl p-4 space-y-3 ${toneCls}`}
    >
      <h2
        id={id}
        className={`text-xs uppercase tracking-wider font-mono ${titleCls}`}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}
