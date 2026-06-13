// Tests para src/main/cloudSchedules.js
//
// Por qué importa: es el cliente que el desktop usa para traer las listas del
// día de la nube. Validamos que llama al endpoint correcto con las credenciales
// de licencia y que mapea los errores del backend a códigos estables que el
// renderer puede traducir (not_pro upsell, network retry, unauthorized, server).
//
// El módulo no depende de electron ni sqlite (solo global.fetch + license
// inyectada vía init), así que es testeable directamente.

const cloudSchedules = require('../src/main/cloudSchedules.js')

function makeLicense(overrides = {}) {
  const state = {
    licensed: true,
    plan: 'pro_yearly',
    license_key: 'EP-AAAA-BBBB-CCCC-DDDD',
    device_id: 'a'.repeat(32),
    ...overrides,
  }
  return { getState: () => state }
}

describe('cloudSchedules.mapError', () => {
  test('requires_pro → not_pro', () => {
    expect(cloudSchedules.mapError(403, 'requires_pro')).toBe('not_pro')
  })
  test('licencia/activación inválida → unauthorized', () => {
    expect(cloudSchedules.mapError(403, 'licencia_invalida')).toBe('unauthorized')
    expect(cloudSchedules.mapError(403, 'device_no_activado')).toBe('unauthorized')
    expect(cloudSchedules.mapError(401, undefined)).toBe('unauthorized')
  })
  test('5xx → server', () => {
    expect(cloudSchedules.mapError(500, 'server_error')).toBe('server')
    expect(cloudSchedules.mapError(502, undefined)).toBe('server')
  })
  test('no_encontrada → not_found', () => {
    expect(cloudSchedules.mapError(404, 'no_encontrada')).toBe('not_found')
  })
})

describe('cloudSchedules.listPlans', () => {
  afterEach(() => { delete global.fetch })

  test('éxito → devuelve schedules', async () => {
    cloudSchedules.init({ license: makeLicense() })
    const fakeSchedules = [{ id: '1', title: 'Domingo', items_count: 3 }]
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, schedules: fakeSchedules }),
    })

    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: true, schedules: fakeSchedules })

    // Verifica endpoint + credenciales en el body
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/schedules/pull')
    const body = JSON.parse(opts.body)
    expect(body.license_key).toBe('EP-AAAA-BBBB-CCCC-DDDD')
    expect(body.device_id).toBe('a'.repeat(32))
    expect(body.schedule_id).toBeUndefined()
  })

  test('sin licencia → no_license, no llama fetch', async () => {
    cloudSchedules.init({ license: makeLicense({ licensed: false, license_key: null }) })
    global.fetch = jest.fn()
    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: false, error: 'no_license' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('plan free → not_pro, no llama fetch', async () => {
    cloudSchedules.init({ license: makeLicense({ plan: 'free' }) })
    global.fetch = jest.fn()
    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: false, error: 'not_pro' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('backend requires_pro (403) → not_pro', async () => {
    cloudSchedules.init({ license: makeLicense() })
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ ok: false, error: 'requires_pro' }),
    })
    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: false, error: 'not_pro' })
  })

  test('401 → unauthorized', async () => {
    cloudSchedules.init({ license: makeLicense() })
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ ok: false, error: 'licencia_invalida' }),
    })
    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: false, error: 'unauthorized' })
  })

  test('500 → server', async () => {
    cloudSchedules.init({ license: makeLicense() })
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({ ok: false, error: 'server_error' }),
    })
    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: false, error: 'server' })
  })

  test('fetch lanza (red caída) → network', async () => {
    cloudSchedules.init({ license: makeLicense() })
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await cloudSchedules.listPlans()
    expect(r).toEqual({ ok: false, error: 'network' })
  })
})

describe('cloudSchedules.getPlan', () => {
  afterEach(() => { delete global.fetch })

  test('éxito → devuelve schedule con items y pasa schedule_id', async () => {
    cloudSchedules.init({ license: makeLicense() })
    const fakeSchedule = { id: 'sched-1', title: 'Domingo', items: [{ key: 'k', type: 'note', title: 'N', text: 't' }] }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, schedule: fakeSchedule }),
    })

    const r = await cloudSchedules.getPlan('sched-1')
    expect(r).toEqual({ ok: true, schedule: fakeSchedule })

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.schedule_id).toBe('sched-1')
  })

  test('id ausente → server (no llama fetch)', async () => {
    cloudSchedules.init({ license: makeLicense() })
    global.fetch = jest.fn()
    const r = await cloudSchedules.getPlan()
    expect(r).toEqual({ ok: false, error: 'server' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('404 no_encontrada → not_found', async () => {
    cloudSchedules.init({ license: makeLicense() })
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 404, json: async () => ({ ok: false, error: 'no_encontrada' }),
    })
    const r = await cloudSchedules.getPlan('missing')
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })
})
