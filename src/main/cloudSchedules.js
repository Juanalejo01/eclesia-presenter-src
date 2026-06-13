// Cloud schedules (listas del día) — cliente en el main process.
//
// Responsabilidad: traer del backend las listas que el usuario planificó en
// el móvil (C3a) para que el desktop las importe (C3b). No persiste nada —
// es read-only: lista metadata y trae el detalle de una lista bajo demanda.
//
// Auth: license_key + device_id (mismo patrón que cloudSync). El renderer
// llama vía IPC (schedules:cloud-list / schedules:cloud-get).
//
// Endpoint: POST /api/schedules/pull
//   - sin schedule_id → { ok, schedules: [...] }
//   - con schedule_id → { ok, schedule: {...con items...} }

const API_BASE = process.env.ECLESIA_API_BASE || 'https://eclesia-presenter.vercel.app'

let _license = null

// Mapea errores del endpoint / red a códigos estables que el renderer
// traduce a mensajes en español. Evita filtrar internals.
function mapError(httpStatus, serverError) {
  if (serverError === 'requires_pro') return 'not_pro'
  if (serverError === 'licencia_invalida' ||
      serverError === 'licencia_expirada' ||
      serverError === 'device_no_activado' ||
      serverError === 'license_invalida' ||
      serverError === 'device_id_invalido') return 'unauthorized'
  if (serverError === 'no_encontrada') return 'not_found'
  if (serverError === 'rate_limit') return 'rate_limit'
  if (httpStatus === 401 || httpStatus === 403) return 'unauthorized'
  if (httpStatus >= 500 || serverError === 'server_error') return 'server'
  return serverError || 'server'
}

async function call(payload) {
  const lic = _license.getState()
  if (!lic.licensed || !lic.license_key) {
    return { ok: false, error: 'no_license' }
  }
  if (!['pro_monthly', 'pro_yearly', 'lifetime'].includes(lic.plan)) {
    return { ok: false, error: 'not_pro' }
  }

  let res
  try {
    res = await fetch(`${API_BASE}/api/schedules/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: lic.license_key,
        device_id: lic.device_id,
        ...payload,
      }),
    })
  } catch (e) {
    return { ok: false, error: 'network' }
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    return { ok: false, error: mapError(res.status, data.error) }
  }
  return { ok: true, data }
}

/**
 * Lista las listas del día disponibles en la nube (solo metadata).
 * @returns {Promise<{ok:true, schedules:Array} | {ok:false, error:string}>}
 */
async function listPlans() {
  const r = await call({})
  if (!r.ok) return r
  return { ok: true, schedules: r.data.schedules || [] }
}

/**
 * Trae una lista concreta con sus items.
 * @param {string} id  uuid de cloud_schedules
 * @returns {Promise<{ok:true, schedule:Object} | {ok:false, error:string}>}
 */
async function getPlan(id) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'server' }
  const r = await call({ schedule_id: id })
  if (!r.ok) return r
  return { ok: true, schedule: r.data.schedule || null }
}

function init({ license }) {
  _license = license
}

module.exports = {
  init,
  listPlans,
  getPlan,
  // exportado para tests
  mapError,
}
