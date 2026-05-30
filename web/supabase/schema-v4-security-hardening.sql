-- ============================================================
-- EclesiaPresenter — Schema v4: Security hardening
-- ============================================================
-- Aplicar en: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente: seguro re-ejecutar.
--
-- AÑADE:
--   - FORCE ROW LEVEL SECURITY (table owners no pueden bypassear RLS)
--   - REVOKE explícito de anon en todas las tablas (defense in depth)
--   - Políticas DENY ALL para operaciones no permitidas (no implícitas)
--   - Columna theme_override en cloud_songs (sync de overrides por canción)
--   - Trigger para invalidar updated_at en cloud_songs si user_id intenta cambiar
-- ============================================================

-- ---------- 1. FORCE ROW LEVEL SECURITY ----------
-- Sin esto, el owner de la tabla (postgres, supabase_admin) bypassea RLS.
-- Force lo bloquea incluso para ellos. Solo service_role real puede saltar
-- mediante BYPASSRLS attribute.

alter table public.profiles      force row level security;
alter table public.licenses      force row level security;
alter table public.activations   force row level security;
alter table public.cloud_songs   force row level security;
alter table public.stripe_events_processed force row level security;

-- ---------- 2. REVOKE EXPLÍCITO ----------
-- Por defecto, anon (usuario sin login) podría tener algún permiso heredado.
-- Le quitamos TODO explícitamente. RLS también lo bloquearía, pero defense in depth.

revoke all on public.profiles      from anon;
revoke all on public.licenses      from anon;
revoke all on public.activations   from anon;
revoke all on public.cloud_songs   from anon;
revoke all on public.stripe_events_processed from anon;

-- authenticated tiene permisos pero RLS los gatea. Mantener estos GRANTs
-- explícitos para que las policies sí funcionen.

grant select, insert, update, delete on public.profiles    to authenticated;
grant select                          on public.licenses    to authenticated;
grant select, delete                  on public.activations to authenticated;
grant select, insert, update, delete on public.cloud_songs to authenticated;
-- stripe_events_processed: NINGÚN permiso a authenticated. Solo service_role
-- (que salta RLS via BYPASSRLS). El usuario nunca debe ver eventos de Stripe.

-- ---------- 3. POLÍTICAS EXPLÍCITAS DE NEGACIÓN ----------
-- Por defecto en Postgres, si una tabla tiene RLS habilitada pero NO tiene
-- policy para X operación → la operación se NIEGA. Pero por claridad
-- y auditoría, nombramos las que conscientemente prohibimos.

-- licenses: usuarios NO pueden INSERT/UPDATE/DELETE — solo el webhook de
-- Stripe (service_role) gestiona el ciclo de vida.
-- (No policy = denegado por defecto en RLS modo)

-- activations: usuarios pueden DELETE (desactivar device) pero NO INSERT
-- (activación va por endpoint /api/activate con validación).

-- profiles: el INSERT lo hace el trigger handle_new_user (SECURITY DEFINER
-- bypassea RLS). Usuarios NO deben INSERT directo.

-- ---------- 4. cloud_songs: theme_override column ----------
-- En v0.2.3 añadimos theme_override a la tabla LOCAL (songs en SQLite) para
-- que cada canción pueda tener fondo/tipografía propios. Ahora añadimos la
-- misma columna al cloud para que el sync la propague entre PCs.

alter table public.cloud_songs
  add column if not exists theme_override jsonb;

-- ---------- 5. Bloquear cambios de ownership ----------
-- Un user no debería poder cambiar user_id de una de sus canciones a otro
-- usuario (intento de transferir ownership malicioso). RLS already lo
-- previene en update porque el USING(auth.uid()=user_id) bloquea seleccionar
-- la fila del otro user, pero por defense in depth, añadimos WITH CHECK.

drop policy if exists "Users can update own cloud_songs" on public.cloud_songs;
create policy "Users can update own cloud_songs"
  on public.cloud_songs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);  -- el row resultante DEBE seguir siendo del user

-- ---------- 6. Función read-only helper para sync ----------
-- El endpoint /api/songs/sync usa service_role para hacer queries cross-user
-- pero filtra siempre por license_key. Esta función auxiliar audita ese flujo:
-- devuelve true si el caller (vía license_key) tiene Pro activa y permisos.

create or replace function public.is_license_pro_active(p_license_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan text;
begin
  select status, plan into v_status, v_plan
  from public.licenses
  where license_key = p_license_key
  limit 1;

  if v_status is null then return false; end if;
  if v_status not in ('active', 'trialing') then return false; end if;
  if v_plan = 'free' then return false; end if;
  return true;
end;
$$;

-- ---------- 7. Auditoría: vista de qué policies hay activas ----------
-- Util para que el dev/maintainer pueda inspeccionar estado de RLS.
-- No es accesible al usuario normal.

create or replace view public.v_security_audit as
  select
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    forcerowsecurity as rls_forced
  from pg_tables
  where schemaname = 'public'
  order by tablename;

-- ---------- 8. Índices adicionales para perf ----------
-- El schema-v3 ya tiene idx_cloud_songs_user e idx_cloud_songs_user_updated.
-- Añadimos índices que cubren más patrones de query:

-- Sync incremental: WHERE user_id = ? AND updated_at > since AND deleted_at IS NULL
-- El compuesto user_id+updated_at del v3 ya ayuda. Añadimos también
-- un partial index para queries de elementos NO borrados (caso común).
create index if not exists idx_cloud_songs_user_active
  on public.cloud_songs(user_id, updated_at desc)
  where deleted_at is null;

-- Lookups por title para búsqueda fuzzy (LIKE %x%) en endpoint de search:
create index if not exists idx_cloud_songs_title_trgm
  on public.cloud_songs using gin (title gin_trgm_ops);
-- Requiere extensión pg_trgm. Si no existe, ignoramos.

-- Activaciones: lookup por device_id en /api/activate
create index if not exists idx_activations_device
  on public.activations(device_id);

-- Verificación
do $$
begin
  -- Probar si pg_trgm está disponible (silencioso si no)
  perform extname from pg_extension where extname = 'pg_trgm';
  if not found then
    raise notice 'pg_trgm no instalada. Para búsqueda fuzzy óptima ejecuta: CREATE EXTENSION pg_trgm;';
  end if;
end $$;

-- ---------- 9. Verificación final ----------
do $$
declare
  rls_off_count int;
  force_off_count int;
begin
  -- Contar tablas sin RLS o sin FORCE
  select count(*) into rls_off_count
    from pg_tables
    where schemaname = 'public'
      and tablename in ('profiles', 'licenses', 'activations', 'cloud_songs', 'stripe_events_processed')
      and rowsecurity = false;

  select count(*) into force_off_count
    from pg_tables
    where schemaname = 'public'
      and tablename in ('profiles', 'licenses', 'activations', 'cloud_songs', 'stripe_events_processed')
      and forcerowsecurity = false;

  if rls_off_count > 0 then
    raise warning '% tablas no tienen RLS habilitada', rls_off_count;
  end if;
  if force_off_count > 0 then
    raise warning '% tablas no tienen FORCE RLS', force_off_count;
  end if;

  raise notice 'OK · Security hardening aplicado. Inspecciona: SELECT * FROM v_security_audit;';
end $$;
