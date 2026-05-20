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
    // Contadores de lo que el SERVER aplicó (push del cliente al cloud)
    const pushed = { uploaded: 0, updated: 0, deleted: 0 }

    // === PUSH: subir cambios locales al cloud ===
    for (const song of local) {
      if (!song || typeof song !== 'object') continue

      const isDelete = song.deleted === true && song.cloud_id
      const localUpdatedMs = Number(song.updated_at) || Date.now()
      const localUpdatedAt = new Date(localUpdatedMs).toISOString()

      if (isDelete) {
        // Soft delete en cloud
        const { error } = await admin
          .from('cloud_songs')
          .update({ deleted_at: localUpdatedAt, updated_at: localUpdatedAt })
          .eq('id', song.cloud_id)
          .eq('user_id', userId)
        if (!error) pushed.deleted++
        continue
      }

      if (!song.cloud_id) {
        // Nueva canción local → insertar en cloud
        const { data: inserted, error: insErr } = await admin
          .from('cloud_songs')
          .insert({
            user_id: userId,
            title: String(song.title || '').slice(0, 500),
            author: song.author ? String(song.author).slice(0, 200) : null,
            tags: song.tags ? String(song.tags).slice(0, 500) : null,
            key_signature: song.key_signature ? String(song.key_signature).slice(0, 16) : null,
            tempo: song.tempo ? Number(song.tempo) : null,
            sections: song.sections || [],
            max_lines: song.max_lines || 4,
            is_favorite: !!song.is_favorite,
            updated_at: localUpdatedAt,
          })
          .select('id')
          .single()
        if (insErr) {
          console.error('[songs/sync] insert error')
          continue
        }
        pushed.uploaded++
        if (song.local_key) mapping[song.local_key] = inserted.id
      } else {
        // Actualizar — solo si local es más reciente que cloud
        const { data: cloudRow } = await admin
          .from('cloud_songs')
          .select('updated_at, deleted_at')
          .eq('id', song.cloud_id)
          .eq('user_id', userId)
          .maybeSingle()
        if (!cloudRow) {
          const { data: inserted } = await admin
            .from('cloud_songs')
            .insert({
              user_id: userId,
              title: String(song.title || '').slice(0, 500),
              sections: song.sections || [],
              updated_at: localUpdatedAt,
            })
            .select('id').single()
          if (inserted) {
            pushed.uploaded++
            if (song.local_key) mapping[song.local_key] = inserted.id
          }
        } else if (cloudRow.deleted_at) {
          continue
        } else {
          const cloudUpdatedMs = new Date(cloudRow.updated_at).getTime()
          if (localUpdatedMs > cloudUpdatedMs) {
            const { error } = await admin
              .from('cloud_songs')
              .update({
                title: String(song.title || '').slice(0, 500),
                author: song.author ? String(song.author).slice(0, 200) : null,
                tags: song.tags ? String(song.tags).slice(0, 500) : null,
                key_signature: song.key_signature ? String(song.key_signature).slice(0, 16) : null,
                tempo: song.tempo ? Number(song.tempo) : null,
                sections: song.sections || [],
                max_lines: song.max_lines || 4,
                is_favorite: !!song.is_favorite,
                updated_at: localUpdatedAt,
              })
              .eq('id', song.cloud_id)
              .eq('user_id', userId)
            if (!error) pushed.updated++
          }
        }
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
