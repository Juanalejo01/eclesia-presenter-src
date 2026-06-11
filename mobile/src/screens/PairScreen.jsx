import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner.jsx'
import BigButton from '../components/BigButton.jsx'
import FormField from '../components/FormField.jsx'
import { Capacitor } from '@capacitor/core'
import { pairWithDesktop, probeServer, PairingError } from '../services/pairing.js'
import {
  normalizeBaseUrl,
  detectPortIssue,
  suggestCanonicalUrl,
  isServedFromDesktop,
} from '../services/urlHelpers.js'
import { transport } from '../services/transport.js'

const LAST_URL_KEY = 'eclesia.pair.lastUrl'
const FIRST_PAIR_SEEN_KEY = 'eclesia.firstPairSeen'

// ---------------------------------------------------------------------------
// Helpers de storage. sessionStorage y localStorage pueden tirar en private
// mode (Safari iOS especialmente) o cuando el host bloquea storage. Centralizado
// para no tener `try { } catch { /* ignore */ }` repetido por todo el componente.
// ---------------------------------------------------------------------------
function safeSessionGet(key) {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}
function safeSessionSet(key, value) {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage?.setItem(key, value)
  } catch { /* ignore: private mode */ }
}
function safeLocalGet(key) {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}
function safeLocalSet(key, value) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage?.setItem(key, value)
  } catch { /* ignore */ }
}

/**
 * PairScreen
 *
 * Pantalla de emparejamiento first-run. Dos modos:
 *   1. QR: lee el QR generado por el desktop (panel Transmisión).
 *      Acepta dos formatos:
 *        - JSON: { "url": "http://192.168.X.X:3434", "pin": "123456" }
 *        - URL : http://192.168.X.X:3434?pin=123456
 *   2. Manual: dos campos (URL del PC + PIN 6 dígitos).
 *
 * T3 hardening (UX del manual):
 *   - Prefill: usamos `window.location.hostname` para sugerir
 *     `http://<host>:3434` (asumiendo que el mando se sirvió desde la
 *     misma LAN del PC). Si el hostname es localhost, dejamos vacío.
 *   - Detección de "puerto del navegador" (típicamente :5173 de Vite):
 *     warning inline si el usuario teclea su propio host:port.
 *   - Smart parse en onBlur: añade scheme + puerto canónico cuando falta.
 *   - Persistencia: la URL exitosa o el último intento se guarda en
 *     sessionStorage para que un reload accidental no obligue a re-teclear.
 *   - Probe en onBlur: tras un blur con URL no-vacía, llama a probeServer()
 *     en background con feedback verde "EclesiaPresenter vX.Y.Z encontrado"
 *     o rojo con el error específico.
 *   - Banner first-run: instrucciones colapsables gated por localStorage.
 *
 * Flujo de éxito:
 *   pairWithDesktop → transport.connect(wsUrl, token) → nav('/service')
 *
 * Errores: el mapeo completo en `_humanError()` al final del fichero.
 */
export default function PairScreen() {
  const nav = useNavigate()
  const [mode, setMode] = useState('qr')   // 'qr' | 'manual'
  const [url, setUrl] = useState(() => {
    // Inicializador lazy: detección del hostname una sola vez al montar.
    if (typeof window === 'undefined') return ''
    // Prioridad: lo que el usuario tecleó la última vez (sessionStorage)
    // > la sugerencia basada en window.location.
    const saved = safeSessionGet(LAST_URL_KEY)
    if (saved) return saved
    return suggestCanonicalUrl(window.location?.hostname || '') || ''
  })
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scannerActive, setScannerActive] = useState(true)
  // scanAttempt incrementa cada vez que necesitamos remontar el QrScanner
  // (tras un QR inválido o un pairing fallido). React 18 batchea setState
  // del mismo tick: si solo togglearamos `scannerActive` de false→true,
  // el useEffect del scanner no se re-ejecutaría y `scannedRef` quedaría
  // a true para siempre, dejando el scanner mudo. El cambio de `key`
  // fuerza unmount+mount → estado interno limpio.
  const [scanAttempt, setScanAttempt] = useState(0)
  // Guard contra double-tap del submit y simultáneos QR-scan + manual.
  const inFlightRef = useRef(false)

  // --- Probe en onBlur ---
  // probeStatus refleja el estado del probe inline al campo URL:
  //   'idle'    → sin probe en marcha; renderiza el hint normal
  //   'probing' → fetching /api/info; renderiza "Comprobando…"
  //   'ok'      → probe exitoso; renderiza "✓ EclesiaPresenter vX.Y.Z encontrado"
  //   'fail'    → probe falló; renderiza el error específico abajo del input
  // probeError guarda el mensaje humano cuando 'fail'.
  // probeCtrlRef contiene el AbortController del probe en curso para cancelarlo
  // si el usuario cambia la URL mientras el probe está pending.
  const [probeStatus, setProbeStatus] = useState('idle')
  const [serverVersion, setServerVersion] = useState(null)
  const [probeError, setProbeError] = useState(null)
  const probeCtrlRef = useRef(null)

  // --- Banner first-run ---
  // Se decide en el initializer y no se vuelve a leer storage; el dismiss
  // baja el flag y persiste.
  const [showBanner, setShowBanner] = useState(
    () => safeLocalGet(FIRST_PAIR_SEEN_KEY) == null,
  )

  // Snapshot del hostname/origin del browser para los helpers de URL.
  // useRef porque NUNCA cambia durante la vida de la SPA y queremos evitar
  // re-renders por accesos a window.location.
  const winRef = useRef({
    origin: typeof window !== 'undefined' ? window.location?.origin || null : null,
    hostname: typeof window !== 'undefined' ? window.location?.hostname || '' : '',
  })

  // --- Modo same-origin (T12) ---
  // La app se sirve desde el PROPIO desktop server (http://IP:3434/app/):
  // el server al que parear es window.location.origin — ocultamos el campo
  // URL y pedimos solo PIN/QR. Calculado en el render body (no en ref) para
  // que los tests puedan stubear isServedFromDesktop.
  const servedFromDesktop = isServedFromDesktop(
    typeof window !== 'undefined' ? window.location : null,
  )

  // --- Banner cloud https (T12, preparación T15) ---
  // En la versión web https (Vercel) el navegador bloquea fetch http:// a la
  // LAN (mixed content) — banner informativo PERSISTENTE, tono neutro. La
  // defensa reactiva (PairingError mixed_content_o_shields) ya existe en
  // pairing.js. Gated por !isNativePlatform: el WebView Android de Capacitor
  // sirve desde https://localhost y NO debe ver este banner.
  let isNativePlatform = false
  try { isNativePlatform = Capacitor.isNativePlatform() } catch { /* web */ }
  const isHttpsCloud =
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    !servedFromDesktop &&
    !isNativePlatform

  // Sugerencia detectada: chip "Usar el detectado" cuando difiere del input.
  const suggested = suggestCanonicalUrl(winRef.current.hostname)

  // Detección del puerto del propio navegador (:5173 si Vite). El warning se
  // muestra incluso ANTES del submit como hint preventivo.
  const portIssue = detectPortIssue(url, winRef.current.origin)

  // Cleanup del probe in-flight al desmontar (evita setStates sobre componente
  // muerto si el user navega antes de que /api/info responda).
  useEffect(() => {
    return () => {
      if (probeCtrlRef.current) {
        probeCtrlRef.current.abort()
        probeCtrlRef.current = null
      }
    }
  }, [])

  function onUrlChange(e) {
    const next = e.target.value
    setUrl(next)
    if (error?.field === 'url') setError(null)
    // Cualquier edición invalida el probe previo + cancela el in-flight.
    if (probeStatus !== 'idle') {
      setProbeStatus('idle')
      setServerVersion(null)
      setProbeError(null)
    }
    if (probeCtrlRef.current) {
      probeCtrlRef.current.abort()
      probeCtrlRef.current = null
    }
  }

  /**
   * onBlur del input URL.
   *  1. Normaliza (añade scheme + canonical port).
   *  2. Dispara el probe en background con AbortController propio.
   *
   * Si el user vuelve a escribir, `onUrlChange` cancela el probe pending.
   */
  async function onUrlBlur() {
    const raw = url.trim()
    if (!raw) {
      setProbeStatus('idle')
      return
    }
    const normalized = normalizeBaseUrl(url)
    const finalUrl = normalized && normalized !== url ? normalized : url
    if (normalized && normalized !== url) {
      setUrl(normalized)
    }

    // No probamos si es same-origin (no tiene sentido) o si la detección
    // dice que es :5173: el warning ya está visible.
    if (detectPortIssue(finalUrl, winRef.current.origin).kind === 'dev_server') {
      setProbeStatus('idle')
      return
    }

    // Cancelar probe anterior si lo hubiera.
    if (probeCtrlRef.current) {
      probeCtrlRef.current.abort()
    }
    const ctrl = new AbortController()
    probeCtrlRef.current = ctrl
    setProbeStatus('probing')
    setProbeError(null)
    setServerVersion(null)
    try {
      // probeServer no acepta signal nuestra, pero su timeout interno (5s)
      // basta. Lo único que hacemos con `ctrl` es comprobar `aborted` antes
      // de aplicar setState, para no pisar estado si el user ya cambió URL.
      const r = await probeServer(finalUrl)
      if (ctrl.signal.aborted) return
      if (r.legacy) {
        // Desktop antiguo sin /api/info: mostramos un texto neutral en lugar
        // del ok verde, porque no sabemos versión y queremos transparencia.
        setProbeStatus('ok')
        setServerVersion('legacy')
      } else if (r.ok) {
        setProbeStatus('ok')
        setServerVersion(r.version || 'desconocida')
      }
    } catch (e) {
      if (ctrl.signal.aborted) return
      console.warn('[probe] inline blur fail:', e?.code || e?.message)
      setProbeStatus('fail')
      const human = e instanceof PairingError ? _humanError(e) : { message: e?.message || 'Error de red' }
      setProbeError(human.message)
    } finally {
      if (probeCtrlRef.current === ctrl) probeCtrlRef.current = null
    }
  }

  function dismissBanner() {
    safeLocalSet(FIRST_PAIR_SEEN_KEY, '1')
    setShowBanner(false)
  }

  async function handlePair({ url, pin }) {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      // Normaliza una vez más por si el submit llega antes del onBlur
      // (p.ej. usuario teclea PIN, pulsa Enter; el campo URL nunca perdió foco).
      const cleanUrl = normalizeBaseUrl(url) || url
      const { token, wsUrl } = await pairWithDesktop({ url: cleanUrl, pin })
      // Persistir SOLO la URL (el PIN cambia con cada reinicio del desktop).
      safeSessionSet(LAST_URL_KEY, cleanUrl)
      await transport.connect(wsUrl, token)
      nav('/service', { replace: true })
    } catch (e) {
      if (e instanceof PairingError) {
        setError(_humanError(e))
      } else {
        console.warn('[pairing] error inesperado:', e?.message || e)
        setError({ message: 'Error inesperado. Intenta de nuevo.' })
      }
      // Re-armar el scanner y forzar remount para permitir un nuevo intento
      setScannerActive(true)
      setScanAttempt((n) => n + 1)
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  function onQrScan(text) {
    // Pausa el scanner mientras procesamos para no leer el mismo QR dos veces
    setScannerActive(false)
    try {
      let parsed
      const trimmed = String(text || '').trim()
      if (trimmed.startsWith('{')) {
        parsed = JSON.parse(trimmed)
      } else {
        const u = new URL(trimmed)
        parsed = {
          url: `${u.protocol}//${u.host}`,
          pin: u.searchParams.get('pin'),
        }
      }
      if (!parsed?.url || !parsed?.pin) {
        throw new Error('QR sin datos válidos')
      }
      handlePair({ url: parsed.url, pin: String(parsed.pin) })
    } catch {
      setError({
        message: 'QR no válido. Usa el modo manual o vuelve a intentar.',
      })
      setScannerActive(true)
      setScanAttempt((n) => n + 1)
    }
  }

  function onModeChange(m) {
    if (loading || m === mode) return
    setError(null)
    setMode(m)
    if (m === 'qr') {
      // Volvemos a modo QR: scanner limpio (clave nueva → estado interno
      // del componente reseteado independientemente de scannerActive).
      setScannerActive(true)
      setScanAttempt((n) => n + 1)
    }
  }

  function useSuggested() {
    if (!suggested) return
    setUrl(suggested)
    if (error?.field === 'url') setError(null)
    // El user aceptó la sugerencia → reset del probe; un nuevo blur lo
    // disparará si quiere.
    setProbeStatus('idle')
    setProbeError(null)
    setServerVersion(null)
  }

  const manualDisabled =
    loading || pin.length !== 6 || (!servedFromDesktop && !url.trim())

  // El warning inline para :5173 NO es bloqueante (el probe del submit
  // decide); informa al usuario para que corrija antes de gastar intentos.
  const showDevServerWarning = portIssue.kind === 'dev_server' && !error?.field

  // Mostrar el chip "Usar el detectado" solo si:
  //   - tenemos una sugerencia válida (no localhost)
  //   - el campo está vacío O el valor actual no es la sugerencia ni una
  //     normalización de ella (evita el chip cuando ya está bien).
  const showSuggestedChip =
    suggested && url.trim() !== suggested && normalizeBaseUrl(url) !== suggested

  // ----- Render del slot debajo del input URL -----
  // Prioridad de mensajes (de más a menos urgente):
  //   1. Error duro tras submit (rojo) → ya lo pinta FormField via `error` prop
  //   2. Warning :5173 (ámbar)
  //   3. Probe fail (rojo) — solo si no estamos en submit-fail
  //   4. Probe probing (gris)
  //   5. Probe ok (verde)
  //   6. Hint normal (gris)
  const urlFieldError = error?.field === 'url' ? error.message : null
  let urlHint = 'Aparece en el panel Transmisión del PC'
  let urlHintTone = 'normal'  // 'normal' | 'warning' | 'success' | 'probing'
  if (!urlFieldError) {
    if (showDevServerWarning) {
      urlHint = 'Ese puerto es del mando (navegador). El PC normalmente está en :3434.'
      urlHintTone = 'warning'
    } else if (probeStatus === 'probing') {
      urlHint = 'Comprobando…'
      urlHintTone = 'probing'
    } else if (probeStatus === 'ok') {
      urlHint = serverVersion === 'legacy'
        ? '✓ Servidor encontrado (versión antigua)'
        : `✓ EclesiaPresenter v${serverVersion} encontrado`
      urlHintTone = 'success'
    } else if (probeStatus === 'fail' && probeError) {
      urlHint = probeError
      urlHintTone = 'warning'
    }
  }

  return (
    <div
      className="p-5 max-w-md mx-auto"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }}
    >
      <header className="text-center mb-6">
        <h1 className="font-display text-3xl text-ink-1 mb-1">Emparejar</h1>
        <p className="text-sm text-ink-3">
          Conecta con el PC donde corre EclesiaPresenter
        </p>
      </header>

      {/* Banner cloud https (persistente, informativo — NO error). La PWA en
          https no puede hablar con un PC en LAN http (mixed content); la vía
          correcta hoy es el QR del panel Transmisión. T15 traerá el relay. */}
      {isHttpsCloud && (
        <div
          className="mb-5 p-3 rounded-xl bg-bg-2 border border-line-2 text-xs text-ink-2 leading-relaxed"
          role="note"
          aria-label="Aviso de versión web"
        >
          <span className="font-semibold text-copper-100 block mb-1">
            Estás en la versión web
          </span>
          Para conectar con el PC de tu red local, abre el mando desde el QR
          del panel Transmisión del PC (http). Desde https el navegador
          bloquea conexiones a la red local.
          <span className="block mt-1 text-ink-3">
            Conexión cloud próximamente (T15).
          </span>
        </div>
      )}

      {/* Banner first-run con instrucciones colapsables. Gated por localStorage
          para que solo aparezca la primera vez por dispositivo/perfil. */}
      {showBanner && (
        <div
          className="mb-5 p-3 rounded-xl bg-bg-2 border border-line-2"
          role="region"
          aria-label="Instrucciones de emparejamiento"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-sm font-semibold text-copper-100">
              Cómo emparejar
            </span>
            <button
              type="button"
              onClick={dismissBanner}
              className="text-xs text-ink-3 hover:text-ink-2 transition px-2 py-0.5"
              aria-label="Cerrar instrucciones"
            >
              Entendido ✕
            </button>
          </div>
          <ol className="text-xs text-ink-2 space-y-1 pl-1 list-decimal list-inside">
            <li>Abre EclesiaPresenter en el PC</li>
            <li>Ve a Ajustes → Transmisión</li>
            <li>Copia la dirección y el PIN</li>
          </ol>
        </div>
      )}

      {/* Toggle modo */}
      <div className="flex bg-bg-2 rounded-xl p-1 mb-5">
        {['qr', 'manual'].map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            disabled={loading}
            aria-pressed={mode === m}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              mode === m
                ? 'bg-copper-300 text-bg-1'
                : 'text-ink-2 hover:text-ink-1'
            }`}
          >
            {m === 'qr' ? 'Escanear QR' : 'Manual'}
          </button>
        ))}
      </div>

      {/* QR mode */}
      {mode === 'qr' && (
        <div className="space-y-4">
          <QrScanner
            key={scanAttempt}
            active={scannerActive && !loading}
            onScan={onQrScan}
            onError={(e) =>
              setError({
                message: 'No se pudo abrir la cámara: ' + (e?.message || e),
              })
            }
          />
          <p className="text-xs text-center text-ink-3">
            En el PC: Ajustes → Transmisión → escanea el QR
          </p>
          {loading && (
            <p className="text-xs text-center text-copper-100">
              Emparejando…
            </p>
          )}
        </div>
      )}

      {/* Manual mode */}
      {mode === 'manual' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            // Same-origin: el server es el origen que nos sirvió — el campo
            // URL ni siquiera se renderiza.
            const targetUrl = servedFromDesktop ? window.location.origin : url
            if (!manualDisabled) handlePair({ url: targetUrl, pin })
          }}
        >
          {servedFromDesktop && (
            <div
              className="px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-xs text-ink-2"
              role="note"
            >
              <span className="text-ink-3">Conectado a este PC: </span>
              <span className="text-copper-100 font-medium">
                {typeof window !== 'undefined' ? window.location?.origin : ''}
              </span>
              <span className="block mt-0.5 text-ink-3">
                Solo necesitas el PIN del panel Transmisión.
              </span>
            </div>
          )}

          {!servedFromDesktop && showSuggestedChip && (
            <button
              type="button"
              onClick={useSuggested}
              disabled={loading}
              className="w-full text-left px-3 py-2 rounded-lg bg-bg-2 border border-line-1
                         text-xs text-ink-2 hover:bg-bg-3 transition"
            >
              <span className="text-ink-3">Detectado: </span>
              <span className="text-copper-100 font-medium">{suggested}</span>
              <span className="float-right text-copper-200 font-semibold">Usar →</span>
            </button>
          )}

          {!servedFromDesktop && (
            <FormField
              label="Dirección del PC"
              placeholder="http://<IP>:3434"
              value={url}
              onChange={onUrlChange}
              onBlur={onUrlBlur}
              disabled={loading}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              hint={urlHint}
              hintTone={urlHintTone}
              error={urlFieldError}
            />
          )}
          <FormField
            label="PIN de 6 dígitos"
            placeholder="123456"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              if (error?.field === 'pin') setError(null)
            }}
            disabled={loading}
            inputMode="numeric"
            maxLength={6}
            hint="Cambia cada vez que reinicias el PC"
            error={error?.field === 'pin' ? error.message : null}
          />
          <BigButton
            type="submit"
            loading={loading}
            disabled={manualDisabled}
          >
            Emparejar
          </BigButton>
        </form>
      )}

      {/* Banner de error global (sin campo asociado) */}
      {error?.message && !error?.field && (
        <div
          className="mt-5 p-3 rounded-lg bg-live/10 border border-live/30 text-sm text-live"
          role="alert"
        >
          {error.message}
        </div>
      )}
    </div>
  )
}

/**
 * Convierte un PairingError en { field?, message } para renderizar
 * el feedback en el campo correcto o como banner global.
 *
 * Mapeo de los 12 códigos (taxonomía cerrada del hardening T3):
 *   - pin_incorrecto              → field 'pin'
 *   - demasiados_intentos         → banner con countdown
 *   - puerto_incorrecto           → field 'url' (no es EclesiaPresenter / JSON inválido / 404 no-legacy)
 *   - puerto_dev_server           → field 'url' (URL del navegador, no del PC)
 *   - no_es_eclesia               → field 'url' (responde JSON pero otra app)
 *   - firewall_o_red              → field 'url' (timeout — única ruta que menciona WiFi/firewall)
 *   - no_alcanzable               → field 'url' (probe OK pero POST falló, glitch)
 *   - servidor_caido              → field 'url' (ECONNREFUSED — app no abierta)
 *   - mixed_content_o_shields     → banner global (Brave Shields / CSP)
 *   - respuesta_invalida          → banner global (server con shape distinto)
 *   - servidor_legacy             → no debería llegar a UI (silent fallback), pero por defensa
 *   - unknown                     → banner global con err.message
 *
 * Decisión consciente: solo `firewall_o_red` menciona "misma WiFi". Antes
 * `no_alcanzable` lo decía, lo que era ambiguo (cubría timeout y POST-fail
 * post-probe-OK, dos cosas distintas).
 */
function _humanError(err) {
  switch (err.code) {
    case 'pin_incorrecto':
      return {
        field: 'pin',
        message: 'PIN incorrecto. Revisa que coincida con el PC.',
      }
    case 'demasiados_intentos': {
      const sec = Math.ceil((err.extra?.retryAfterMs || 60_000) / 1000)
      return {
        message: `Demasiados intentos fallidos. Vuelve a intentar en ${sec}s.`,
      }
    }
    case 'puerto_incorrecto':
      return {
        field: 'url',
        message:
          'Esa dirección responde pero no es EclesiaPresenter. Comprueba el puerto (normalmente :3434).',
      }
    case 'puerto_dev_server':
      return {
        field: 'url',
        message:
          'Esa es la URL del navegador (el mando), no la del PC.',
      }
    case 'no_es_eclesia':
      return {
        field: 'url',
        message:
          'Esa dirección responde, pero no es EclesiaPresenter. ¿Has puesto el puerto correcto?',
      }
    case 'firewall_o_red':
      return {
        field: 'url',
        message:
          'El PC no responde a tiempo. Verifica que el firewall permita EclesiaPresenter y que estáis en la misma WiFi.',
      }
    case 'servidor_caido':
      return {
        field: 'url',
        message:
          'Nada responde en esa dirección. Asegúrate de que EclesiaPresenter está abierto en el PC.',
      }
    case 'mixed_content_o_shields':
      return {
        message:
          'El navegador está bloqueando la conexión (Brave Shields o contenido mixto). Baja el escudo o abre la app desde http://.',
      }
    case 'no_alcanzable':
      return {
        field: 'url',
        message:
          'El servidor dejó de responder durante el emparejamiento. Inténtalo de nuevo.',
      }
    case 'respuesta_invalida':
      return {
        message:
          'El servidor respondió con un formato inesperado. ¿Versión incompatible?',
      }
    case 'servidor_legacy':
      // Silent fallback: este código se atrapa internamente y no debería
      // llegar a UI. Si llega, mostramos algo neutro.
      return {
        message: 'Versión antigua del servidor detectada.',
      }
    default:
      return { message: err.message || 'Error desconocido' }
  }
}
