# Setup de Supabase (paso a paso)

Tiempo estimado: **10 minutos**.

## 1. Crear el proyecto

1. Ve a https://supabase.com/dashboard → **New project**
2. Nombre: `eclesiapresenter` (o lo que prefieras)
3. **Database Password**: genera una fuerte y guárdala
4. **Region**: la más cercana a tus usuarios (ej. `Europe Central (Frankfurt)` o `South America (São Paulo)`)
5. Plan: **Free** está bien para empezar (500 MB DB, 50k MAU)
6. Espera ~2 minutos a que se aprovisione

## 2. Ejecutar el schema SQL

1. Dentro del proyecto → **SQL Editor** (en el menú lateral)
2. **New query**
3. Abre el archivo `web/supabase/schema.sql` de este repo
4. Copia todo el contenido y pégalo en el editor
5. Click **Run** (Ctrl+Enter)
6. Deberías ver `Success. No rows returned`

Esto crea:
- Tablas `profiles`, `licenses`, `activations`
- Triggers (auto-crear profile al registrar, timestamps automáticos)
- Políticas RLS (cada usuario solo ve sus datos)
- Función `generate_license_key()` para crear claves tipo `EP-XXXX-XXXX-XXXX-XXXX`

## 3. Configurar Authentication

1. Menú lateral → **Authentication** → **Providers**
2. **Email** está habilitado por defecto. Configúralo así:
   - ✅ Enable Email provider
   - ✅ Confirm email (recomendado)
   - ❌ Enable email signups → **deja a tu gusto** (si quieres bloquear nuevos registros)
   - ✅ Enable magic links

3. Menú lateral → **Authentication** → **URL Configuration**
   - **Site URL**: `https://eclesiapresenter.com` (o tu URL de Vercel para empezar, ej. `https://eclesia-presenter.vercel.app`)
   - **Redirect URLs** — añade TODAS las que vayas a usar:
     ```
     http://localhost:3000/auth/callback
     https://eclesia-presenter.vercel.app/auth/callback
     https://eclesiapresenter.com/auth/callback
     ```

4. Menú lateral → **Authentication** → **Email Templates** (opcional)
   - Personaliza el email del magic link con tu branding cobre

## 4. Obtener las API Keys

1. Menú lateral → **Project Settings** → **API**
2. Copia estos 3 valores:

| Variable | De dónde | Dónde la pongo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" | `.env.local` y Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "Project API keys → anon public" | `.env.local` y Vercel |
| `SUPABASE_SERVICE_ROLE` | "Project API keys → service_role" ⚠️ secreto | `.env.local` y Vercel |

## 5. Configurar las variables en local

```bash
cd web
cp .env.example .env.local
# Edita .env.local y pega los valores de Supabase
```

## 6. Configurar las variables en Vercel

1. Ve a tu proyecto en Vercel → **Settings** → **Environment Variables**
2. Añade las 3 variables de arriba (URL, ANON_KEY, SERVICE_ROLE)
3. Importante: marca las 3 como visibles en **Production**, **Preview** y **Development**
4. Redeploy: **Deployments** → último → ⋯ → **Redeploy**

## 7. Probar el flujo

En local:
```bash
cd web
npm install
npm run dev
```

Abre `http://localhost:3000/register` → introduce un email → revisa tu correo → click en el link → te lleva a `/cuenta` ✅

---

## Estructura de las tablas

```
auth.users           (Supabase, no la tocas)
   ↓ id
profiles             (público, una fila por usuario)
   ↓ id (= auth.users.id)
licenses             (suscripciones / lifetime, vinculadas a Stripe)
   ↓ id
activations          (PCs activados con la license_key)
```

**RLS activado**: cada usuario solo ve SUS datos. Los webhooks de Stripe usan
`service_role` que salta RLS para crear/actualizar licencias.

---

## Notas de seguridad

- ✅ `anon` key es **segura** de exponer en cliente (es lo que hace `NEXT_PUBLIC_`)
- ⚠️ `service_role` key **NUNCA** debe llegar al cliente. Solo en API routes server-side
- ✅ RLS está activado en las 3 tablas
- ✅ Las funciones SQL usan `SECURITY DEFINER` con `search_path = public` (best practice)

---

## Troubleshooting

**"User not found" al hacer login:**
- Confirma que el email no esté ya en uso con otro provider (Google, GitHub) en Auth → Users

**"Email rate limit exceeded":**
- Supabase Free permite ~30 emails/hora. Para producción configura un SMTP propio en Settings → Auth → SMTP

**Trigger `handle_new_user` no funciona:**
- Verifica en SQL Editor: `select * from public.profiles;` — debería tener una fila por cada usuario
- Si no, re-ejecuta `schema.sql` (es idempotente)
