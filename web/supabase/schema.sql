-- ============================================================
-- EclesiaPresenter — Schema completo de la base de datos
-- ============================================================
-- Pega este archivo entero en:  Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
--
-- Tablas:
--   profiles      — datos extra del usuario (Supabase Auth ya gestiona el auth)
--   licenses     — suscripciones / compras (vinculadas a Stripe)
--   activations  — dispositivos (PCs) donde está activa cada licencia
--
-- Seguridad:
--   Row Level Security (RLS) activado: cada usuario solo ve SUS datos.
--   Los webhooks de Stripe usan service_role key para saltarse RLS.
-- ============================================================

-- ---------- Extensiones ----------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- profiles ----------
-- Datos no-auth del usuario. La PK es la misma que auth.users.id.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  name          text,
  organization  text,                                  -- "Iglesia Central de..."
  stripe_customer_id text unique,                      -- enlace con Stripe
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-crear profile cuando un usuario se registra en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, organization)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'organization'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- licenses ----------
create table if not exists public.licenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  plan          text not null check (plan in ('free','pro_monthly','pro_yearly','lifetime')),
  status        text not null check (status in ('active','past_due','canceled','expired','trialing')),
  license_key   text not null unique,                  -- ej: "EP-XXXX-XXXX-XXXX-XXXX"
  max_devices   integer not null default 1,            -- Free=1, Pro mensual=1, Pro anual=3, Lifetime=3
  stripe_subscription_id text unique,
  stripe_price_id        text,
  current_period_end     timestamptz,                  -- null para Lifetime
  trial_ends_at          timestamptz,                  -- fin del trial de 30 dias
  canceled_at            timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_licenses_user on public.licenses(user_id);
create index if not exists idx_licenses_key  on public.licenses(license_key);
create index if not exists idx_licenses_sub  on public.licenses(stripe_subscription_id);

-- ---------- activations ----------
create table if not exists public.activations (
  id           uuid primary key default gen_random_uuid(),
  license_id   uuid not null references public.licenses(id) on delete cascade,
  device_id    text not null,                          -- hash del hardware del PC
  device_name  text,                                   -- "PC Iglesia Central"
  os           text,                                   -- "Windows 11"
  app_version  text,                                   -- "0.2.0"
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (license_id, device_id)                       -- un device solo se activa una vez por licencia
);

create index if not exists idx_activations_license on public.activations(license_id);

-- ---------- updated_at automático ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists touch_profiles  on public.profiles;
drop trigger if exists touch_licenses  on public.licenses;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger touch_licenses before update on public.licenses
  for each row execute function public.touch_updated_at();

-- ---------- RLS (Row Level Security) ----------
-- Cada usuario solo puede ver/modificar SUS propios datos.
-- El service_role (webhooks de Stripe) salta RLS automáticamente.

alter table public.profiles    enable row level security;
alter table public.licenses    enable row level security;
alter table public.activations enable row level security;

-- profiles
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- licenses
drop policy if exists "Users can read own licenses" on public.licenses;
create policy "Users can read own licenses"
  on public.licenses for select
  using (auth.uid() = user_id);

-- activations (vía join con licenses)
drop policy if exists "Users can read own activations" on public.activations;
create policy "Users can read own activations"
  on public.activations for select
  using (
    exists (
      select 1 from public.licenses l
      where l.id = activations.license_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own activations" on public.activations;
create policy "Users can delete own activations"
  on public.activations for delete
  using (
    exists (
      select 1 from public.licenses l
      where l.id = activations.license_id and l.user_id = auth.uid()
    )
  );

-- ---------- Helpers ----------
-- Genera una license_key tipo "EP-A1B2-C3D4-E5F6-G7H8" (16 hex en 4 grupos)
create or replace function public.generate_license_key()
returns text language plpgsql as $$
declare
  k text;
begin
  k := 'EP-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text), 1, 4));
  return k;
end;
$$;
