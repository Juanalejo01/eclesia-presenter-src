import { confirm, prompt } from '../services/dialogService.js'

/**
 * Canvas central del editor (Canva/Procreate-style).
 *
 * Muestra un preview 16:9 grande con sombra elegante, y debajo la fila
 * de "Estilos predefinidos" + "Mis presets" como mini-cards horizontales.
 *
 * Props:
 *   renderPreview()    Función que devuelve JSX para llenar el 16:9.
 *   subtitle           Texto pequeño al lado del título del canvas.
 *   presets            [{ id, label, bg, theme? }] — built-in.
 *   activePresetId     id del preset activo.
 *   onPresetClick(p)   Handler al clicar una mini-card.
 *   presetSubtitle     Sub-texto pequeño junto a "Estilos predefinidos".
 *   userPresets        [{ id, label, bg, user:true, ... }] — del usuario.
 *   onUserPresetClick  Handler al clicar un user preset.
 *   onSaveCurrent      Handler del botón "Guardar como preset" — recibe (label).
 *                      Si null/undefined, no se renderiza el botón.
 *   onDeleteUserPreset Handler para eliminar un user preset (recibe id).
 *   onRenameUserPreset Handler para renombrar (recibe id, label).
 */
export default function EditorCanvas({
  renderPreview,
  subtitle,
  presets,
  activePresetId,
  onPresetClick,
  presetSubtitle,
  userPresets,
  onUserPresetClick,
  onSaveCurrent,
  onDeleteUserPreset,
  onRenameUserPreset,
}) {
  const handleSave = async () => {
    if (typeof onSaveCurrent !== 'function') return
    const label = await prompt({
      title: 'Guardar preset',
      message: 'Nombre del preset:',
      defaultValue: 'Mi preset',
      placeholder: 'Ej. Mi degradado dorado',
      confirmLabel: 'Guardar',
      cancelLabel: 'Cancelar',
    })
    const trimmed = (label || '').trim()
    if (trimmed) onSaveCurrent(trimmed)
  }
  const handleDelete = async (e, p) => {
    e.stopPropagation()
    if (!onDeleteUserPreset) return
    const ok = await confirm({
      title: 'Eliminar preset',
      message: `¿Eliminar el preset "${p.label}"?`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (ok) onDeleteUserPreset(p.id)
  }
  const handleRename = async (e, p) => {
    e.stopPropagation()
    if (!onRenameUserPreset) return
    const label = await prompt({
      title: 'Renombrar preset',
      message: 'Nuevo nombre:',
      defaultValue: p.label,
      placeholder: 'Ej. Mi degradado dorado',
      confirmLabel: 'Renombrar',
      cancelLabel: 'Cancelar',
    })
    const trimmed = (label || '').trim()
    if (trimmed && trimmed !== p.label) onRenameUserPreset(p.id, trimmed)
  }

  return (
    <div className="editor-canvas-col">
      {/* === 16:9 preview === */}
      <div className="editor-canvas-wrap">
        <div className="editor-canvas-frame">
          {renderPreview()}
        </div>
        {subtitle && (
          <div className="editor-canvas-caption">{subtitle}</div>
        )}
      </div>

      {/* === Presets built-in === */}
      {Array.isArray(presets) && presets.length > 0 && (
        <div className="editor-presets">
          <div className="editor-presets-header">
            <span className="editor-presets-title">Estilos predefinidos</span>
            {presetSubtitle && (
              <span className="editor-presets-sub">{presetSubtitle}</span>
            )}
          </div>
          <div className="editor-presets-row">
            {presets.map(p => (
              <button
                key={p.id}
                type="button"
                className={'editor-preset' + (activePresetId === p.id ? ' active' : '')}
                onClick={() => onPresetClick?.(p)}
                title={p.label}
                style={{ background: p.bg }}>
                <span className="editor-preset-aa">Aa</span>
                <span className="editor-preset-label">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* === Presets del usuario + botón Guardar === */}
      {(typeof onSaveCurrent === 'function' || (Array.isArray(userPresets) && userPresets.length > 0)) && (
        <div className="editor-presets">
          <div className="editor-presets-header">
            <span className="editor-presets-title">Mis presets</span>
            <span className="editor-presets-sub">
              {Array.isArray(userPresets) ? `${userPresets.length} guardados` : ''}
            </span>
          </div>
          <div className="editor-presets-row">
            {(userPresets || []).map(p => (
              <div key={p.id} className="editor-user-preset-wrap" title={p.label}>
                <button
                  type="button"
                  className={'editor-preset' + (activePresetId === p.id ? ' active' : '')}
                  onClick={() => onUserPresetClick?.(p)}
                  style={{ background: p.bg }}>
                  <span className="editor-preset-aa">Aa</span>
                  <span className="editor-preset-label">{p.label}</span>
                </button>
                {/* Acciones (rename + delete) — aparecen al hover */}
                <div className="editor-user-preset-actions">
                  <button
                    type="button"
                    className="editor-user-preset-act rename"
                    onClick={(e) => handleRename(e, p)}
                    title="Renombrar"
                    aria-label={`Renombrar ${p.label}`}>
                    ✎
                  </button>
                  <button
                    type="button"
                    className="editor-user-preset-act delete"
                    onClick={(e) => handleDelete(e, p)}
                    title="Eliminar"
                    aria-label={`Eliminar ${p.label}`}>
                    ×
                  </button>
                </div>
              </div>
            ))}
            {typeof onSaveCurrent === 'function' && (
              <button
                type="button"
                className="editor-preset editor-preset-add"
                onClick={handleSave}
                title="Guardar el estilo actual como preset"
                aria-label="Guardar estilo actual como preset">
                <span className="editor-preset-plus">＋</span>
                <span className="editor-preset-label">Guardar</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
