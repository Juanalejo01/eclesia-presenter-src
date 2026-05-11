# EclesiaPresenter — Web

Landing, pricing, autenticación y backend de licencias.

Stack: **Next.js 15 (App Router) + Tailwind CSS + Vercel**.

## Estructura

```
web/
├── app/                    # Páginas (App Router de Next.js 15)
│   ├── page.jsx           # Landing (Hero + Features + Pricing + CTA)
│   ├── pricing/           # Planes y FAQ
│   ├── download/          # Descarga del .exe
│   ├── docs/              # Documentación
│   ├── login/             # Login (magic link, pendiente)
│   ├── register/          # Registro (pendiente)
│   ├── legal/             # Términos y privacidad
│   └── layout.jsx         # Layout global (Navbar + Footer)
├── components/            # Componentes React reutilizables
│   ├── Navbar.jsx
│   ├── Footer.jsx
│   ├── Logo.jsx
│   ├── Hero.jsx
│   ├── Features.jsx
│   ├── PricingTeaser.jsx
│   └── CTA.jsx
├── lib/                   # Utilidades + integraciones (pendiente Stripe/DB)
├── public/                # Static assets
└── styles/                # Estilos globales
```

## Desarrollo local

```bash
cd web
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Build de producción

```bash
npm run build
npm start
```

## Deploy (Vercel)

```bash
vercel
```

O conectar el repo en https://vercel.com/new — autodeploys con cada push a `main`.

## Variables de entorno (pendientes para próxima sesión)

```bash
# .env.local
NEXT_PUBLIC_APP_URL="https://eclesiapresenter.com"

# Supabase (DB + Auth)
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE="..."

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY="price_..."
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY="price_..."
NEXT_PUBLIC_STRIPE_PRICE_LIFETIME="price_..."

# Resend (email transaccional)
RESEND_API_KEY="re_..."
```

## Roadmap

### v0.1 — Esta sesión ✅
- [x] Landing pública con Hero/Features/Pricing/CTA
- [x] Páginas estáticas: /pricing, /download, /docs, /login, /register
- [x] Páginas legales: /legal/terminos, /legal/privacidad
- [x] Branding cobre/cinemático coincidiendo con la app

### v0.2 — Próxima sesión 🔜
- [ ] Auth con Supabase (magic link + Google)
- [ ] Schema de DB: users, licenses, activations
- [ ] Dashboard de cuenta (/cuenta)

### v0.3 — Sesión siguiente
- [ ] Stripe Checkout (3 productos: monthly/yearly/lifetime)
- [ ] Webhooks de Stripe → crear licencias
- [ ] Email transaccional con Resend
- [ ] Portal del cliente (Stripe Customer Portal)

### v0.4 — Integración con la app
- [ ] API `/api/license/activate` para que la app valide
- [ ] Pantalla de activación dentro de EclesiaPresenter
- [ ] Gates Free vs Pro en la app
