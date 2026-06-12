/**
 * cloudSchedules.test.js (C3a)
 *
 * CRUD del servicio de listas del día cloud contra un mock chainable de
 * supabase-js. Lo crítico es el SHAPE EXACTO que escribimos en
 * cloud_schedules (CONTRATO del schema v6 — C3b lo importa tal cual):
 *   - insert con user_id explícito + items normalizados por type
 *     (song / bible / note) con key estable
 *   - update SIEMPRE con updated_at
 *   - remove = SOFT delete (deleted_at + updated_at), jamás .delete()
 *   - list SIN el jsonb de items (columna generada items_count)
 * Más validación client-side de los 3 shapes y mapeo de errores.
 */

let mockClient = null

jest.mock('../src/services/supabaseClient.js', () => ({
  getSupabase: jest.fn(async () => mockClient),
}))

import {
  list, get, create, update, remove,
  validateSchedule, makeItemKey, LIMITS, ITEM_TYPES,
} from '../src/services/cloudSchedules.js'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

/** Builder chainable thenable (mismo helper que cloudSongs.test.js). */
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

const VALID_ITEMS = [
  { key: 'k1', type: 'song', cloudSongId: 'song-uuid-1', title: 'Sublime Gracia' },
  { key: 'k2', type: 'bible', reference: 'Juan 3:16', version: 'rvr1960' },
  { key: 'k3', type: 'note', title: 'Bienvenida', text: 'Saludar a las visitas' },
]

/* ================= list ================= */

test('list: query correcta (tabla, items_count generado SIN jsonb, soft-delete, orden)', async () => {
  const rows = [{ id: 'p1', title: 'Culto 15 junio', service_date: '2026-06-15', is_template: false, items_count: 3, updated_at: '2026-06-12T10:00:00Z' }]
  const builder = makeBuilder({ data: rows, error: null })
  mockClient = makeClient(builder)

  const res = await list()

  expect(res).toEqual({ ok: true, items: rows })
  expect(mockClient.from).toHaveBeenCalledWith('cloud_schedules')
  // La columna generada items_count sustituye al jsonb completo en el listado.
  const cols = builder.select.mock.calls[0][0]
  expect(cols).toContain('items_count')
  expect(cols).not.toMatch(/(^|,)\s*items\s*(,|$)/)
  expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
  expect(builder.order).toHaveBeenCalledWith('updated_at', { ascending: false })
})

test('list: error JWT → unauthorized; fallo de red → network; sin cliente → unauthorized', async () => {
  mockClient = makeClient(makeBuilder({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } }))
  expect(await list()).toEqual({ ok: false, error: 'unauthorized' })

  mockClient = makeClient(makeBuilder(null, { reject: new TypeError('Failed to fetch') }))
  expect(await list()).toEqual({ ok: false, error: 'network' })

  mockClient = null
  expect(await list()).toEqual({ ok: false, error: 'unauthorized' })
})

/* ================= get ================= */

test('get: devuelve la lista con items completos y filtra soft-deleted', async () => {
  const schedule = { id: 'p1', title: 'Culto', service_date: null, items: VALID_ITEMS, is_template: false }
  const builder = makeBuilder({ data: schedule, error: null })
  mockClient = makeClient(builder)

  const res = await get('p1')
  expect(res).toEqual({ ok: true, schedule })
  expect(builder.select.mock.calls[0][0]).toContain('items')
  expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
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

test('create: INSERT con el shape EXACTO del contrato (user_id + items de los 3 types)', async () => {
  const builder = makeBuilder({ data: { id: 'new-1' }, error: null })
  mockClient = makeClient(builder)

  const res = await create({
    title: '  Culto 15 junio  ',
    service_date: '2026-06-15',
    is_template: false,
    items: VALID_ITEMS,
  })

  expect(res.ok).toBe(true)
  expect(builder.insert).toHaveBeenCalledWith({
    user_id: 'user-1',                       // RLS lo exige, sin default
    title: 'Culto 15 junio',
    service_date: '2026-06-15',
    items: [
      { key: 'k1', type: 'song', cloudSongId: 'song-uuid-1', title: 'Sublime Gracia' },
      { key: 'k2', type: 'bible', reference: 'Juan 3:16', version: 'rvr1960' },
      { key: 'k3', type: 'note', title: 'Bienvenida', text: 'Saludar a las visitas' },
    ],
    is_template: false,
  })
})

test('create: campos extra de los items NO viajan; sin key se genera una', async () => {
  const builder = makeBuilder({ data: { id: 'new-2' }, error: null })
  mockClient = makeClient(builder)
  await create({
    title: 'T',
    items: [{ type: 'song', cloudSongId: 's1', title: 'X', uiFlag: true, author: 'no-viaja' }],
  })
  const sent = builder.insert.mock.calls[0][0].items[0]
  expect(Object.keys(sent).sort()).toEqual(['cloudSongId', 'key', 'title', 'type'])
  expect(typeof sent.key).toBe('string')
  expect(sent.key.length).toBeGreaterThan(0)
})

test('create: defaults — sin fecha → service_date null, sin items → [], sin toggle → false', async () => {
  const builder = makeBuilder({ data: { id: 'new-3' }, error: null })
  mockClient = makeClient(builder)
  await create({ title: 'Plantilla base' })
  expect(builder.insert).toHaveBeenCalledWith({
    user_id: 'user-1',
    title: 'Plantilla base',
    service_date: null,
    items: [],
    is_template: false,
  })
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
  expect(await create({ title: 'x'.repeat(201) }))
    .toEqual({ ok: false, error: 'validation', field: 'title', reason: 'too_long' })
  expect(await create({ title: 'T', service_date: '15/06/2026' }))
    .toEqual({ ok: false, error: 'validation', field: 'service_date', reason: 'invalid' })
  expect(await create({ title: 'T', items: Array.from({ length: 101 }, (_, i) => ({ key: `k${i}`, type: 'note', title: 'N', text: '' })) }))
    .toEqual({ ok: false, error: 'validation', field: 'items', reason: 'too_many' })

  expect(mockClient.from).not.toHaveBeenCalled()
})

/* ================= update ================= */

test('update: SIEMPRE setea updated_at ISO', async () => {
  const builder = makeBuilder({ data: { id: 'p1', title: 'Nuevo' }, error: null })
  mockClient = makeClient(builder)

  const res = await update('p1', { title: 'Nuevo' })

  expect(res.ok).toBe(true)
  expect(builder.update).toHaveBeenCalledTimes(1)
  const row = builder.update.mock.calls[0][0]
  expect(row.title).toBe('Nuevo')
  expect(row.updated_at).toMatch(ISO_RE)
  expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
  expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
})

test('update: patch PARCIAL — solo viajan los campos presentes', async () => {
  const builder = makeBuilder({ data: { id: 'p1' }, error: null })
  mockClient = makeClient(builder)

  await update('p1', { items: VALID_ITEMS })
  const row = builder.update.mock.calls[0][0]
  expect(Object.keys(row).sort()).toEqual(['items', 'updated_at'])
  expect(row).not.toHaveProperty('title')
  expect(row).not.toHaveProperty('is_template')
})

test('update: 0 filas afectadas (RLS / borrada) → not_found; patch inválido → validation', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)
  expect(await update('p1', { title: 'T' })).toEqual({ ok: false, error: 'not_found' })

  mockClient.from.mockClear()
  expect(await update('p1', { title: '' }))
    .toEqual({ ok: false, error: 'validation', field: 'title', reason: 'required' })
  expect(mockClient.from).not.toHaveBeenCalled()
})

/* ================= remove (soft delete) ================= */

test('remove: SOFT delete — UPDATE con deleted_at + updated_at, jamás .delete()', async () => {
  const builder = makeBuilder({ data: { id: 'p1' }, error: null })
  mockClient = makeClient(builder)

  const res = await remove('p1')

  expect(res).toEqual({ ok: true })
  expect(builder.delete).not.toHaveBeenCalled()
  expect(builder.update).toHaveBeenCalledTimes(1)
  const row = builder.update.mock.calls[0][0]
  expect(Object.keys(row).sort()).toEqual(['deleted_at', 'updated_at'])
  expect(row.deleted_at).toMatch(ISO_RE)
  expect(row.updated_at).toBe(row.deleted_at)
})

test('remove: ya borrada / ajena → not_found', async () => {
  const builder = makeBuilder({ data: null, error: null })
  mockClient = makeClient(builder)
  expect(await remove('p1')).toEqual({ ok: false, error: 'not_found' })
})

/* ================= validateSchedule ================= */

test('validateSchedule: casos válidos devuelven null', () => {
  expect(validateSchedule({ title: 'T' })).toBeNull()
  expect(validateSchedule({ title: 'T', service_date: null })).toBeNull()
  expect(validateSchedule({ title: 'T', service_date: '' })).toBeNull()
  expect(validateSchedule({ title: 'T', service_date: '2026-06-15' })).toBeNull()
  expect(validateSchedule({ title: 'T', items: [] })).toBeNull()
  expect(validateSchedule({ title: 'T', items: VALID_ITEMS })).toBeNull()
  expect(validateSchedule({ title: 'x'.repeat(LIMITS.TITLE_MAX) })).toBeNull()
  // partial: patch sin title es válido (update parcial)
  expect(validateSchedule({ is_template: true }, { partial: true })).toBeNull()
})

test('validateSchedule: shapes inválidos por type → items/invalid', () => {
  const bad = (items) => validateSchedule({ title: 'T', items })
  // type desconocido
  expect(bad([{ key: 'k', type: 'video', src: 'x' }])).toEqual({ field: 'items', reason: 'invalid' })
  // song sin cloudSongId / sin title
  expect(bad([{ key: 'k', type: 'song', title: 'X' }])).toEqual({ field: 'items', reason: 'invalid' })
  expect(bad([{ key: 'k', type: 'song', cloudSongId: 's1', title: '' }])).toEqual({ field: 'items', reason: 'invalid' })
  // bible sin reference / reference demasiado larga / sin version
  expect(bad([{ key: 'k', type: 'bible', reference: '', version: 'nvi' }])).toEqual({ field: 'items', reason: 'invalid' })
  expect(bad([{ key: 'k', type: 'bible', reference: 'x'.repeat(101), version: 'nvi' }])).toEqual({ field: 'items', reason: 'invalid' })
  expect(bad([{ key: 'k', type: 'bible', reference: 'Juan 3:16', version: '' }])).toEqual({ field: 'items', reason: 'invalid' })
  // note sin título / texto demasiado largo
  expect(bad([{ key: 'k', type: 'note', title: '', text: 'x' }])).toEqual({ field: 'items', reason: 'invalid' })
  expect(bad([{ key: 'k', type: 'note', title: 'N', text: 'x'.repeat(2001) }])).toEqual({ field: 'items', reason: 'invalid' })
  // items no-array
  expect(validateSchedule({ title: 'T', items: 'nope' })).toEqual({ field: 'items', reason: 'invalid' })
})

/* ================= helpers ================= */

test('makeItemKey: keys únicas y no vacías; ITEM_TYPES expone los 3 types del contrato', () => {
  const a = makeItemKey()
  const b = makeItemKey()
  expect(typeof a).toBe('string')
  expect(a.length).toBeGreaterThan(0)
  expect(a).not.toBe(b)
  expect(ITEM_TYPES).toEqual(['song', 'bible', 'note'])
})
