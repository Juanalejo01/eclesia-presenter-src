/**
 * scheduleActions.js
 *
 * Acciones disparadas por la UI del schedule (lista del día). Aisladas
 * del componente para tener tests puros (node env) + reuso futuro
 * (T11 anuncios, etc.).
 *
 * Por qué no en el componente: ScheduleList vive en jsdom, este módulo
 * vive en node. Separar la lógica de "qué comando WS enviar para tal
 * item" del JSX permite testear el routing por tipo sin React.
 *
 * Edge cases:
 *   - item.type desconocido → no-op + log dev.
 *   - item.type === 'bible' pero sin .bible payload desestructurado →
 *     no-op + log dev. El server T7+ siempre debería emitir el objeto
 *     parseado en el item.
 *   - reorderItems([]) → no-op (sin sentido enviar lista vacía).
 */
import { transport, ClientCommand } from './transport.js'
import { tapLight } from './haptics.js'
import { debug } from './devLog.js'

/**
 * Proyecta el item al PC según su tipo.
 *
 * Reglas por tipo:
 *   - 'song'  → ClientCommand.SONG con payload { id }.
 *   - 'bible' → ClientCommand.BIBLE_REF con payload { book, chapter, verse, version }
 *               extraído de item.bible. Sin .bible → no-op.
 *   - 'image' | 'video' | 'announcement' →
 *     ClientCommand.PROJECT_SCHEDULE_ITEM con payload { id }. El server
 *     resuelve el item por id en su tabla del día.
 *
 * Devuelve `true` si se envió un comando reconocido, `false` si no.
 * No lanza nunca: errores del transport son problema del transport.
 *
 * @param {object} item — { id, type, ...extras }
 * @returns {boolean}
 */
export function projectItem(item) {
  if (!item || typeof item !== 'object') return false
  switch (item.type) {
    case 'song': {
      const ok = transport.send({
        type: ClientCommand.SONG,
        payload: { id: item.id },
      })
      if (ok) tapLight()
      return ok
    }
    case 'bible': {
      // Esperamos que el item del schedule traiga .bible ya desestructurado.
      // Si solo llega `reference` como string, no podemos parsearla aquí
      // (necesitaría el parser del desktop). El server T7+ debería siempre
      // emitir el objeto.
      if (!item.bible || typeof item.bible !== 'object') {
        debug('[schedule] item bible sin .bible payload', item)
        return false
      }
      const ok = transport.send({
        type: ClientCommand.BIBLE_REF,
        payload: item.bible,
      })
      if (ok) tapLight()
      return ok
    }
    case 'image':
    case 'video':
    case 'announcement': {
      // Tipos sin comando dedicado todavía (T9-T11). El server resuelve
      // el item por id. Si todavía no implementa el handler, lo ignora
      // silenciosamente — no hay riesgo de estado roto del cliente.
      const ok = transport.send({
        type: ClientCommand.PROJECT_SCHEDULE_ITEM,
        payload: { id: item.id },
      })
      if (ok) tapLight()
      return ok
    }
    default:
      debug('[schedule] item de tipo desconocido', item?.type)
      return false
  }
}

/**
 * Envía nuevo orden al server (post drag-drop).
 *
 * @param {string[]} ids — array de ids en el nuevo orden.
 * @returns {boolean} true si el send arrancó, false si entrada inválida.
 */
export function reorderItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return false
  return transport.send({
    type: ClientCommand.LIST_REORDER,
    payload: { ids },
  })
}
