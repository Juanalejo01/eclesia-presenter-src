import { useEffect, useState } from 'react'
import {
  getKey, setKey, testKey,
  listAvailableBibles,
  getEnabledBibles, setEnabledBibles,
} from '../services/apiBible.js'

export default function Settings({ onClose, onUpdate }) {
  const [keyValue, setKeyValue]       = useState(getKey())
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState(null)

  const [discovering, setDiscovering] = useState(false)
  const [available, setAvailable]     = useState([])
  const [discoveryError, setError]    = useState(null)
  const [enabled, setEnabled]         = useState(getEnabledBibles())

  // Auto-test al montar si hay key
  useEffect(() => { if (keyValue) handleTest() }, [])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testKey(keyValue)
    setTesting(false)
    setTestResult(result)
    if (result.ok) setKey(keyValue)
  }

  const handleDiscover = async () => {
    setDiscovering(true)
    setError(null)
    setKey(keyValue)  // asegurar que está guardada
    try {
      const bibles = await listAvailableBibles('spa')
      setAvailable(bibles)
    } catch (e) {
      setError(e.message)
    }
    setDiscovering(false)
  }

  const isEnabled = (id) => enabled.some(e => e.id === id)

  const toggleBible = (bible) => {
    const next = isEnabled(bible.id)
      ? enabled.filter(e => e.id !== bible.id)
      : [...enabled, bible]
    setEnabled(next)
    setEnabledBibles(next)
    onUpdate?.()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-700">

        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Ajustes — api.bible</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Aviso legal */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 leading-relaxed">
            <p className="font-semibold mb-1">Sobre las versiones bajo copyright</p>
            <p>TLA, RVR60, NVI, DHH y otras Biblias en español modernas están bajo copyright activo y no pueden empaquetarse en software open-source. Para usarlas legalmente, registra una API key gratuita en <a href="https://scripture.api.bible" target="_blank" rel="noreferrer" className="underline text-amber-100">scripture.api.bible</a>, acepta sus términos, y EclesiaPresenter las consultará bajo demanda con tu key.</p>
          </div>

          {/* API key */}
          <div>
            <label className="text-sm font-semibold text-slate-200 mb-2 block">API key</label>
            <div className="flex gap-2">
              <input
                type="password" value={keyValue} onChange={e => setKeyValue(e.target.value)}
                placeholder="Pega aquí tu key de scripture.api.bible"
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                onClick={handleTest} disabled={!keyValue || testing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm rounded-lg transition-colors">
                {testing ? 'Probando...' : 'Probar'}
              </button>
            </div>

            {testResult && (
              <div className={`mt-2 px-3 py-2 rounded-lg text-xs
                ${testResult.ok
                  ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
                {testResult.ok
                  ? `✅ Conexión OK · ${testResult.count} Biblias en español disponibles`
                  : `❌ ${testResult.error}`}
              </div>
            )}
          </div>

          {/* Descubrir Biblias */}
          {testResult?.ok && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-200">Biblias disponibles</label>
                <button
                  onClick={handleDiscover} disabled={discovering}
                  className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
                  {discovering ? 'Cargando...' : (available.length > 0 ? 'Recargar' : 'Listar Biblias')}
                </button>
              </div>

              {discoveryError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-300">
                  {discoveryError}
                </div>
              )}

              {available.length > 0 && (
                <div className="space-y-1 max-h-72 overflow-y-auto bg-slate-900/40 rounded-lg p-2 border border-slate-700">
                  {available.map(bible => {
                    const on = isEnabled(bible.id)
                    return (
                      <button key={bible.id}
                        onClick={() => toggleBible(bible)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors flex items-start gap-3
                          ${on ? 'bg-blue-600/20 border border-blue-500/50' : 'hover:bg-slate-700/60 border border-transparent'}`}>
                        <span className={`mt-0.5 w-5 h-5 rounded shrink-0 flex items-center justify-center text-xs
                          ${on ? 'bg-blue-500 text-white' : 'border border-slate-600'}`}>
                          {on ? '✓' : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-white">{bible.abbr}</span>
                            <span className="text-xs text-slate-400 truncate">{bible.nameLocal}</span>
                          </div>
                          {bible.copyright && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{bible.copyright}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {available.length === 0 && !discovering && !discoveryError && (
                <p className="text-xs text-slate-500">Pulsa "Listar Biblias" para descubrir las versiones de tu cuenta.</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-700 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
            Cerrar
          </button>
        </div>

      </div>
    </div>
  )
}
