-- ============================================================
-- EclesiaPresenter — Schema v6: Planificador de listas del día
-- ============================================================
-- Pega este SQL en Supabase Dashboard → SQL Editor → New query → Run.
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
--
-- AÑADE:
--   - Tabla cloud_schedules (listas del día planificadas desde el móvil;
--     el desktop las importará en C3b)
--   - RLS: cada usuario solo ve sus propias listas
--   - Índices para queries eficientes (lista ordenada por updated_at)
--
-- ============ CONTRATO de items (jsonb) — lo consume C3b ============
-- items = array (máx 100) de objetos, uno de estos 3 shapes según type:
--
--   { "key": string,            -- uuid local, estable para reorder/dedup
--     "type": "song",
--     "cloudSongId": uuid,      -- FK lógica a cloud_songs.id (sin FK real:
--                               -- la canción puede borrarse después)
--     "title": string }         -- denormalizado para mostrar sin join
--
--   { "key": string,
--     "type": "bible",
--     "reference": string,      -- <=100 chars, ej "Juan 3:16-18". SOLO la
--                               -- referencia — el desktop resuelve el
--                               -- texto contra sus JSON al importar
--     "version": string }       -- <=16 chars, ej "rvr1960"
--
--   { "key": string,
--     "type": "note",
--     "title": string,          -- <=200 chars
--     "text": string }          -- <=2000 chars
-- =====================================================================

-- ---------- cloud_schedules ----------
create table if not exists public.cloud_schedules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  service_date date,
  items        jsonb not null default '[]'::jsonb,
  -- Columna generada: nº de items sin traer el jsonb completo en list().
  -- jsonb_array_length es immutable; items siempre es array (default '[]'
  -- y el cliente normaliza antes de escribir).
  items_count  integer generated always as (jsonb_array_length(items)) stored,
  is_template  boolean default false,
  -- Soft delete: para que el sync pueda propagar deletes a otros
  -- dispositivos. En vez de borrar la fila, marcamos deleted_at. El
  -- cliente, tras recibir esta fila, borra su versión local. Limpieza
  -- periódica (manual o pg_cron) elimina filas con deleted_at > 90 días.
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_cloud_schedules_user
  on public.cloud_schedules(user_id);
create index if not exists idx_cloud_schedules_user_updated
  on public.cloud_schedules(user_id, updated_at desc);

-- Trigger touch_updated_at — reutiliza el existente del schema v1
drop trigger if exists touch_cloud_schedules on public.cloud_schedules;
create trigger touch_cloud_schedules before update on public.cloud_schedules
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
alter table public.cloud_schedules enable row level security;

drop policy if exists "Users can read own cloud_schedules" on public.cloud_schedules;
create policy "Users can read own cloud_schedules"
  on public.cloud_schedules for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own cloud_schedules" on public.cloud_schedules;
create policy "Users can insert own cloud_schedules"
  on public.cloud_schedules for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own cloud_schedules" on public.cloud_schedules;
create policy "Users can update own cloud_schedules"
  on public.cloud_schedules for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own cloud_schedules" on public.cloud_schedules;
create policy "Users can delete own cloud_schedules"
  on public.cloud_schedules for delete
  using (auth.uid() = user_id);

-- ---------- Función helper para limpieza periódica ----------
-- Borra filas con soft-delete de más de 90 días. Puedes llamarla
-- manualmente o configurar pg_cron.
create or replace function public.cleanup_deleted_cloud_schedules()
returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  delete from public.cloud_schedules
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
    where table_schema = 'public' and table_name = 'cloud_schedules'
  ) into has_table;
  if not has_table then
    raise exception 'La tabla cloud_schedules no se creó correctamente';
  end if;
  raise notice 'OK · cloud_schedules lista para usar';
end $$;
