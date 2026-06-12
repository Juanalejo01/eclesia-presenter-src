/**
 * cloudSongs.test.js (C2)
 *
 * CRUD del servicio de canciones cloud contra un mock chainable de
 * supabase-js. Lo crítico es el SHAPE EXACTO que escribimos en
 * cloud_songs (el desktop lo importa tal cual via su cloudSync):
 *   - insert con user_id explícito + tags STRING + sections normalizadas
 *   - update SIEMPRE con updated_at (last-write-wins del desktop)
 *   - remove = SOFT delete (deleted_at + updated_at), jamás .delete()
 * Más validación client-side y mapeo de errores a códigos estables.
 */

let mockClient = null

jest.mock('../src/services/supabaseClient.js', () => ({
  getSupabase: jest.fn(async () => mockClient),
}))

import {
  list, get, create, update, remove,
  mapCloudError, validateSong, inferSectionType, LIMITS,
} from '../src/services/cloudSongs.js'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

/** Builder chainable thenable: cada método registra la llamada y devuelve
 *  el propio builder; await resuelve con `result` (o rechaza con `reject`). */
function makeBuilder(result, { reject = null } = {}) {
  const b = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'is', 'or', 'order', 'limit', 'maybeSingle', 'single']
  for (const m of methods) {
    b[m] = jest.fn(() => b)
  }
  b.then = (resolve, rej) => (reject
    ? Promise.reject(reject).then(resolve, rej)
    : Promise.resolve(result).then(resolve, rej))
  return b
}

function makeClient(builder, { userId = 'user-1' } = {}) {
  return {
    from: jest.fn(() => builder),
    auth: {
      getSession: jest.fn(async () => ({
        data: userId ? { session: { user: { id: userId } } } : { session: null },
      })),
    },
  }
}

beforeEach(() => {
  mockClient = null
})

/* ================= list ================= */

test('list: query correcta (tabla, filtro soft-delete, orden) y devuelve items', async () => {
  const items = [{ id: 'a1', title: 'Sublime Gracia', author: null, tags: null, updated_at: '2026-06-12T10:00:00Z' }]
  const builder = makeBuilder({ data: items, error: null })
  mockClient = makeClient(builder)

  const res = await list()

  expect(res).toEqual({ ok: true, items })
  expect(mockClient.from).toHaveBeenCalledWith('cloud_songs')
  expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
  expect(builder.order).toHaveBeenCalledWith('updated_at', { ascending: false })
  expect(builder.or).not.toHaveBeenCalled()
})

test('list con search: ilike por title/author con término sanitizado', async () => {
  const builder = makeBuilder({ data: [], error: null })
  mockClient = makeClient(builder)

  await list({ search: 'gracia' })
  expect(builder.or).toHaveBeenCalledWith('title.ilike.%gracia%,author.ilike.%gracia%')

  // Chars que romperían la sintaxis de .or() se eliminan; wildcards escapados.
  builder.or.mockClear()
  await list({ search: 'a,b(c)100%' })
  const arg = builder.or.mock.calls[0][0]
  // El término sanitizado no conserva , ( ) " y escapa el % del usuario
  expect(arg).toBe('title.ilike.%a b c 100\\%%,author.ilike.%a b c 100\\%%')
})

test('list: error PostgREST de JWT → unauthorized', async () => {
  const builder = makeBuilder({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } })
  mockClient = makeClient(builder)
  const res = await list()
  expect(res).toEqual({ ok: false, error: 'unauthorized' })
})

test('list: fallo de red (fetch TypeError) → network', async () => {
  const err = new TypeError('Failed to fetch')
  const builder = makeBuilder(null, { reject: err })
  mockClient = makeClient(builder)
  const res = await list()
  expect(res).toEqual({ ok: false, error: 'network' })
})

test('list: sin cliente Supabase (build sin credenciales) → unauthorized', async () => {
  mockClient = null
  const res = await list()
  expect(res).toEqual({ ok: false, error: 'unauthorized' })
})

/* ================= get ================= */

test('get: devuelve la canción y filtra soft-deleted', async () => {
  const song = { id: 'a1', title: 'X', sections: [] }
  const builder = makeBuilder({ data: song, error: null })
  mockClient = makeClient(builder)

  const res = await get('a1')
  expect(res).toEqual({ ok: true, song })
  expect(builder.eq).toHaveBeenCalledWith('id', 'a1')
  expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
  expect(builder.maybeSingle).toHaveBeenCalled()
})

test('get: 0 filas → not_found; id inválido → not_found sin tocar la red', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)
  expect(await get('nope')).toEqual({ ok: false, error: 'not_found' })

  mockClient.from.mockClear()
  expect(await get(null)).toEqual({ ok: false, error: 'not_found' })
  expect(mockClient.from).not.toHaveBeenCalled()
})

/* ================= create ================= */

test('create: INSERT con el shape cloud EXACTO (user_id, tags string, sections normalizadas, defaults)', async () => {
  const builder = makeBuilder({ data: { id: 'new-1' }, error: null })
  mockClient = makeClient(builder)

  const res = await create({
    title: '  Mi Canción  ',
    author: 'Autor X',
    tags: 'himno, adoración',
    sections: [
      { type: 'chorus', label: 'Coro', text: 'Letra del coro' },
      { label: 'Estrofa 1', text: 'Letra' },          // sin type → verse
    ],
  })

  expect(res.ok).toBe(true)
  expect(builder.insert).toHaveBeenCalledWith({
    user_id: 'user-1',                                 // RLS lo exige, sin default
    title: 'Mi Canción',
    author: 'Autor X',
    tags: 'himno, adoración',                          // STRING CSV, nunca array
    key_signature: null,
    tempo: null,
    sections: [
      { type: 'chorus', label: 'Coro', text: 'Letra del coro' },
      { type: 'verse', label: 'Estrofa 1', text: 'Letra' },
    ],
    max_lines: 4,
    is_favorite: false,
  })
})

test('create: tags array se serializa a string CSV', async () => {
  const builder = makeBuilder({ data: { id: 'new-2' }, error: null })
  mockClient = makeClient(builder)
  await create({ title: 'T', tags: ['himno', 'coro'] })
  expect(builder.insert.mock.calls[0][0].tags).toBe('himno,coro')
})

test('create: sin sesión → unauthorized y NO inserta', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder, { userId: null })
  const res = await create({ title: 'T' })
  expect(res).toEqual({ ok: false, error: 'unauthorized' })
  expect(builder.insert).not.toHaveBeenCalled()
})

test('create: validación client-side bloquea sin llamar a Supabase', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)

  expect(await create({ title: '' }))
    .toEqual({ ok: false, error: 'validation', field: 'title', reason: 'required' })
  expect(await create({ title: '   ' }))
    .toEqual({ ok: false, error: 'validation', field: 'title', reason: 'required' })
  expect(await create({ title: 'x'.repeat(201) }))
    .toEqual({ ok: false, error: 'validation', field: 'title', reason: 'too_long' })
  expect(await create({ title: 'T', sections: Array.from({ length: 101 }, () => ({ text: 'x' })) }))
    .toEqual({ ok: false, error: 'validation', field: 'sections', reason: 'too_many' })
  expect(await create({ title: 'T', sections: [{ text: 'x'.repeat(5001) }] }))
    .toEqual({ ok: false, error: 'validation', field: 'sections', reason: 'text_too_long' })
  expect(await create({ title: 'T', tempo: 400 }))
    .toEqual({ ok: false, error: 'validation', field: 'tempo', reason: 'invalid' })

  expect(mockClient.from).not.toHaveBeenCalled()
})

/* ================= update ================= */

test('update: SIEMPRE setea updated_at ISO (last-write-wins del desktop)', async () => {
  const builder = makeBuilder({ data: { id: 'a1', title: 'Nuevo' }, error: null })
  mockClient = makeClient(builder)

  const res = await update('a1', { title: 'Nuevo' })

  expect(res.ok).toBe(true)
  expect(builder.update).toHaveBeenCalledTimes(1)
  const row = builder.update.mock.calls[0][0]
  expect(row.title).toBe('Nuevo')
  expect(row.updated_at).toMatch(ISO_RE)
  expect(builder.eq).toHaveBeenCalledWith('id', 'a1')
  expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
})

test('update: patch PARCIAL — no pisa campos que el móvil no gestiona', async () => {
  const builder = makeBuilder({ data: { id: 'a1' }, error: null })
  mockClient = makeClient(builder)

  await update('a1', { title: 'T', sections: [{ type: 'verse', label: 'E1', text: 'x' }] })
  const row = builder.update.mock.calls[0][0]
  expect(Object.keys(row).sort()).toEqual(['sections', 'title', 'updated_at'])
  // tempo / key_signature / max_lines / is_favorite NO viajan si no están en el patch
  expect(row).not.toHaveProperty('tempo')
  expect(row).not.toHaveProperty('max_lines')
})

test('update: 0 filas afectadas (RLS / borrada) → not_found', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)
  expect(await update('a1', { title: 'T' })).toEqual({ ok: false, error: 'not_found' })
})

test('update: valida el patch (título vacío explícito → validation)', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)
  expect(await update('a1', { title: '' }))
    .toEqual({ ok: false, error: 'validation', field: 'title', reason: 'required' })
  expect(mockClient.from).not.toHaveBeenCalled()
})

/* ================= remove (soft delete) ================= */

test('remove: SOFT delete — UPDATE con deleted_at + updated_at, jamás .delete()', async () => {
  const builder = makeBuilder({ data: { id: 'a1' }, error: null })
  mockClient = makeClient(builder)

  const res = await remove('a1')

  expect(res).toEqual({ ok: true })
  expect(builder.delete).not.toHaveBeenCalled()
  expect(builder.update).toHaveBeenCalledTimes(1)
  const row = builder.update.mock.calls[0][0]
  expect(Object.keys(row).sort()).toEqual(['deleted_at', 'updated_at'])
  expect(row.deleted_at).toMatch(ISO_RE)
  expect(row.updated_at).toBe(row.deleted_at)
  expect(builder.eq).toHaveBeenCalledWith('id', 'a1')
})

test('remove: ya borrada / ajena → not_found', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)
  expect(await remove('a1')).toEqual({ ok: false, error: 'not_found' })
})

/* ================= mapCloudError ================= */

test('mapCloudError: códigos estables para cada familia de error', () => {
  expect(mapCloudError(null)).toBe('unknown')
  expect(mapCloudError({ status: 401 })).toBe('unauthorized')
  expect(mapCloudError({ status: 403 })).toBe('unauthorized')
  expect(mapCloudError({ code: 'PGRST301', message: 'JWT expired' })).toBe('unauthorized')
  expect(mapCloudError({ code: '42501', message: 'new row violates row-level security' })).toBe('unauthorized')
  expect(mapCloudError({ code: 'PGRST116', message: 'multiple (or no) rows returned' })).toBe('not_found')
  expect(mapCloudError({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe('not_found')
  expect(mapCloudError(new TypeError('Failed to fetch'))).toBe('network')
  expect(mapCloudError({ message: 'network request timeout' })).toBe('network')
  expect(mapCloudError({ message: 'algo raro' })).toBe('unknown')
})

/* ================= validateSong / inferSectionType ================= */

test('validateSong: casos válidos devuelven null', () => {
  expect(validateSong({ title: 'T' })).toBeNull()
  expect(validateSong({ title: 'T', tempo: null })).toBeNull()
  expect(validateSong({ title: 'T', tempo: 0 })).toBeNull()
  expect(validateSong({ title: 'T', tempo: 300 })).toBeNull()
  expect(validateSong({ title: 'x'.repeat(LIMITS.TITLE_MAX) })).toBeNull()
  expect(validateSong({ title: 'T', sections: [] })).toBeNull()
  // partial: patch sin title es válido (update parcial)
  expect(validateSong({ author: 'A' }, { partial: true })).toBeNull()
})

test('inferSectionType: aliases ES/EN/PT con número y acentos', () => {
  expect(inferSectionType('Coro')).toBe('chorus')
  expect(inferSectionType('Estribillo')).toBe('chorus')
  expect(inferSectionType('Refrão')).toBe('chorus')
  expect(inferSectionType('Chorus')).toBe('chorus')
  expect(inferSectionType('Estrofa 2')).toBe('verse')
  expect(inferSectionType('Estrofe 3')).toBe('verse')
  expect(inferSectionType('Verse 1')).toBe('verse')
  expect(inferSectionType('Puente')).toBe('bridge')
  expect(inferSectionType('Ponte')).toBe('bridge')
  expect(inferSectionType('Intro')).toBe('intro')
  expect(inferSectionType('Final')).toBe('outro')
  expect(inferSectionType('Coda')).toBe('tag')
  expect(inferSectionType('')).toBeNull()
  expect(inferSectionType('Cualquier cosa')).toBeNull()
})
