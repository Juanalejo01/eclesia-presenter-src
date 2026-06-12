/**
 * cloudSongs.js (C2)
 *
 * CRUD de canciones cloud del móvil — escribe DIRECTO en Supabase
 * (tabla cloud_songs, RLS scoping por user_id) con la sesión de C1.
 * El desktop las baja con su cloudSync existente (cada 5 min + triggers),
 * así que el shape de cada fila DEBE ser byte-compatible con lo que el
 * server escribe en web/app/api/songs/sync/route.js (fuente de verdad).
 *
 * ============ SHAPE VERIFICADO de cloud_songs ============
 * (web/supabase/schema-v3-cloudsync.sql + route.js + src/main/cloudSync.js)
 *
 *   id            uuid PK (default gen_random_uuid() — NO lo mandamos)
 *   user_id       uuid NOT NULL — la RLS de INSERT exige
 *                 `with check (auth.uid() = user_id)` y la columna no
 *                 tiene default ⇒ el INSERT DEBE incluirlo explícito.
 *   title         text NOT NULL  (server trunca a 500; validamos 1-200)
 *   author        text|null      (server trunca a 200)
 *   tags          text|null      — STRING CSV ('himno,adoración'), NUNCA
 *                 array: el server hace String(s.tags).slice(0,500) y el
 *                 desktop lo guarda tal cual en su columna TEXT.
 *   key_signature text|null      (server trunca a 16)
 *   tempo         integer|null   (validamos 0-300 o null)
 *   sections      jsonb — array de { type, label, text }:
 *                   type:  'verse'|'chorus'|'bridge'|'intro'|'outro'|'tag'
 *                   label: string libre ('Estrofa 1', 'Coro'...)
 *                   text:  string con la letra (\n entre líneas)
 *                 Mismo modelo que songToSlides / SQLite del desktop
 *                 (src/main/database.js JSON.parse de sections).
 *   max_lines     integer default 4
 *   is_favorite   boolean default false
 *   deleted_at    timestamptz|null — SOFT delete. El desktop propaga la
 *                 eliminación local leyendo deleted_at; un hard DELETE
 *                 dejaría la canción huérfana en cada PC. NUNCA .delete().
 *   created_at    timestamptz default now()
 *   updated_at    timestamptz — last-write-wins del sync del desktop.
 *                 Cada UPDATE lo setea SIEMPRE (además existe el trigger
 *                 touch_updated_at que lo pisa con now() del server, aún
 *                 mejor para LWW; lo mandamos igual por si el trigger
 *                 desaparece).
 * =========================================================
 *
 * Errores: SIEMPRE códigos estables — 'network' | 'unauthorized' |
 * 'not_found' | 'validation' | 'unknown' — la UI los traduce via i18n
 * (cloudSongs.err.*). Los de validación añaden { field, reason }.
 *
 * Sin cache: fetch on demand. Aquí se EDITA el repertorio con calma,
 * no se opera un culto en vivo (eso es el modo PC con songsCache).
 */
import { getSupabase } from './supabaseClient.js'

const TABLE = 'cloud_songs'
const LIST_COLUMNS = 'id, title, author, tags, updated_at'
const FULL_COLUMNS =
  'id, title, author, tags, key_signature, tempo, sections, max_lines, is_favorite, created_at, updated_at'
const LIST_LIMIT = 200

export const LIMITS = Object.freeze({
  TITLE_MAX: 200,
  AUTHOR_MAX: 200,
  TAGS_MAX: 500,
  KEY_MAX: 16,
  SECTIONS_MAX: 100,
  SECTION_LABEL_MAX: 100,
  SECTION_TEXT_MAX: 5000,
  TEMPO_MIN: 0,
  TEMPO_MAX: 300,
})

/* ============================================================== */
/* Mapeo de errores Supabase/PostgREST → códigos estables          */
/* ============================================================== */

/**
 * Reduce cualquier error (PostgrestError, AuthError, TypeError de fetch)
 * a un código estable. Exportada para tests.
 */
export function mapCloudError(err) {
  if (!err) return 'unknown'
  const status = typeof err.status === 'number' ? err.status : null
  const code = typeof err.code === 'string' ? err.code : ''
  const msg = String(err.message || '').toLowerCase()

  if (status === 401 || status === 403) return 'unauthorized'
  // PGRST301 = JWT inválido/expirado; 42501 = RLS violation
  if (code === 'PGRST301' || code === '42501'
    || msg.includes('jwt') || msg.includes('row-level security')
    || msg.includes('not authorized')) {
    return 'unauthorized'
  }
  // PGRST116 = 0 filas donde se esperaba 1; 22P02 = uuid malformado
  if (code === 'PGRST116' || code === '22P02') return 'not_found'
  if (err.name === 'TypeError' || code === 'network_error'
    || msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network'
  }
  return 'unknown'
}

/* ============================================================== */
/* Validación client-side                                          */
/* ============================================================== */

/**
 * Valida una canción completa (create) o un patch (update, con
 * { partial: true } solo valida los campos presentes).
 * @returns {null | { field: string, reason: string }}
 */
export function validateSong(input, { partial = false } = {}) {
  const src = input && typeof input === 'object' ? input : {}

  if (!partial || 'title' in src) {
    const title = String(src.title ?? '').trim()
    if (!title) return { field: 'title', reason: 'required' }
    if (title.length > LIMITS.TITLE_MAX) return { field: 'title', reason: 'too_long' }
  }
  if ('sections' in src && src.sections != null) {
    if (!Array.isArray(src.sections)) return { field: 'sections', reason: 'invalid' }
    if (src.sections.length > LIMITS.SECTIONS_MAX) return { field: 'sections', reason: 'too_many' }
    for (const s of src.sections) {
      if (String(s?.text ?? '').length > LIMITS.SECTION_TEXT_MAX) {
        return { field: 'sections', reason: 'text_too_long' }
      }
    }
  }
  if ('tempo' in src && src.tempo != null && src.tempo !== '') {
    const n = Number(src.tempo)
    if (!Number.isFinite(n) || n < LIMITS.TEMPO_MIN || n > LIMITS.TEMPO_MAX) {
      return { field: 'tempo', reason: 'invalid' }
    }
  }
  return null
}

/**
 * Resuelve una etiqueta libre a su type canónico de sección, o null.
 * Port del typeFromLabel del desktop (src/renderer/services/songCanvas.js)
 * con aliases EN/PT añadidos (la UI del móvil es trilingüe).
 */
const SECTION_ALIASES = {
  estrofa: 'verse', estrofe: 'verse', verso: 'verse', verse: 'verse',
  coro: 'chorus', estribillo: 'chorus', refrao: 'chorus', chorus: 'chorus',
  puente: 'bridge', ponte: 'bridge', bridge: 'bridge',
  intro: 'intro', introduccion: 'intro', introducao: 'intro',
  final: 'outro', outro: 'outro', salida: 'outro', saida: 'outro',
  tag: 'tag', coda: 'tag',
}

const _normalize = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim()

export function inferSectionType(label) {
  const norm = _normalize(label).replace(/[\s\-·.:]*\d+$/, '').trim()
  if (!norm) return null
  if (SECTION_ALIASES[norm]) return SECTION_ALIASES[norm]
  const first = norm.split(/\s+/)[0]
  return SECTION_ALIASES[first] || null
}

/* ============================================================== */
/* Normalización al shape cloud (paridad con route.js)             */
/* ============================================================== */

function _strOrNull(value, max) {
  const s = String(value ?? '').trim()
  return s ? s.slice(0, max) : null
}

function _tempoOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function _normalizeSections(sections) {
  if (!Array.isArray(sections)) return []
  return sections.map((s) => ({
    type: typeof s?.type === 'string' && s.type ? s.type : 'verse',
    label: String(s?.label ?? '').slice(0, LIMITS.SECTION_LABEL_MAX),
    text: String(s?.text ?? '').slice(0, LIMITS.SECTION_TEXT_MAX),
  }))
}

const WRITABLE_FIELDS = ['title', 'author', 'tags', 'key_signature', 'tempo', 'sections', 'max_lines', 'is_favorite']

/**
 * Normaliza un input al shape cloud. Con partial=true solo emite los
 * campos presentes en el input (los updates parciales no deben resetear
 * tempo/max_lines/etc. que el editor del móvil no gestiona).
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
      case 'author':
        out.author = _strOrNull(src.author, LIMITS.AUTHOR_MAX)
        break
      case 'tags':
        // STRING CSV — ver shape arriba. Si llega array, lo unimos.
        out.tags = _strOrNull(Array.isArray(src.tags) ? src.tags.join(',') : src.tags, LIMITS.TAGS_MAX)
        break
      case 'key_signature':
        out.key_signature = _strOrNull(src.key_signature, LIMITS.KEY_MAX)
        break
      case 'tempo':
        out.tempo = _tempoOrNull(src.tempo)
        break
      case 'sections':
        out.sections = _normalizeSections(src.sections)
        break
      case 'max_lines':
        out.max_lines = Number.isInteger(src.max_lines) && src.max_lines > 0 ? src.max_lines : 4
        break
      case 'is_favorite':
        out.is_favorite = !!src.is_favorite
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
 * Lista las canciones cloud del usuario (RLS scopea a las propias),
 * sin las soft-deleted, más reciente primero.
 * Búsqueda ilike server-side por título/autor — el volumen esperado
 * (decenas/cientos) no justifica indexar client-side.
 * @param {{search?: string}} opts
 * @returns {Promise<{ok:true, items:Array} | {ok:false, error:string}>}
 */
export async function list({ search = '' } = {}) {
  const supabase = await _client()
  if (!supabase) return { ok: false, error: 'unauthorized' }
  try {
    let query = supabase
      .from(TABLE)
      .select(LIST_COLUMNS)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)
    const term = _sanitizeSearch(search)
    if (term) {
      query = query.or(`title.ilike.%${term}%,author.ilike.%${term}%`)
    }
    const { data, error } = await query
    if (error) return { ok: false, error: mapCloudError(error) }
    return { ok: true, items: Array.isArray(data) ? data : [] }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

// Quita los chars que rompen la sintaxis de .or() de PostgREST (coma,
// paréntesis, comillas) y escapa los wildcards de LIKE.
function _sanitizeSearch(raw) {
  return String(raw ?? '')
    .slice(0, 100)
    .replace(/[,()"]/g, ' ')
    .replace(/[\\%_]/g, '\\$&')
    .trim()
}

/**
 * Una canción por id (uuid), con todos los campos del editor.
 * @returns {Promise<{ok:true, song:Object} | {ok:false, error:string}>}
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
    return { ok: true, song: data }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * Crea una canción. El INSERT incluye user_id explícito (la RLS lo
 * exige y la columna no tiene default — ver shape arriba).
 * @returns {Promise<{ok:true, song:Object} | {ok:false, error:string, field?:string, reason?:string}>}
 */
export async function create(input) {
  const issue = validateSong(input)
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
    return { ok: true, song: data }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * Actualiza una canción. Patch PARCIAL: solo pisa los campos presentes.
 * SIEMPRE setea updated_at (el last-write-wins del sync del desktop
 * depende de ello).
 * @returns {Promise<{ok:true, song:Object} | {ok:false, error:string, field?:string, reason?:string}>}
 */
export async function update(id, patch) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'not_found' }
  const issue = validateSong(patch, { partial: true })
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
    return { ok: true, song: data }
  } catch (e) {
    return { ok: false, error: mapCloudError(e) }
  }
}

/**
 * SOFT-delete: marca deleted_at (+updated_at para que el pull del
 * desktop la vea como cambio y borre su copia local). NUNCA hard
 * delete — ver shape arriba.
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
