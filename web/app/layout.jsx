import './globals.css'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, GITHUB_URL, AUTHOR_NAME, OG_IMAGE } from '../lib/site'

const TITLE = 'EclesiaPresenter — Software de presentación para iglesias'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: SITE_DESCRIPTION,
  keywords: [
    'software para iglesias', 'presentación iglesia', 'proyectar biblia',
    'proyectar canciones', 'proyección culto', 'OBS iglesia', 'streaming iglesia',
    'alternativa ProPresenter', 'alternativa EasyWorship', 'EclesiaPresenter',
  ],
  applicationName: SITE_NAME,
  authors: [{ name: AUTHOR_NAME }],
  creator: AUTHOR_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1600, height: 900, alt: 'EclesiaPresenter — proyección profesional para iglesias' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      founder: { '@type': 'Person', name: AUTHOR_NAME },
      sameAs: [GITHUB_URL],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'es',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Windows 10, Windows 11',
      url: SITE_URL,
      downloadUrl: `${SITE_URL}/download`,
      screenshot: `${SITE_URL}${OG_IMAGE}`,
      inLanguage: 'es',
      publisher: { '@id': `${SITE_URL}/#organization` },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'EUR',
        lowPrice: '0',
        highPrice: '249',
        offerCount: '4',
      },
    },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 relative z-10">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
