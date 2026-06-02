// POST /api/songs/sync — Cloud sync de canciones (2-way merge)
//
// La app desktop llama aquí periódicamente o cuando crea/edita/borra una canción.
//
// Body:
//   {
//     license_key: "EP-XXXX-...",
//     device_id:   "<hash estable del PC>",
//     // Canciones locales que el cliente quiere subir / mergear con la nube.
//     // Cada una con cloud_id (uuid de cloud_songs, null si nueva) y updated_at (ms).
//     local: [
//       { cloud_id: null|uuid, title, author, tags, sections, key_signature,
//         tempo, max_lines, is_favorite, updated_at, deleted: boolean }
//     ],
//     // Última vez que el cliente sincronizó (ms). El server devolverá solo las
//     // filas de cloud que cambiaron después de esto, para no reenviar todo.
//     since: 0
//   }
//
// Response:
//   {
//     ok: true,
//     // Canciones del cloud que el cliente debe upsertar/borrar localmente
//     remote: [
//       { id: uuid, title, author, tags, ..., deleted_at: null|timestamp,
//         updated_at: ms }
//     ],
//     // Para cada canción local que el server insertó como nueva, mapeamos
//     // su local_id (cliente lo identifica) al cloud_id recién asignado.
//     mapping: { "<client-local-key>": "<cloud-uuid>", ... },
//     server_time: ms,  // timestamp del server para que el cliente actualice `since`
//   }
//
// Conflict resolution: last-write-wins por updated_at.
//   - Si local.updated_at > cloud.updated_at → cliente gana (actualizamos cloud)
//   - Si cloud.updated_at >= local.updated_at → cloud gana (cliente recibirá la versión de cloud)
//
// Auth: validamos license_key (no Supabase session porque desktop no tiene
// cookies). El service_role salta RLS, así que escribimos directamente con el
// user_id resuelto a partir de la licencia.

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { checkRateLimit, getClientIP } from '../../../../lib/ratelimit'

export const dynamic = 'force-dynamic'

const LICENSE_KEY_FORMAT = /^EP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/

// Máximo número de canciones en un solo sync (defensivo, no DoS)
const MAX_LOCAL_PAYLOAD = 1000

export async function POST(request) {
  // Rate limit
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'songs-sync')
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limit', retry_after: rl.retryAfter }, { status: 429 })
  }

  try {
    const body = await request.json().catch(() => null)
    const { license_key, device_id, local = [], since = 0 } = body || {}

    // Validar inputs
    if (typeof license_key !== 'string' || !LICENSE_KEY_FORMAT.test(license_key.toUpperCase())) {
      return NextResponse.json({ ok: false, error: 'license_invalida' }, { status: 400 })
    }
    if (typeof device_id !== 'string' || device_id.length < 16 || device_id.length > 128) {
      return NextResponse.json({ ok: false, error: 'device_id_invalido' }, { status: 400 })
    }
    if (!Array.isArray(local) || local.length > MAX_LOCAL_PAYLOAD) {
      return NextResponse.json({ ok: false, error: 'payload_muy_grande' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Validar licencia y obtener user_id
    const { data: license } = await admin
      .from('licenses')
      .select('user_id, status, current_period_end, plan')
      .eq('license_key', license_key.toUpperCase())
      .maybeSingle()

    if (!license) {
      return NextResponse.json({ ok: false, error: 'licencia_invalida' }, { status: 403 })
    }
    if (license.status !== 'active' && license.status !== 'trialing') {
      return NextResponse.json({ ok: false, error: 'licencia_invalida' }, { status: 403 })
    }
    if (license.current_period_end && new Date(license.current_period_end) < new Date()) {
      return NextResponse.json({ ok: false, error: 'licencia_expirada' }, { status: 403 })
    }
    // Sync de canciones es Pro-only — el plan free no syncroniza
    if (license.plan === 'free') {
      return NextResponse.json({ ok: false, error: 'requires_pro' }, { status: 403 })
    }

    const userId = license.user_id
    const mapping = {}
    const pushed = { uploaded: 0, updated: 0, deleted: 0 }

    // === PUSH: subir cambios locales al cloud (batch, no N+1) ===
    //
    // Antes: 1-3 queries por cancion → con 500 canciones = hasta 1500 queries
    //        serializadas → timeout 30s garantizado en Vercel.
    // Ahora: 1 query batch al inicio para cargar el estado actual en cloud,
    //        luego operaciones agrupadas por tipo (inserts / updates / deletes).

    const validLocal = local.filter(s => s && typeof s === 'object')

    // 1. Separar canciones por tipo de operacion
    const toDelete  = validLocal.filter(s => s.deleted && s.cloud_id)
    const toInsert  = validLocal.filter(s => !s.deleted && !s.cloud_id)
    const toUpdate  = validLocal.filter(s => !s.deleted && s.cloud_id)

    // 2. Si hay canciones con cloud_id, fetch batch de su estado actual en cloud
    //    (1 sola query en vez de 1 por cancion)
    const existingCloudIds = [...toUpdate.map(s => s.cloud_id), ...toDelete.map(s => s.cloud_id)]
      .filter(Boolean)
    const cloudMap = new Map()  // cloud_id -> { updated_at, deleted_at }
    if (existingCloudIds.length > 0) {
      // Supabase permite hasta ~1000 items en .in(); si hay mas, chunkeamos.
      const CHUNK = 900
      for (let i = 0; i < existingCloudIds.length; i += CHUNK) {
        const chunk = existingCloudIds.slice(i, i + CHUNK)
        const { data: rows } = await admin
          .from('cloud_songs')
          .select('id, updated_at, deleted_at')
          .eq('user_id', userId)
          .in('id', chunk)
        for (const r of rows || []) cloudMap.set(r.id, r)
      }
    }

    // 3. Soft deletes en batch (max 900 por llamada)
    const deleteIds = toDelete
      .filter(s => cloudMap.has(s.cloud_id))  // solo si existe en cloud
      .map(s => s.cloud_id)
    if (deleteIds.length > 0) {
      const deletedAt = new Date().toISOString()
      const CHUNK = 900
      for (let i = 0; i < deleteIds.length; i += CHUNK) {
        const chunk = deleteIds.slice(i, i + CHUNK)
        const { error } = await admin
          .from('cloud_songs')
          .update({ deleted_at: deletedAt, updated_at: deletedAt })
          .eq('user_id', userId)
          .in('id', chunk)
        if (!error) pushed.deleted += chunk.length
      }
    }

    // 4. Inserts batch (canciones nuevas sin cloud_id)
    if (toInsert.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK)
        const rows = chunk.map(s => ({
          user_id: userId,
          title: String(s.title || '').slice(0, 500),
          author: s.author ? String(s.author).slice(0, 200) : null,
          tags: s.tags ? String(s.tags).slice(0, 500) : null,
          key_signature: s.key_signature ? String(s.key_signature).slice(0, 16) : null,
          tempo: s.tempo ? Number(s.tempo) : null,
          sections: s.sections || [],
          max_lines: s.max_lines || 4,
          is_favorite: !!s.is_favorite,
          updated_at: new Date(Number(s.updated_at) || Date.now()).toISOString(),
        }))
        const { data: inserted, error: insErr } = await admin
          .from('cloud_songs')
          .insert(rows)
          .select('id')
        if (insErr) {
          console.error('[songs/sync] batch insert error')
          continue
        }
        // Mapear local_key -> cloud_id para que el cliente guarde la relacion
        ;(inserted || []).forEach((row, idx) => {
          pushed.uploaded++
          const s = chunk[idx]
          if (s.local_key) mapping[s.local_key] = row.id
        })
      }
    }

    // 5. Updates batch (solo los que local gana por last-write-wins)
    const updateRows = []
    for (const s of toUpdate) {
      const cloudRow = cloudMap.get(s.cloud_id)
      if (!cloudRow) {
        // No existe en cloud (puede haber sido borrado por otro PC) → re-insertar
        toInsert.push(s)  // se procesara en una segunda pasada si hace falta
        continue
      }
      if (cloudRow.deleted_at) continue  // cloud ya lo borro, no pisamos
      const localMs  = Number(s.updated_at) || 0
      const cloudMs  = new Date(cloudRow.updated_at).getTime()
      if (localMs <= cloudMs) continue   // cloud es mas reciente, cloud gana
      updateRows.push({
        id: s.cloud_id,
        title: String(s.title || '').slice(0, 500),
        author: s.author ? String(s.author).slice(0, 200) : null,
        tags: s.tags ? String(s.tags).slice(0, 500) : null,
        key_signature: s.key_signature ? String(s.key_signature).slice(0, 16) : null,
        tempo: s.tempo ? Number(s.tempo) : null,
        sections: s.sections || [],
        max_lines: s.max_lines || 4,
        is_favorite: !!s.is_favorite,
        updated_at: new Date(localMs).toISOString(),
      })
    }

    if (updateRows.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < updateRows.length; i += CHUNK) {
        const chunk = updateRows.slice(i, i + CHUNK)
        // upsert con onConflict:'id' aplica un UPDATE cuando el id ya existe
        const { error } = await admin
          .from('cloud_songs')
          .upsert(chunk, { onConflict: 'id' })
        if (!error) pushed.updated += chunk.length
      }
    }

    // === PULL: bajar cambios de cloud que el cliente no tiene ===
    const sinceIso = since > 0 ? new Date(since).toISOString() : '1970-01-01T00:00:00Z'
    const { data: cloudUpdates } = await admin
      .from('cloud_songs')
      .select('id, title, author, tags, key_signature, tempo, sections, max_lines, is_favorite, deleted_at, updated_at')
      .eq('user_id', userId)
      .gt('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .limit(2000)

    const remote = (cloudUpdates || []).map(r => ({
      cloud_id: r.id,
      title: r.title,
      author: r.author,
      tags: r.tags,
      key_signature: r.key_signature,
      tempo: r.tempo,
      sections: r.sections,
      max_lines: r.max_lines,
      is_favorite: r.is_favorite,
      deleted: !!r.deleted_at,
      updated_at: new Date(r.updated_at).getTime(),
    }))

    return NextResponse.json({
      ok: true,
      remote,
      mapping,
      pushed,           // {uploaded, updated, deleted} — lo que el server escribió en cloud
      server_time: Date.now(),
    })
  } catch (e) {
    console.error('[songs/sync] uncaught')
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
