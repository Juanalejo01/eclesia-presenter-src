-- ============================================================
-- EclesiaPresenter — Patch de seguridad v2
-- ============================================================
-- Pega este SQL en Supabase Dashboard → SQL Editor → Run.
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
--
-- CAMBIOS:
--   1. generate_license_key() ahora usa gen_random_bytes() (CSPRNG)
--      en vez de md5(random()) que NO es criptográficamente seguro.
--   2. Tabla stripe_events_processed para idempotency del webhook
--      (evita crear licencias duplicadas si Stripe reenvía un evento).
--   3. Índice en activations.device_id para que el lookup sea O(log n).
-- ============================================================

-- ---------- 1. License key con CSPRNG ----------
-- Genera 16 hex chars criptográficamente seguros usando pgcrypto.
-- gen_random_bytes(8) = 8 bytes = 64 bits de entropía real.
create or replace function public.generate_license_key()
returns text language plpgsql as $$
declare
  hex_str text;
begin
  -- 8 bytes = 16 chars hex
  hex_str := upper(encode(gen_random_bytes(8), 'hex'));
  return 'EP-' ||
    substring(hex_str, 1, 4) || '-' ||
    substring(hex_str, 5, 4) || '-' ||
    substring(hex_str, 9, 4) || '-' ||
    substring(hex_str, 13, 4);
end;
$$;

-- ---------- 2. Tabla de eventos Stripe procesados (idempotency) ----------
create table if not exists public.stripe_events_processed (
  event_id     text primary key,
  event_type   text not null,
  processed_at timestamptz not null default now()
);

-- RLS: nadie debe leer/escribir esta tabla salvo service_role
alter table public.stripe_events_processed enable row level security;
-- Sin policies = todos los usuarios autenticados se quedan fuera. Solo
-- service_role puede operar (salta RLS).

-- Limpieza automática: borrar eventos de más de 90 días para no inflar la tabla.
-- Puedes ejecutar esto manualmente o configurar pg_cron.
-- DELETE FROM public.stripe_events_processed WHERE processed_at < now() - interval '90 days';

-- ---------- 3. Índices ----------
create index if not exists idx_activations_device on public.activations(device_id);

-- ---------- 4. Hardening: revoke permisos públicos en las RPC ----------
-- generate_license_key NO debe ser invocable desde el cliente (solo desde
-- el webhook que usa service_role). Revocamos permisos a anon y authenticated.
revoke execute on function public.generate_license_key() from anon, authenticated;
-- service_role mantiene el permiso (automático).

-- ---------- 5. Verificación ----------
-- Tras ejecutar este patch, comprueba:
do $$
declare
  test_key text;
begin
  test_key := public.generate_license_key();
  if test_key !~ '^EP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$' then
    raise exception 'generate_license_key produce formato inesperado: %', test_key;
  end if;
  raise notice 'OK · generate_license_key produce: %', test_key;
end $$;
