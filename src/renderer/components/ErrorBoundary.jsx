import { Component } from 'react'

/**
 * Error Boundary: captura cualquier error de render de los componentes hijos
 * y muestra un mensaje recuperable en vez de dejar TODA la app en pantalla
 * negra. Critico para uso en produccion (servicio en vivo): si un panel falla,
 * el resto de la app sigue usable.
 *
 * React solo invoca getDerivedStateFromError / componentDidCatch para errores
 * lanzados DURANTE el render, en metodos del ciclo de vida y en constructores
 * de los descendientes. No captura errores en handlers async ni en setTimeout.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Log para diagnostico (aparece en DevTools / logs del usuario)
    console.error('[ErrorBoundary] crash capturado:', error, info?.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', minHeight: 240, padding: 40,
          textAlign: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 40, opacity: 0.7 }}>⚠️</div>
          <h2 style={{
            fontFamily: 'var(--font-display, serif)', fontSize: 22,
            color: 'var(--text-1, #f5ebe0)', margin: 0,
          }}>
            Este panel tuvo un problema
          </h2>
          <p style={{
            fontSize: 13, color: 'var(--text-3, #8a7866)',
            maxWidth: 420, lineHeight: 1.5, margin: 0,
          }}>
            El resto de la aplicacion sigue funcionando. Pulsa el boton para
            reintentar, o cambia a otro panel desde la barra lateral.
          </p>
          {this.state.error?.message && (
            <code style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
              color: 'var(--text-4, #6b5d4f)', background: 'var(--bg-2, #1c1614)',
              padding: '6px 10px', borderRadius: 6, maxWidth: 480,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {this.state.error.message}
            </code>
          )}
          <button
            onClick={this.reset}
            style={{
              marginTop: 8, padding: '8px 20px', borderRadius: 8,
              border: '1px solid var(--copper-300, #a85f33)',
              background: 'var(--copper-200, #db9f75)', color: '#1a0e08',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
