import Link from 'next/link'
import { promises as fs } from 'fs'
import path from 'path'

export const metadata = {
  title: 'Recursos — EclesiaPresenter',
  description:
    'Biblioteca de recursos gratuitos para tu proyección: vídeos de fondo, canciones, tutoriales e imágenes. Todo libre de regalías y listo para usar en tu iglesia.',
}

// Carga el catálogo de vídeos directamente desde el JSON del repo —
// renderizado server-side para SEO y velocidad. Si el archivo no existe,
// degradamos a una lista vacía sin romper la página.
async function loadVideoCatalog() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'backgrounds-catalog.json')
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (e) {
    console.warn('[/recursos] catálogo de vídeos no disponible:', e?.message)
    return { categories: [], items: [] }
  }
}

const CATEGORY_META = {
  videos: {
    title: 'Vídeos de fondo',
    short: 'Vídeos',
    description:
      'Loops abstractos, naturaleza, partículas y atmósferas listas para proyectar detrás de las letras de tus canciones o versículos.',
    license: 'CC0 / Pexels License · uso comercial libre',
    Icon: VideoIcon,
    color: 'from-copper-200/30 to-copper-300/10',
  },
  canciones: {
    title: 'Canciones',
    short: 'Canciones',
    description:
      'Pack de canciones cristianas con letras formateadas para EclesiaPresenter — importas con un click desde la app.',
    license: 'Letras tradicionales y dominio público',
    Icon: MusicIcon,
    color: 'from-emerald-400/20 to-teal-400/10',
  },
  tutoriales: {
    title: 'Tutoriales',
    short: 'Tutoriales',
    description:
      'Vídeos paso a paso para sacar partido a la app: conectar OBS, configurar el lower-third, usar el mando móvil, organizar tu servicio.',
    license: 'Producidos por EclesiaPresenter',
    Icon: PlayIcon,
    color: 'from-sky-400/20 to-indigo-400/10',
  },
  imagenes: {
    title: 'Imágenes',
    short: 'Imágenes',
    description:
      'Fondos fijos con texturas, gradientes y elementos cristianos sobrios para servicios sin distracciones.',
    license: 'CC0 / Unsplash License · uso libre',
    Icon: ImageIcon,
    color: 'from-amber-400/20 to-orange-400/10',
  },
}

const CATEGORY_ORDER = ['videos', 'canciones', 'tutoriales', 'imagenes']

export default async function RecursosPage() {
  const videoCatalog = await loadVideoCatalog()

  return (
    <div className="container mx-auto px-6 py-16 max-w-7xl">
      {/* Hero */}
      <header className="text-center mb-14">
        <div className="text-xs font-mono uppercase tracking-widest text-copper-200 mb-3">
          Biblioteca
        </div>
        <h1 className="font-display text-5xl md:text-6xl text-ink-1 mb-5">
          Recursos para tu <em className="italic text-copper-200">proyección</em>
        </h1>
        <p className="max-w-2xl mx-auto text-ink-2 text-lg leading-relaxed">
          Todo lo que necesitas para que tus servicios se vean profesionales — sin
          inflar el instalador de la app. Descárgalo solo si te interesa.
        </p>
      </header>

      {/* Nav rápida — chips horizontales a las secciones */}
      <nav
        className="flex flex-wrap items-center justify-center gap-3 mb-14"
        aria-label="Secciones de recursos">
        {CATEGORY_ORDER.map((id) => {
          const meta = CATEGORY_META[id]
          const { Icon } = meta
          return (
            <a
              key={id}
              href={`#${id}`}
              className="group inline-flex items-center gap-2.5 px-4 h-10 rounded-full
                         border border-copper-300/20 bg-bg-2/60 backdrop-blur-sm
                         text-sm text-ink-2 hover:text-ink-1 hover:border-copper-300/45
                         hover:bg-bg-2 transition-all">
              <Icon className="w-4 h-4 text-copper-200" />
              {meta.short}
            </a>
          )
        })}
      </nav>

      {/* VÍDEOS DE FONDO */}
      <Section id="videos" meta={CATEGORY_META.videos}>
        {videoCatalog.items?.length > 0 ? (
          <VideosGrid catalog={videoCatalog} />
        ) : (
          <EmptyState icon="🎥" message="Catálogo no disponible — vuelve más tarde." />
        )}
      </Section>

      {/* CANCIONES */}
      <Section id="canciones" meta={CATEGORY_META.canciones}>
        <ComingSoon
          icon="🎵"
          title="Pack de canciones · pronto"
          description={
            <>
              Estamos preparando un pack de canciones con letras correctamente
              formateadas (estrofa / coro / puente) que importarás en un click
              desde <span className="text-copper-200">Ajustes → Canciones → Importar</span>.
              Si quieres aportar canciones para la comunidad,{' '}
              <Link href="/contacto" className="text-copper-200 hover:text-copper-100 underline underline-offset-2">
                escríbenos
              </Link>.
            </>
          }
        />
      </Section>

      {/* TUTORIALES */}
      <Section id="tutoriales" meta={CATEGORY_META.tutoriales}>
        <ComingSoon
          icon="▶️"
          title="Vídeos paso a paso · pronto"
          description={
            <>
              Conectar OBS, montar el lower-third, mando móvil, dos pantallas… los
              estamos grabando. Mientras tanto, la{' '}
              <Link href="/docs" className="text-copper-200 hover:text-copper-100 underline underline-offset-2">
                documentación escrita
              </Link>
              {' '}ya cubre las cosas más comunes.
            </>
          }
        />
      </Section>

      {/* IMÁGENES */}
      <Section id="imagenes" meta={CATEGORY_META.imagenes}>
        <ComingSoon
          icon="🖼️"
          title="Pack de imágenes · pronto"
          description={
            <>
              Texturas, gradientes y elementos sobrios listos para fondo fijo de
              proyección. Curados a mano para que combinen bien con los temas de la app.
            </>
          }
        />
      </Section>

      {/* Licensing footer */}
      <div className="mt-20 p-6 rounded-2xl border border-copper-300/15 bg-bg-2/50 text-center">
        <p className="text-sm text-ink-2 leading-relaxed max-w-3xl mx-auto">
          Todos los recursos de esta biblioteca son <b className="text-copper-200">libres de regalías</b>{' '}
          para uso devocional y comercial. Atribuimos a los autores originales cuando aplica.
          Si tu iglesia produce material que quisiera compartir,{' '}
          <Link href="/contacto" className="text-copper-200 hover:text-copper-100 underline underline-offset-2">
            cuéntanoslo
          </Link>{' '}— lo curaremos y lo añadiremos al catálogo público.
        </p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sub-componentes
// ────────────────────────────────────────────────────────────────────

function Section({ id, meta, children }) {
  const { Icon } = meta
  return (
    <section id={id} className="mb-20 scroll-mt-24">
      <div className={`p-6 md:p-7 rounded-2xl border border-copper-300/15 bg-gradient-to-br ${meta.color} to-transparent mb-6`}>
        <div className="flex items-start gap-5">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-bg-1/80 border border-copper-300/20 grid place-items-center text-copper-200">
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-3xl md:text-4xl text-ink-1 mb-1.5">
              {meta.title}
            </h2>
            <p className="text-ink-2 text-sm md:text-base leading-relaxed mb-2">
              {meta.description}
            </p>
            <p className="text-xs font-mono uppercase tracking-widest text-ink-3">
              {meta.license}
            </p>
          </div>
        </div>
      </div>
      {children}
    </section>
  )
}

function VideosGrid({ catalog }) {
  const categories = [
    { id: 'all', label: `Todos (${catalog.items.length})` },
    ...catalog.categories.map((c) => ({
      ...c,
      label: `${c.label} (${catalog.items.filter((i) => i.category === c.id).length})`,
    })),
  ]

  return (
    <>
      {/* Filtro por categoría — chips visuales (sin JS, scroll horizontal en móvil) */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-5 -mx-2 px-2">
        {categories.map((c) => (
          <a
            key={c.id}
            href={`#cat-${c.id}`}
            className="shrink-0 px-3 h-8 inline-flex items-center rounded-full
                       border border-copper-300/20 bg-bg-2/70 text-xs
                       text-ink-2 hover:text-ink-1 hover:border-copper-300/45
                       transition-colors whitespace-nowrap">
            {c.label}
          </a>
        ))}
      </div>

      {/* Grid de vídeos agrupados por categoría */}
      {catalog.categories.map((cat) => {
        const items = catalog.items.filter((i) => i.category === cat.id)
        if (items.length === 0) return null
        return (
          <div key={cat.id} id={`cat-${cat.id}`} className="mb-10 scroll-mt-24">
            <h3 className="font-display text-xl text-ink-1 mb-4 flex items-baseline gap-3">
              {cat.label}
              <span className="text-xs font-mono text-ink-3">{items.length} vídeos</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <VideoCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

function VideoCard({ item }) {
  return (
    <article className="group rounded-xl overflow-hidden border border-copper-300/15 bg-bg-2 hover:border-copper-300/40 transition-all">
      <div className="relative aspect-video bg-bg-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbnail}
          alt={item.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 right-2 px-1.5 h-5 rounded bg-black/70 text-white text-[10px] font-mono leading-5">
          {item.duration_sec}s
        </div>
      </div>
      <div className="p-3.5">
        <h4 className="text-sm font-medium text-ink-1 mb-1 line-clamp-2 min-h-[2.5rem]">
          {item.title}
        </h4>
        <div className="flex items-center gap-2 text-[11px] text-ink-3 font-mono mb-3">
          <span>{item.resolution}</span>
          <span aria-hidden>·</span>
          <span>{item.size_mb} MB</span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center w-full h-9 rounded-lg
                     bg-copper-300/15 hover:bg-copper-300/25 border border-copper-300/30
                     text-copper-100 text-xs font-medium gap-1.5 transition-all">
          <DownloadIcon className="w-3.5 h-3.5" />
          Descargar
        </a>
      </div>
    </article>
  )
}

function ComingSoon({ icon, title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-copper-300/25 bg-bg-2/40 p-10 text-center">
      <div className="text-5xl mb-4" aria-hidden>{icon}</div>
      <h3 className="font-display text-2xl text-ink-1 mb-2.5">{title}</h3>
      <p className="text-sm text-ink-2 max-w-xl mx-auto leading-relaxed">
        {description}
      </p>
    </div>
  )
}

function EmptyState({ icon, message }) {
  return (
    <div className="rounded-xl border border-dashed border-copper-300/20 bg-bg-2/40 p-8 text-center">
      <div className="text-3xl mb-3" aria-hidden>{icon}</div>
      <p className="text-sm text-ink-3">{message}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Iconos SVG (sin dependencias)
// ────────────────────────────────────────────────────────────────────

function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8Z" />
    </svg>
  )
}
function MusicIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  )
}
function PlayIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4V8Z" fill="currentColor" />
    </svg>
  )
}
function ImageIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}
function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
