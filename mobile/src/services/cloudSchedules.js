/**
 * cloudSchedules.js (C3a)
 *
 * CRUD de listas del día cloud — escribe DIRECTO en Supabase (tabla
 * cloud_schedules, RLS scoping por user_id) con la sesión de C1. Mismo
 * patrón que cloudSongs.js (C2): soft-delete via deleted_at+updated_at,
 * updated_at SIEMPRE en updates, user_id explícito en insert, errores a
 * códigos estables via mapCloudError (reutilizado de cloudSongs).
 *
 * El desktop NO sincroniza esta tabla: la importa on-demand (C3b). El
 * shape de cada fila es el contrato — ver header de
 * web/supabase/schema-v6-cloud-schedules.sql (fuente de verdad).
 *
 * ============ SHAPE de cloud_schedules ============
 *   id           uuid PK (default gen_random_uuid() — NO lo mandamos)
 *   user_id      uuid NOT NULL — la RLS de INSERT exige
 *                `with check (auth.uid() = user_id)` y la columna no
 *                tiene default ⇒ el INSERT DEBE incluirlo explícito.
 *   title        text NOT NULL (validamos 1-200)
 *   service_date date|null — string 'YYYY-MM-DD' (input type=date)
 *   items        jsonb — array (máx 100) de items, 3 shapes por type:
 *                  { key, type:'song',  cloudSongId, title }
 *                  { key, type:'bible', reference<=100, version<=16 }
 *                  { key, type:'note',  title<=200, text<=2000 }
 *                `key` = id local estable (reorder/dedup). El item bible
 *                lleva SOLO la referencia: el desktop resuelve el texto
 *                contra sus JSON al importar (C3b).
 *   items_count  integer GENERATED (jsonb_array_length(items)) — solo
 *                lectura; permite a list() devolver el nº de items SIN
 *                traer el jsonb completo.
 *   is_template  boolean default false
 *   deleted_at   timestamptz|null — SOFT delete. NUNCA .delete().
 *   created_at / updated_at — trigger touch_updated_at en el server;
 *                mandamos updated_at igual en cada UPDATE (paridad C2).
 * ==================================================
 *
 * Errores: códigos estables 'network' | 'unauthorized' | 'not_found' |
 * 'validation' | 'unknown' — la UI los traduce via i18n (planner.err.*).
 * Los de validación añaden { field, reason }.
 */
import { getSupabase } from './supabaseClient.js'
import { mapCloudError } from './cloudSongs.js'

const TABLE = 'cloud_schedules'
// items_count es columna GENERADA en el schema v6 — el listado no paga
// el coste de transferir el jsonb completo (decisión documentada ahí).
const LIST_COLUMNS = 'id, title, service_date, is_template, items_count, updated_at'
const FULL_COLUMNS = 'id, title, service_date, items, is_template, created_at, updated_at'
const LIST_LIMIT = 100

export const LIMITS = Object.freeze({
  TITLE_MAX: 200,
  ITEMS_MAX: 100,
  SONG_TITLE_MAX: 200,
  BIBLE_REF_MAX: 100,
  BIBLE_VERSION_MAX: 16,
  NOTE_TITLE_MAX: 200,
  NOTE_TEXT_MAX: 2000,
})

export const ITEM_TYPES = Object.freeze(['song', 'bible', 'note'])

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Key local estable para un item (reorder/dedup en el editor y en el
 * import del desktop). crypto.randomUUID existe en WebView/navegadores
 * modernos; fallback no-cripto suficiente para un id de UI.
 */
export function makeItemKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* ignore */ }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/* ============================================================== */
/* Validación client-side                                          */
/* ============================================================== */

function _validItem(it) {
  if (!it || typeof it !== 'object') return false
  switch (it.type) {
    case 'song':
      return typeof it.cloudSongId === 'string' && it.cloudSongId.trim() !== ''
        && typeof it.title === 'string' && it.title.trim() !== ''
    case 'bible': {
      const ref = String(it.reference ?? '').trim()
      const ver = String(it.version ?? '').trim()
      return ref !== '' && ref.length <= LIMITS.BIBLE_REF_MAX
        && ver !== '' && ver.length <= LIMITS.BIBLE_VERSION_MAX
    }
    case 'note': {
      const title = String(it.title ?? '').trim()
      return title !== '' && title.length <= LIMITS.NOTE_TITLE_MAX
        && String(it.text ?? '').length <= LIMITS.NOTE_TEXT_MAX
    }
    default:
      return false
  }
}

/**
 * Valida una lista completa (create) o un patch (update, con
 * { partial: true } solo valida los campos presentes).
 * @returns {null | { field: string, reason: string }}
 */
export function validateSchedule(input, { partial = false } = {}) {
  const src = input && typeof input === 'object' ? input : {}

  if (!partial || 'title' in src) {
    const title = String(src.title ?? '').trim()
    if (!title) return { field: 'title', reason: 'required' }
    if (title.length > LIMITS.TITLE_MAX) return { field: 'title', reason: 'too_long' }
  }
  if ('service_date' in src && src.service_date != null && src.service_date !== '') {
    if (!DATE_RE.test(String(src.service_date))) {
      return { field: 'service_date', reason: 'invalid' }
    }
  }
  if ('items' in src && src.items != null) {
    if (!Array.isArray(src.items)) return { field: 'items', reason: 'invalid' }
    if (src.items.length > LIMITS.ITEMS_MAX) return { field: 'items', reason: 'too_many' }
    for (const it of src.items) {
      if (!_validItem(it)) return { field: 'items', reason: 'invalid' }
    }
  }
  return null
}

/* ============================================================== */
/* Normalización al shape cloud (contrato del schema v6)           */
/* ============================================================== */

// Cada item se emite con EXACTAMENTE los campos de su shape — campos
// extra del editor (estado UI, flags) no viajan a la BD.
function _normalizeItem(it) {
  const key = typeof it.key === 'string' && it.key ? it.key : makeItemKey()
  switch (it.type) {
    case 'song':
      return {
        key,
        type: 'song',
        cloudSongId: String(it.cloudSongId).trim(),
        title: String(it.title).trim().slice(0, LIMITS.SONG_TITLE_MAX),
      }
    case 'bible':
      return {
        key,
        type: 'bible',
        reference: String(it.reference).trim().slice(0, LIMITS.BIBLE_REF_MAX),
        version: String(it.version).trim().slice(0, LIMITS.BIBLE_VERSION_MAX),
      }
    case 'note':
    default:
      return {
        key,
        type: 'note',
        title: String(it.title).trim().slice(0, LIMITS.NOTE_TITLE_MAX),
        text: String(it.text ?? '').slice(0, LIMITS.NOTE_TEXT_MAX),
      }
  }
}

const WRITABLE_FIELDS = ['title', 'service_date', 'items', 'is_template']

/**
 * Normaliza un input al shape cloud. Con partial=true solo emite los
 * campos presentes en el input.
 */
function _normalizeForWrite(input, { partial = false } = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const out = {}
  for (const field of WRITABLE_FIELDS) {
    if (partial && !(field in src)) continue
    switch (field) {
      case 'title':
        out.title = String(src.title ?? '').trim().slice(0, LIMITS.TITLE_MAX)
        break
      case 'service_date':
        out.service_date = DATE_RE.test(String(src.service_date ?? '')) ? src.service_date : null
        break
      case 'items':
        out.items = Array.isArray(src.items) ? src.items.map(_normalizeItem) : []
        break
      case 'is_template':
        out.is_template = !!src.is_template
        break
    }
  }
  return out
}

async function _client() {
  try {
    return await getSupabase()
  } catch {
    return null
  }
}

/* ============================================================== */
/* CRUD                                                            */
/* ============================================================== */

/**
 * Lista las listas del día del usuario (RLS scopea a las propias), sin
 * las soft-deleted, más reciente primero. Sin el jsonb de items: el nº
 * de items viaja en la columna generada items_count del schema v6.
 * @returns {Promise<{ok:true, items:Array} | {ok:false, error:string}>}
 */
export async function list() {
  const supabase = await _client()
  if (!supabase) return { ok: false, error: 'unauthorized' }
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(LIST_COLUMNS)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)
    if (error) return { ok: false, error: mapCloudError(error) }
    return { ok: true, items: Array.isArray(data) ? data : [] }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * Una lista por id (uuid), con sus items completos (editor).
 * @returns {Promise<{ok:true, schedule:Object} | {ok:false, error:string}>}
 */
export async function get(id) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'not_found' }
  const supabase = await _client()
  if (!supabase) return { ok: false, error: 'unauthorized' }
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(FULL_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { ok: false, error: mapCloudError(error) }
    if (!data) return { ok: false, error: 'not_found' }
    return { ok: true, schedule: data }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * Crea una lista. El INSERT incluye user_id explícito (la RLS lo exige
 * y la columna no tiene default).
 * @returns {Promise<{ok:true, schedule:Object} | {ok:false, error:string, field?:string, reason?:string}>}
 */
export async function create(input) {
  const issue = validateSchedule(input)
  if (issue) return { ok: false, error: 'validation', ...issue }
  const supabase = await _client()
  if (!supabase) return { ok: false, error: 'unauthorized' }
  try {
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess?.session?.user?.id
    if (!userId) return { ok: false, error: 'unauthorized' }
    const row = { user_id: userId, ..._normalizeForWrite(input) }
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select(FULL_COLUMNS)
      .single()
    if (error) return { ok: false, error: mapCloudError(error) }
    return { ok: true, schedule: data }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * Actualiza una lista. Patch PARCIAL: solo pisa los campos presentes.
 * SIEMPRE setea updated_at (paridad con cloudSongs; el trigger del
 * server lo pisa con now(), aún mejor).
 * @returns {Promise<{ok:true, schedule:Object} | {ok:false, error:string, field?:string, reason?:string}>}
 */
export async function update(id, patch) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'not_found' }
  const issue = validateSchedule(patch, { partial: true })
  if (issue) return { ok: false, error: 'validation', ...issue }
  const supabase = await _client()
  if (!supabase) return { ok: false, error: 'unauthorized' }
  try {
    const row = _normalizeForWrite(patch, { partial: true })
    row.updated_at = new Date().toISOString()
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .is('deleted_at', null)
      .select(FULL_COLUMNS)
      .maybeSingle()
    if (error) return { ok: false, error: mapCloudError(error) }
    // RLS silencia updates a filas ajenas/borradas → 0 filas afectadas.
    if (!data) return { ok: false, error: 'not_found' }
    return { ok: true, schedule: data }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * SOFT-delete: marca deleted_at (+updated_at). NUNCA hard delete.
 * @returns {Promise<{ok:true} | {ok:false, error:string}>}
 */
export async function remove(id) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'not_found' }
  const supabase = await _client()
  if (!supabase) return { ok: false, error: 'unauthorized' }
  try {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from(TABLE)
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: mapCloudError(error) }
    if (!data) return { ok: false, error: 'not_found' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}
