/**
 * usePgmState.js
 *
 * Hook que centraliza la suscripción a los eventos PGM del transport:
 *   - `pgm-update`       → slide en vivo en el monitor del PC.
 *   - `pgm-update-theme` → tema completo (bg/font/reference/...) +
 *                         `version` del server, emitido en el handshake
 *                         inicial y en cada cambio.
 *
 * CONTRATO con el server:
 *   El server SIEMPRE emite un theme completo (full payload), no
 *   parches incrementales. Eso simplifica el cliente: cada
 *   `pgm-update-theme` reemplaza el estado entero, no muta campos
 *   individuales. Si en T6+ aparece un patrón patch-incremental,
 *   habría que pasar a `{ ...prev, ...mergeTheme(payload) }` y
 *   versionar; documentar aquí cuando suceda. En DEV avisamos por
 *   console si llega un payload sospechosamente incompleto — útil
 *   durante desarrollo del desktop, silencioso en producción.
 *
 * Devuelve `{ slide, theme, serverVersion }` listo para componer en la
 * UI. Se debe usar UNA SOLA VEZ por árbol (lo monta ServiceScreen) para
 * no duplicar logs ni handlers. Si en T11 hace falta usarlo desde otro
 * sitio, se centraliza en un Context.
 *
 * Por qué un hook y no estado global: cada subscribe del transport es
 * un Set local con su unsubscribe; no aporta tener un store reactivo
 * adicional. Mantenemos el patrón "useEffect + transport.subscribe" del
 * resto del repo.
 *
 * El guard `mounted` evita setState post-unmount si llega un mensaje
 * tarde (StrictMode doble-mount o cleanup tardío del transport).
 */
import { useEffect, useState } from 'react'
import { transport, ServerEvent } from '../services/transport.js'
import { DEFAULT_THEME, mergeTheme } from '../services/slideTheme.js'
import { IS_DEV, debug } from '../services/devLog.js'

// Campos cuya ausencia en el payload del server consideramos
// sospechosa (vienen siempre en un theme bien formado del desktop).
// Si faltan, IS_DEV warn — pero seguimos aplicando el merge porque
// `mergeTheme` ya rellena con defaults seguros.
const _EXPECTED_THEME_FIELDS = ['bgType', 'fontFamily', 'fontColor', 'textAlign']

export function usePgmState() {
  const [slide, setSlide] = useState(null)
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [serverVersion, setServerVersion] = useState(null)

  useEffect(() => {
    let mounted = true

    const offSlide = transport.subscribe(ServerEvent.PGM_UPDATE, (payload) => {
      if (!mounted) return
      debug('[pgm] slide update', payload?.text?.slice(0, 40))
      setSlide(payload || null)
    })

    // `pgm-update-theme` no está en ServerEvent (es del flow de tema,
    // no del slide). Suscribimos por literal — el server lo emite.
    const offTheme = transport.subscribe('pgm-update-theme', (payload) => {
      if (!mounted) return
      debug('[pgm] theme update')
      // Aviso DEV-only si el server manda un payload parcial: indica
      // un bug de contrato del desktop, no del cliente. Producción
      // ignora silenciosamente (mergeTheme rellena con defaults).
      if (IS_DEV && payload && typeof payload === 'object') {
        const missing = _EXPECTED_THEME_FIELDS.filter(
          (k) => payload[k] === undefined,
        )
        if (missing.length === _EXPECTED_THEME_FIELDS.length) {
          // Payload no tiene NINGUNO de los campos esperados — muy
          // probable que sea sólo `{version}` o un wrapper distinto.
          // No es un warn duro, sólo log informativo.
          debug('[pgm] theme payload sin campos de tema, sólo metadata')
        } else if (missing.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            '[pgm] theme payload parcial — campos faltantes:',
            missing.join(','),
          )
        }
      }
      if (payload && typeof payload.version === 'string') {
        setServerVersion(payload.version)
      }
      setTheme(mergeTheme(payload))
    })

    return () => {
      mounted = false
      try { offSlide && offSlide() } catch { /* ignore */ }
      try { offTheme && offTheme() } catch { /* ignore */ }
    }
  }, [])

  return { slide, theme, serverVersion }
}
