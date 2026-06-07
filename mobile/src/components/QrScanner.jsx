import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/**
 * QrScanner
 *
 * Lee QR codes desde la cámara trasera del dispositivo. Se basa en
 * `getUserMedia` + `jsQR` puro, sin plugins nativos — funciona en web
 * moderno, Android Chrome, iOS Safari 14.5+ y dentro de Capacitor
 * (con el permiso CAMERA correctamente declarado).
 *
 * Por qué jsQR y no @capacitor/barcode-scanner u otra librería nativa:
 *   - jsQR pesa ~50KB y vive en el bundle JS; sin permisos extra de
 *     plugins. La cámara la pide el getUserMedia estándar.
 *   - Funciona idéntico en preview web (Vite) y en device, sin
 *     necesidad de doble code-path.
 *
 * Props:
 *   onScan(text)  — callback con el contenido del QR. Solo se llama UNA VEZ
 *                   por vida del componente; reactivar el scanner pasa por
 *                   desmontarlo (recomendado: cambiar `key` desde el padre)
 *                   o togglear `active`.
 *   onError(err)  — si la cámara falla (permiso denegado, no hay cámara…)
 *   active        — bool. Si false, libera la cámara y deja de scanear.
 *                   Útil para apagar el scanner mientras hay un dialog,
 *                   el pareo está en vuelo, etc.
 *
 * Notas internas:
 *   - `onScan` y `onError` se guardan en refs para que cambiar su
 *     identidad (cosa habitual en React si el padre no memoiza) NO
 *     re-ejecute el efecto que abre la cámara. El único disparador del
 *     ciclo de vida del stream es `active`.
 *   - Tras `await video.play()` re-chequeamos `cancelled` para no dejar
 *     un stream zombi si el componente se desmontó o pasó a active=false
 *     mientras el play estaba pendiente.
 */
export default function QrScanner({ onScan, onError, active = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const streamRef = useRef(null)
  const scannedRef = useRef(false)
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)
  const [status, setStatus] = useState('idle')  // idle | requesting | scanning | error

  // Refs siempre apuntando a la última versión del callback. Permite que
  // el padre pase funciones inline sin reabrir la cámara en cada render.
  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    if (!active) {
      // active=false: libera cámara si la había
      _releaseStream()
      setStatus('idle')
      return
    }

    let cancelled = false
    scannedRef.current = false
    setStatus('requesting')

    ;(async () => {
      try {
        // Cámara trasera preferida; si no hay, fallback a default.
        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()
        // Re-chequear cancelación tras el await: el unmount o un toggle
        // a active=false pudo ocurrir mientras el play estaba pendiente.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          try { video.srcObject = null } catch { /* ignore */ }
          streamRef.current = null
          return
        }
        setStatus('scanning')
        loop()
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          console.warn('[qr-scanner] cámara falló:', e?.message || e)
          onErrorRef.current?.(e)
        }
      }
    })()

    function loop() {
      if (cancelled || scannedRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth
        const h = video.videoHeight
        if (w > 0 && h > 0) {
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(video, 0, 0, w, h)
          const imageData = ctx.getImageData(0, 0, w, h)
          const code = jsQR(imageData.data, w, h, {
            inversionAttempts: 'dontInvert',
          })
          if (code?.data && !scannedRef.current) {
            scannedRef.current = true
            onScanRef.current?.(code.data)
            return  // No seguir loop: el componente decidirá si rearmar
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    function _releaseStream() {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      const video = videoRef.current
      if (video) {
        try { video.srcObject = null } catch { /* ignore */ }
      }
    }

    return () => {
      cancelled = true
      _releaseStream()
    }
  }, [active])

  return (
    <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-bg-3 border border-line-1">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />
      {/* Marco visual del target */}
      <div className="absolute inset-8 border-2 border-copper-200/60 rounded-xl pointer-events-none" />
      {status === 'requesting' && (
        <div className="absolute inset-0 grid place-items-center text-ink-2 text-sm bg-bg-3/80">
          Pidiendo permiso de cámara...
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center text-live text-sm text-center p-4 bg-bg-3/90">
          No se pudo acceder a la cámara. Usa el modo manual.
        </div>
      )}
    </div>
  )
}
