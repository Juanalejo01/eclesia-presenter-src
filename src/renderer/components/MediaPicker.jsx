import { useEffect, useState } from 'react'
import { pickMedia, listMedia, deleteMedia, getMediaURL, isUsingNativeStorage } from '../services/mediaService.js'

/**
 * Picker visual de medios. Lista miniaturas, permite añadir nuevos archivos
 * y seleccionar el actual. Notifica vía onChange con la URL utilizable.
 *
 * @param {Object} props
 * @param {'image'|'video'|'all'} props.kind - tipo permitido
 * @param {string} props.value - URL actual
 * @param {(url: string|null, item: object|null) => void} props.onChange
 * @param {string} props.label
 */
export default function MediaPicker({ kind = 'all', value, onChange, label = 'Medios' }) {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [picking, setPicking]   = useState(false)
  const [error, setError]       = useState(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await listMedia({ type: kind === 'all' ? undefined : kind })
      setItems(list)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [kind])

  const handlePick = async () => {
    setPicking(true)
    setError(null)
    try {
      const added = await pickMedia(kind)
      await refresh()
      // Auto-seleccionar el primero recién añadido
      if (added?.[0]) {
        const url = getMediaURL(added[0])
        onChange?.(url, added[0])
      }
    } catch (e) { setError(e.message) }
    setPicking(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('¿Quitar este archivo de la biblioteca?')) return
    await deleteMedia(id)
    refresh()
    // Si era el seleccionado, deseleccionar
    const removed = items.find(i => i.id === id)
    if (removed && getMediaURL(removed) === value) onChange?.(null, null)
  }

  const handleSelect = (item) => {
    const url = getMediaURL(item)
    onChange?.(url, item)
  }

  const isSelected = (item) => getMediaURL(item) === value

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400">{label}</label>
        <div className="flex items-center gap-2">
          {!isUsingNativeStorage() && (
            <span className="text-[10px] text-amber-400">IndexedDB (preview)</span>
          )}
          <button onClick={handlePick} disabled={picking}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded transition-colors">
            {picking ? 'Subiendo...' : '+ Subir archivo'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-xs text-slate-500 py-4 text-center">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-slate-500 py-6 text-center bg-slate-900/30 rounded border border-slate-700/50">
          Aún no hay {kind === 'image' ? 'imágenes' : kind === 'video' ? 'videos' : 'medios'}.
          <br/>Pulsa "Subir archivo" para añadir.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
          {items.map(item => {
            const url = getMediaURL(item)
            const selected = isSelected(item)
            return (
              <div key={item.id}
                onClick={() => handleSelect(item)}
                className={`group relative aspect-video rounded overflow-hidden cursor-pointer transition-all
                  ${selected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800' : 'opacity-80 hover:opacity-100'}`}>
                {item.type === 'image' ? (
                  <img src={url} alt={item.name} className="w-full h-full object-cover"/>
                ) : (
                  <>
                    <video src={url} muted playsInline className="w-full h-full object-cover"
                      onLoadedMetadata={(e) => { e.target.currentTime = 0.1 }}/>
                    <span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1 rounded">▶ {item.type}</span>
                  </>
                )}

                <button onClick={(e) => handleDelete(e, item.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/70 hover:bg-red-600 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  ✕
                </button>

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <p className="text-[10px] text-white truncate">{item.name}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
