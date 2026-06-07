/**
 * capacitor-preferences.js (mock)
 *
 * Sustituye a `@capacitor/preferences` en el entorno de tests Jest
 * (Node, sin Capacitor). Implementación in-memory para que los tests
 * de transportStorage funcionen sin el plugin nativo.
 */
const _store = new Map()

export const Preferences = {
  async get({ key }) {
    return { value: _store.has(key) ? _store.get(key) : null }
  },
  async set({ key, value }) {
    _store.set(key, value)
  },
  async remove({ key }) {
    _store.delete(key)
  },
  async clear() {
    _store.clear()
  },
}
