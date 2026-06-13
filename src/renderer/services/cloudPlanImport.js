// cloudPlanImport.js — Mapeo PURO de los items de una lista del día de la nube
// (C3a, contrato jsonb en web/supabase/schema-v6-cloud-schedules.sql) a items
// del schedule local del desktop (scheduleService.addItem).
//
// PURO y testeable: no toca IPC, localStorage ni la red. Recibe los resolvers
// por dependencia (findSongByCloudId, resolveBibleRef) para que los tests
// puedan inyectar dobles.
//
// Contrato de entrada (cada item del jsonb es uno de estos 3 shapes):
//   { key, type:'song',  cloudSongId, title }
//   { key, type:'bible', reference, version }
//   { key, type:'note',  title, text }
//
// Salida:
//   {
//     scheduleItems: [ ...payloads listos para scheduleService.addItem... ],
//     warnings:      [ "mensaje en español", ... ]
//   }
//
// El orden de entrada se preserva (es el orden litúrgico que el usuario
// planificó en el móvil). Los items que no se pueden resolver NO se añaden:
// se acumula un warning y se salta, manteniendo el resto.

/**
 * @param {Array} items  array de items del jsonb cloud_schedules.items
 * @param {Object} deps
 * @param {(cloudSongId:string)=>(Object|null)} deps.findSongByCloudId
 *        Devuelve la canción local { id, title, sections, author, ... } o null.
 * @param {(reference:string, version?:string)=>({text:string, reference:string, meta?:Object}|null)} deps.resolveBibleRef
 *        Resuelve "Juan 3:16" a { text, reference, meta } o null si no se pudo.
 * @returns {{ scheduleItems: Array, warnings: Array<string> }}
 */
export function mapPlanItems(items, deps = {}) {
  const { findSongByCloudId, resolveBibleRef } = deps
  const scheduleItems = []
  const warnings = []

  if (!Array.isArray(items)) return { scheduleItems, warnings }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      warnings.push('Se omitió un elemento inválido de la lista.')
      continue
    }

    const type = item.type

    if (type === 'song') {
      const song = typeof findSongByCloudId === 'function'
        ? findSongByCloudId(item.cloudSongId)
        : null
      const label = item.title || 'Sin título'
      if (!song) {
        warnings.push(`La canción «${label}» no está en este PC (sincroniza primero)`)
        continue
      }
      scheduleItems.push({
        type: 'song',
        title: song.title || label,
        text: song.sections?.[0]?.text || song.title || label,
        reference: song.author || '',
        meta: { songId: song.id, sections: song.sections || [] },
      })
      continue
    }

    if (type === 'bible') {
      const ref = item.reference
      if (!ref) {
        warnings.push('Se omitió una referencia bíblica vacía.')
        continue
      }
      const resolved = typeof resolveBibleRef === 'function'
        ? resolveBibleRef(ref, item.version)
        : null
      if (!resolved || !resolved.text) {
        warnings.push(`No se pudo resolver la referencia bíblica «${ref}»`)
        continue
      }
      scheduleItems.push({
        type: 'bible',
        title: resolved.reference || ref,
        text: resolved.text,
        reference: resolved.reference || ref,
        meta: resolved.meta || {},
      })
      continue
    }

    if (type === 'note') {
      const title = item.title || (item.text ? String(item.text).slice(0, 60) : 'Nota')
      scheduleItems.push({
        type: 'note',
        title,
        text: item.text || '',
      })
      continue
    }

    // Tipo desconocido → warning y skip (forward-compat: el móvil podría
    // introducir tipos nuevos que esta versión del desktop no entiende).
    warnings.push(`Elemento de tipo desconocido «${type}» omitido`)
  }

  return { scheduleItems, warnings }
}
