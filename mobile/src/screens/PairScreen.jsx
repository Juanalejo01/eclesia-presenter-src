import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner.jsx'
import BigButton from '../components/BigButton.jsx'
import FormField from '../components/FormField.jsx'
import { pairWithDesktop, PairingError } from '../services/pairing.js'
import { transport } from '../services/transport.js'

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
 * Flujo de éxito:
 *   pairWithDesktop → transport.connect(wsUrl, token) → nav('/service')
 *
 * Errores:
 *   - PIN incorrecto      → mensaje en el campo PIN
 *   - URL no alcanzable   → mensaje en el campo URL
 *   - Rate limit          → banner con countdown del retry-after
 *   - Respuesta inválida  → banner genérico
 */
export default function PairScreen() {
  const nav = useNavigate()
  const [mode, setMode] = useState('qr')   // 'qr' | 'manual'
  const [url, setUrl] = useState('')
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

  async function handlePair({ url, pin }) {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const { token, wsUrl } = await pairWithDesktop({ url, pin })
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

  const manualDisabled = loading || !url.trim() || pin.length !== 6

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
          <FormField
            label="Dirección del PC"
            placeholder="http://192.168.X.X:3434"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint="Aparece en el panel Transmisión del PC"
            error={error?.field === 'url' ? error.message : null}
          />
          <FormField
            label="PIN de 6 dígitos"
            placeholder="123456"
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
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
    case 'no_alcanzable':
      return {
        field: 'url',
        message:
          'No se pudo conectar. Comprueba que el PC y el móvil están en la misma WiFi.',
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
