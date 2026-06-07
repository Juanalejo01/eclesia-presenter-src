import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner.jsx'
import BigButton from '../components/BigButton.jsx'
import FormField from '../components/FormField.jsx'
import { pairWithDesktop, PairingError } from '../services/pairing.js'
import {
  normalizeBaseUrl,
  detectPortIssue,
  suggestCanonicalUrl,
} from '../services/urlHelpers.js'
import { transport } from '../services/transport.js'

const LAST_URL_KEY = 'eclesia.pair.lastUrl'

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
    try {
      const saved = window.sessionStorage?.getItem(LAST_URL_KEY)
      if (saved) return saved
    } catch { /* sessionStorage puede tirar en private mode */ }
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

  // Snapshot del hostname/origin del browser para los helpers de URL.
  // useRef porque NUNCA cambia durante la vida de la SPA y queremos evitar
  // re-renders por accesos a window.location.
  const winRef = useRef({
    origin: typeof window !== 'undefined' ? window.location?.origin || null : null,
    hostname: typeof window !== 'undefined' ? window.location?.hostname || '' : '',
  })

  // Sugerencia detectada: chip "Usar el detectado" cuando difiere del input.
  const suggested = suggestCanonicalUrl(winRef.current.hostname)

  // Detección del puerto del propio navegador (:5173 si Vite). El warning se
  // muestra incluso ANTES del submit como hint preventivo.
  const portIssue = detectPortIssue(url, winRef.current.origin)

  // Limpia el error inline del campo URL cuando el usuario empieza a editar.
  useEffect(() => {
    if (error?.field === 'url') {
      // intencionado: dependiendo de `url` borramos el error al primer cambio.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onUrlChange(e) {
    const next = e.target.value
    setUrl(next)
    if (error?.field === 'url') setError(null)
  }

  function onUrlBlur() {
    if (!url.trim()) return
    const normalized = normalizeBaseUrl(url)
    if (normalized && normalized !== url) {
      setUrl(normalized)
    }
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
      try {
        window.sessionStorage?.setItem(LAST_URL_KEY, cleanUrl)
      } catch { /* ignore */ }
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
  }

  const manualDisabled = loading || !url.trim() || pin.length !== 6

  // El warning inline para :5173 NO es bloqueante (el probe del submit
  // decide); informa al usuario para que corrija antes de gastar intentos.
  const showDevServerWarning = portIssue.kind === 'dev_server' && !error?.field

  // Mostrar el chip "Usar el detectado" solo si:
  //   - tenemos una sugerencia válida (no localhost)
  //   - el campo está vacío O el valor actual no es la sugerencia ni una
  //     normalización de ella (evita el chip cuando ya está bien).
  const showSuggestedChip =
    suggested && url.trim() !== suggested && normalizeBaseUrl(url) !== suggested

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
            if (!manualDisabled) handlePair({ url, pin })
          }}
        >
          {showSuggestedChip && (
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
            hint={
              showDevServerWarning
                ? 'Ese puerto es del mando (navegador). El PC normalmente está en :3434.'
                : 'Aparece en el panel Transmisión del PC'
            }
            error={error?.field === 'url' ? error.message : null}
          />
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
 * Tabla actualizada en el hardening T3:
 *   - puerto_incorrecto         → field 'url', menciona :3434 explícitamente
 *   - servidor_caido            → field 'url', dirige a abrir EclesiaPresenter
 *   - mixed_content_o_shields   → banner global, menciona Shields/CSP
 *   - version_incompatible      → banner global, dirige a actualizar
 *   - no_alcanzable             → SIN mencionar "WiFi" salvo timeout puro;
 *                                  ahora indica firewall/red distinta
 *
 * Nota: la mención a "misma WiFi" del antiguo no_alcanzable era el sintoma
 * central del findings UX. Ya con el probe upstream, llegar a no_alcanzable
 * tras un /api/info OK es estadísticamente raro (glitch real, no error
 * del usuario), así que ese mensaje se relaja.
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
    case 'version_incompatible':
      return {
        message:
          'Tu versión de EclesiaPresenter en el PC es muy antigua. Actualízala para emparejar.',
      }
    case 'no_alcanzable':
      return {
        field: 'url',
        message:
          'El PC no responde a tiempo. Comprueba que móvil y PC están en la misma WiFi y que el firewall permite EclesiaPresenter.',
      }
    case 'respuesta_invalida':
      return {
        message:
          'El servidor respondió con un formato inesperado. ¿Versión incompatible?',
      }
    default:
      return { message: err.message || 'Error desconocido' }
  }
}
