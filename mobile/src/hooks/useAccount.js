/**
 * useAccount.js (C1)
 *
 * Hook reactivo sobre el singleton account.js — mismo patrón que
 * useTransport/useT: useSyncExternalStore con snapshot inmutable
 * (account.js solo reemplaza la referencia cuando muta, así la
 * comparación === de React es estable entre renders sin cambios).
 *
 * Devuelve el snapshot completo:
 *   { status, email, user, plan, isPro, error }
 *
 * Las ACCIONES (requestCode, verifyCode, signOut, ...) se importan
 * directamente de services/account.js — son estables (no dependen del
 * render) y así los componentes no reciben funciones nuevas por render.
 */
import { useSyncExternalStore } from 'react'
import { account } from '../services/account.js'

export function useAccount() {
  return useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot)
}
