-- ============================================================
-- EclesiaPresenter — Schema v5: datos de recuperacion + soft-delete de cuenta
-- ============================================================
-- Aplicar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Idempotente: seguro re-ejecutar.
--
-- ANADE a profiles:
--   - recovery_email : email alternativo de recuperacion/contacto
--   - phone          : telefono de contacto
--   - deletion_scheduled_at : si != null, la cuenta esta marcada para borrado
--                             (soft-delete). Se purga 30 dias despues.
-- ============================================================

alter table public.profiles
  add column if not exists recovery_email text,
  add column if not exists phone text,
  add column if not exists deletion_scheduled_at timestamptz;

-- Index para que el job de purga encuentre rapido las cuentas a borrar
create index if not exists idx_profiles_deletion_scheduled
  on public.profiles(deletion_scheduled_at)
  where deletion_scheduled_at is not null;

-- ---------- Politica RLS: el usuario puede actualizar sus datos de recuperacion ----------
-- profiles ya tiene "Users can update own profile" (schema v1). Esa policy
-- cubre la actualizacion de recovery_email/phone. No hace falta nada nuevo.

-- ---------- Funcion de purga (soft-delete -> hard-delete tras 30 dias) ----------
-- Borra de auth.users (lo que cascadea a profiles, licenses, etc. por las FK
-- on delete cascade) las cuentas marcadas hace mas de 30 dias.
-- SECURITY DEFINER para poder operar sobre auth.users.
create or replace function public.purge_deleted_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  victim record;
  purged integer := 0;
begin
  for victim in
    select id from public.profiles
    where deletion_scheduled_at is not null
      and deletion_scheduled_at < now() - interval '30 days'
  loop
    -- Borrar el usuario de auth.users; las FK on delete cascade limpian
    -- profiles, licenses, activations, cloud_songs.
    delete from auth.users where id = victim.id;
    purged := purged + 1;
  end loop;
  return purged;
end;
$$;

-- ---------- (Opcional) Programar la purga con pg_cron ----------
-- Si tienes pg_cron habilitado, descomenta para correr la purga a diario:
--
--   select cron.schedule(
--     'purge-deleted-accounts',
--     '0 4 * * *',                      -- cada dia a las 04:00 UTC
--     $$ select public.purge_deleted_accounts(); $$
--   );
--
-- Si no, puedes llamarla manualmente desde el SQL Editor:
--   select public.purge_deleted_accounts();
-- o desde un endpoint protegido (ver /api/account/purge si lo creas).

-- ---------- Verificacion ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'deletion_scheduled_at'
  ) then
    raise exception 'La columna deletion_scheduled_at no se creo';
  end if;
  raise notice 'OK · schema v5 aplicado (recovery_email, phone, deletion_scheduled_at)';
end $$;
