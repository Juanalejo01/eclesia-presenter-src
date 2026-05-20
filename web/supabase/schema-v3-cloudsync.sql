-- ============================================================
-- EclesiaPresenter — Schema v3: Cloud sync de canciones
-- ============================================================
-- Pega este SQL en Supabase Dashboard → SQL Editor → New query → Run.
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
--
-- AÑADE:
--   - Tabla cloud_songs (mirror de la SQLite local del desktop)
--   - RLS: cada usuario solo ve sus propias canciones
--   - Índices para queries eficientes en sync
-- ============================================================

-- ---------- cloud_songs ----------
create table if not exists public.cloud_songs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  author       text,
  tags         text,
  key_signature text,
  tempo        integer,
  sections     jsonb not null default '[]'::jsonb,
  max_lines    integer default 4,
  is_favorite  boolean default false,
  -- Soft delete: para que el sync pueda propagar deletes a otros PCs.
  -- En vez de borrar la fila, marcamos deleted_at. El cliente, tras
  -- recibir esta fila, borra su versión local. Limpieza periódica
  -- (manual o pg_cron) elimina filas con deleted_at > 90 días.
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_cloud_songs_user
  on public.cloud_songs(user_id);
create index if not exists idx_cloud_songs_user_updated
  on public.cloud_songs(user_id, updated_at desc);

-- Trigger touch_updated_at — reutiliza el existente del schema v1
drop trigger if exists touch_cloud_songs on public.cloud_songs;
create trigger touch_cloud_songs before update on public.cloud_songs
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
alter table public.cloud_songs enable row level security;

drop policy if exists "Users can read own cloud_songs" on public.cloud_songs;
create policy "Users can read own cloud_songs"
  on public.cloud_songs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own cloud_songs" on public.cloud_songs;
create policy "Users can insert own cloud_songs"
  on public.cloud_songs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own cloud_songs" on public.cloud_songs;
create policy "Users can update own cloud_songs"
  on public.cloud_songs for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own cloud_songs" on public.cloud_songs;
create policy "Users can delete own cloud_songs"
  on public.cloud_songs for delete
  using (auth.uid() = user_id);

-- ---------- Función helper para limpieza periódica ----------
-- Borra filas con soft-delete de más de 90 días. Puedes llamarla
-- manualmente o configurar pg_cron.
create or replace function public.cleanup_deleted_cloud_songs()
returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  delete from public.cloud_songs
    where deleted_at is not null
      and deleted_at < now() - interval '90 days';
  get diagnostics deleted_count = ROW_COUNT;
  return deleted_count;
end;
$$;

-- ---------- Verificación ----------
do $$
declare
  has_table boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cloud_songs'
  ) into has_table;
  if not has_table then
    raise exception 'La tabla cloud_songs no se creó correctamente';
  end if;
  raise notice 'OK · cloud_songs lista para usar';
end $$;
