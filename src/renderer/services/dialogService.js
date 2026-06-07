// dialogService.js
// ─────────────────────────────────────────────────────────────────────────────
// Singleton reactivo para reemplazar window.confirm / alert / prompt nativos.
// API pública: confirm(opts), alert(opts), prompt(opts) → todos devuelven Promise.
//
// El componente <AppDialog/> se monta UNA vez en App.jsx, se suscribe vía
// useDialog() y renderiza el modal cuando _current !== null. Solo un dialog
// a la vez: si llega uno nuevo mientras hay otro abierto, el anterior se
// resuelve como cancelado (false / null) antes de abrir el nuevo.
//
// No hay provider/context: el store es un singleton de módulo. Suficiente
// para nuestra app y evita ceremonia innecesaria.

import { useEffect, useState } from 'react'

let _current = null
let _idCounter = 0
const _listeners = new Set()

function emit() {
  for (const fn of _listeners) {
    try { fn(_current) } catch {}
  }
}

export function subscribe(fn) {
  _listeners.add(fn)
  // Emit inicial para que el suscriptor reciba el estado actual sin esperar
  // al próximo cambio.
  try { fn(_current) } catch {}
  return () => { _listeners.delete(fn) }
}

// Hook React reactivo. Cualquier componente que lo use se re-renderiza cuando
// cambia el dialog activo.
export function useDialog() {
  const [s, setS] = useState(_current)
  useEffect(() => subscribe(setS), [])
  return s
}

// Resuelve la promesa del dialog actual con `value` y limpia el state para
// desmontar el modal. Llamado desde el componente cuando el usuario acepta,
// cancela, pulsa Esc o hace click en el backdrop.
export function resolveDialog(value) {
  if (!_current) return
  const { resolve } = _current
  _current = null
  emit()
  try { resolve(value) } catch {}
}

// Política: solo un modal a la vez. Si ya hay uno abierto, lo resolvemos como
// cancelado antes de mostrar el nuevo.
function open(spec) {
  return new Promise((resolve) => {
    if (_current) {
      const prev = _current
      _current = null
      try { prev.resolve(prev.type === 'prompt' ? null : false) } catch {}
    }
    _current = { id: ++_idCounter, resolve, ...spec }
    emit()
  })
}

// API pública. Forma de retorno:
//   confirm  → Promise<boolean>          (true=aceptar, false=cancelar/Esc/backdrop)
//   alert    → Promise<true>             (siempre true cuando el usuario cierra)
//   prompt   → Promise<string | null>    (null=cancelar/Esc/vacío)

export function confirm(opts = {}) {
  // opts: { title, message, detail, confirmLabel='Aceptar',
  //         cancelLabel='Cancelar', variant='default'|'danger'|'info' }
  const variant = ['default', 'danger', 'info'].includes(opts.variant) ? opts.variant : 'default'
  return open({
    type: 'confirm',
    title: opts.title || '¿Confirmar?',
    message: opts.message || '',
    detail: opts.detail || null,
    confirmLabel: opts.confirmLabel || 'Aceptar',
    cancelLabel: opts.cancelLabel || 'Cancelar',
    variant,
  })
}

export function alert(opts = {}) {
  // opts: { title, message, detail, okLabel='Entendido', variant='info'|'danger' }
  const variant = ['default', 'danger', 'info'].includes(opts.variant) ? opts.variant : 'info'
  return open({
    type: 'alert',
    title: opts.title || 'Aviso',
    message: opts.message || '',
    detail: opts.detail || null,
    confirmLabel: opts.okLabel || 'Entendido',
    cancelLabel: null,
    variant,
  })
}

export function prompt(opts = {}) {
  // opts: { title, message, defaultValue='', placeholder='', maxLength=200,
  //         confirmLabel='Aceptar', cancelLabel='Cancelar' }
  return open({
    type: 'prompt',
    title: opts.title || 'Introduce un valor',
    message: opts.message || '',
    detail: opts.detail || null,
    defaultValue: opts.defaultValue || '',
    placeholder: opts.placeholder || '',
    maxLength: opts.maxLength || 200,
    confirmLabel: opts.confirmLabel || 'Aceptar',
    cancelLabel: opts.cancelLabel || 'Cancelar',
    variant: 'default',
  })
}
