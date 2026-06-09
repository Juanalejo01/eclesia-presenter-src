/**
 * AnnouncementForm (T11)
 *
 * Formulario stateful para componer y enviar un anuncio rapido al PC.
 * El operador escribe titulo + cuerpo y al pulsar "Proyectar anuncio"
 * mandamos via WS un comando ANNOUNCE que el PC pinta como slide
 * (tipo 'announcement', renderer generico de SlideRenderer).
 *
 * Limites (alineados con el server, ver wsRemote.js case 'announce'):
 *   - title: 1..80 chars (trim)
 *   - body:  1..500 chars (trim)
 *
 * maxLength duro en los inputs como segunda barrera por si el contador JS
 * falla; el server tambien valida. Defense in depth.
 *
 * Sin XSS: el renderer del PC pinta s.text via React {children} (auto-escape),
 * NO via innerHTML — texto con '<script>' aparece literal en pantalla. NO se
 * permite markdown ni HTML. Para defensa-en-profundidad colapsamos saltos de
 * linea excesivos (>=3 \n consecutivos → 2) para que el cuerpo no ocupe toda
 * la pantalla de whitespace vertical.
 *
 * Sin durationMs UI en T11 — se puede agregar en T11.5 con un select de
 * 30s/1min/5min. El server lo acepta opcional asi que es zero-cost para
 * extender mas adelante.
 */
import { useState } from 'react'
import BigButton from './BigButton.jsx'
import { transport, ClientCommand } from '../services/transport.js'
import { useConnection } from '../hooks/useConnection.js'
import { tapMedium } from '../services/haptics.js'

const MAX_TITLE = 80
const MAX_BODY = 500
// Umbral a partir del cual el contador cambia de color (ambar) — avisa al
// operador que se acerca al maximo antes de chocar con el corte duro.
const TITLE_WARN_FROM = Math.floor(MAX_TITLE * 0.9)   // 72
const BODY_WARN_FROM = Math.floor(MAX_BODY * 0.9)    // 450

/**
 * Colapsa saltos de linea excesivos. \n\n\n+ → \n\n. Defensa-en-profundidad
 * contra un payload que ocupe la pantalla del PC con whitespace vertical.
 */
function collapseNewlines(str) {
  return str.replace(/\n{3,}/g, '\n\n')
}

function counterTone(n, max, warnFrom) {
  if (n >= max) return 'text-live'
  if (n >= warnFrom) return 'text-copper-200'
  return 'text-ink-3'
}

export default function AnnouncementForm() {
  const { isConnected } = useConnection()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  // status: 'idle' (input habilitado) | 'sent' (toast verde "Anuncio enviado")
  // No usamos 'sending' porque transport.send es sincrono y no espera ACK del
  // server — todo se siente instantaneo al operador.
  const [status, setStatus] = useState('idle')

  const titleTrimmed = title.trim()
  const bodyTrimmed = body.trim()
  const canSend = isConnected && titleTrimmed.length >= 1 && bodyTrimmed.length >= 1

  function handleSubmit(e) {
    e?.preventDefault?.()
    if (!canSend) return
    tapMedium()
    // Sanitize: trim + slice + collapse newlines excesivos. El server tambien
    // valida, pero hacerlo en cliente es defense-in-depth y reduce el ruido
    // de errors visibles al operador.
    const cleanTitle = titleTrimmed.slice(0, MAX_TITLE)
    const cleanBody = collapseNewlines(bodyTrimmed).slice(0, MAX_BODY)
    transport.send({
      type: ClientCommand.ANNOUNCE,
      payload: { title: cleanTitle, body: cleanBody },
    })
    setStatus('sent')
    setTitle('')
    setBody('')
    // Auto-clear del toast tras 3s. setTimeout sin cleanup: si el componente
    // desmonta antes, el setStatus en un componente desmontado es no-op + warn
    // ignorable en dev. Para evitarlo limpiariamos via ref, pero la simplicidad
    // del flujo de un anuncio (3s) no lo amerita.
    setTimeout(() => setStatus('idle'), 3000)
  }

  const titleCount = title.length
  const bodyCount = body.length
  const disabledHint = !isConnected ? 'Sin conexion con el PC' : null

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Campo titulo */}
      <label className="block">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm text-ink-2 font-medium">Titulo</span>
          <span
            className={`text-xs font-mono ${counterTone(titleCount, MAX_TITLE, TITLE_WARN_FROM)}`}
            aria-live="polite"
          >
            {titleCount}/{MAX_TITLE}
          </span>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          disabled={!isConnected}
          placeholder="AVISO"
          className="w-full h-12 px-4 rounded-lg bg-bg-2 border border-line-1
                     text-ink-1 placeholder:text-ink-3
                     focus:outline-none focus:border-copper-200 focus:bg-bg-3
                     transition-colors disabled:opacity-60"
          aria-label="Titulo del anuncio"
        />
      </label>

      {/* Campo cuerpo */}
      <label className="block">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm text-ink-2 font-medium">Cuerpo</span>
          <span
            className={`text-xs font-mono ${counterTone(bodyCount, MAX_BODY, BODY_WARN_FROM)}`}
            aria-live="polite"
          >
            {bodyCount}/{MAX_BODY}
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={4}
          disabled={!isConnected}
          placeholder="Escribe el mensaje que aparecera en pantalla"
          className="w-full px-4 py-3 rounded-lg bg-bg-2 border border-line-1
                     text-ink-1 placeholder:text-ink-3
                     focus:outline-none focus:border-copper-200 focus:bg-bg-3
                     transition-colors disabled:opacity-60 resize-none"
          aria-label="Cuerpo del anuncio"
        />
      </label>

      {disabledHint && (
        <p className="text-xs text-ink-3" role="status">{disabledHint}</p>
      )}

      <BigButton
        type="submit"
        variant="primary"
        disabled={!canSend}
        aria-label="Proyectar anuncio en el PC"
      >
        Proyectar anuncio
      </BigButton>

      {/* Toast inline de confirmacion. role=status + aria-live para que
          el lector de pantalla lo anuncie sin interrumpir el flujo. */}
      {status === 'sent' && (
        <p
          className="text-sm text-ready text-center"
          role="status"
          aria-live="polite"
        >
          Anuncio enviado
        </p>
      )}
    </form>
  )
}
