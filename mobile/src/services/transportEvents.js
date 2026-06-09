/**
 * transportEvents.js
 *
 * Constantes de tipos de mensaje que viajan por el WebSocket entre
 * el remoto móvil (cliente) y el desktop EclesiaPresenter (server).
 *
 * Por qué existe: centralizar los strings literales evita typos
 * sutiles ("nxt" vs "next") y permite refactor seguro desde el IDE.
 * Mantenido como JS plano (no TS) para coincidir con el resto del repo.
 *
 * Ejemplo:
 *   import { ClientCommand } from './transportEvents.js'
 *   transport.send({ type: ClientCommand.NEXT })
 *
 * Edge cases:
 *   - `isValidCommand` solo valida `type`, no la forma del payload.
 *     Los validadores específicos de payload viven en cada feature
 *     (ej. T6 valida `bible-ref`).
 */

// Comandos: cliente (mobile) → server (desktop)
export const ClientCommand = Object.freeze({
  NEXT:                  'next',
  PREV:                  'prev',
  BLANK:                 'blank',
  BLACK:                 'black',
  CLEAR:                 'clear',
  BIBLE_REF:             'bible-ref',             // payload: { book, chapter, verse, version }
  BIBLE_PROJECT_DIRECT:  'bible-project-direct',  // payload: { reference, text, version?, bookIndex?, chapterNum?, verseNum?, verseEnd? }
  SONG:                  'song',                  // payload: { id, sectionIndex? }
  ANNOUNCE:              'announce',              // payload: { title, body, durationSec? }
  PROJECTION_CLOSE:      'projection-close',
  LIST_REORDER:          'list-reorder',          // payload: { ids: string[] }
  PROJECT_SCHEDULE_ITEM: 'project-schedule-item', // payload: { id } — server resuelve por id
  PING:                  'ping',                  // payload: { ts: number }
})

// Eventos: server (desktop) → cliente (mobile)
export const ServerEvent = Object.freeze({
  PGM_UPDATE:        'pgm-update',
  SCHEDULE_UPDATE:   'schedule-update',
  CONNECTION_STATE:  'connection-state',
  PONG:              'pong',
  ERROR:             'error',             // { code, message }
  AUTH_ERROR:        'auth-error',        // 401 → renderer limpia token
})

const VALID_COMMAND_TYPES = Object.freeze(Object.values(ClientCommand))

/**
 * Valida la forma mínima de un comando antes de enviarlo o encolarlo.
 * No valida el contenido del payload; eso es responsabilidad del caller.
 * @param {unknown} cmd
 * @returns {boolean} true si `cmd` es un objeto con `type` válido.
 */
export function isValidCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return false
  return VALID_COMMAND_TYPES.includes(cmd.type)
}
