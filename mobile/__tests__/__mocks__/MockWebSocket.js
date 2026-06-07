/**
 * MockWebSocket.js
 *
 * Sustituto de `global.WebSocket` para tests unitarios. Permite al test
 * disparar eventos del socket (open, message, error, close) en orden
 * determinista, sin depender de un server real.
 *
 * Uso:
 *   beforeEach(() => {
 *     MockWebSocket.instances = []
 *     global.WebSocket = MockWebSocket
 *   })
 *   const ws = MockWebSocket.last()
 *   ws._open()
 *   ws._message({ type: 'pgm-update', payload: {...} })
 */
export class MockWebSocket {
  static CONNECTING = 0
  static OPEN       = 1
  static CLOSING    = 2
  static CLOSED     = 3
  static instances  = []

  static last() {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }

  constructor(url, protocols) {
    this.url        = url
    this.protocols  = protocols
    this.readyState = MockWebSocket.CONNECTING
    this.sent       = []
    this.onopen     = null
    this.onmessage  = null
    this.onerror    = null
    this.onclose    = null
    MockWebSocket.instances.push(this)
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('MockWebSocket.send while not OPEN')
    }
    this.sent.push(data)
  }

  close(code = 1000, reason = '') {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    if (typeof this.onclose === 'function') {
      this.onclose({ code, reason })
    }
  }

  /* ===== Helpers de test ===== */
  _open() {
    this.readyState = MockWebSocket.OPEN
    if (typeof this.onopen === 'function') this.onopen({})
  }

  _error(err = { message: 'mock-error' }) {
    if (typeof this.onerror === 'function') this.onerror(err)
  }

  _message(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    if (typeof this.onmessage === 'function') this.onmessage({ data: payload })
  }

  _close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    if (typeof this.onclose === 'function') this.onclose({ code, reason })
  }

  /** Devuelve los JSON parseados de cada send. */
  sentJson() {
    return this.sent.map((s) => {
      try { return JSON.parse(s) } catch { return null }
    })
  }
}
