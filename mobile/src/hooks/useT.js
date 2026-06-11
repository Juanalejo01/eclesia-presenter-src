/**
 * useT.js (T13)
 *
 * Hook reactivo de i18n. Mismo patron que useTransport.js:
 * useSyncExternalStore con el string del locale como snapshot (primitivo
 * → comparacion === estable). setLocale notifica a los listeners y React
 * re-renderiza cada componente que llama useT() en el mismo commit — sin
 * remount, sin reload.
 *
 * Devuelve { t, lang, setLang }:
 *   t       — traduce keys ('more.title') con interpolacion {var}.
 *   lang    — locale activo ('es' | 'en' | 'pt'); util para aria-checked
 *             del LanguageSwitcher.
 *   setLang — alias de setLocale (persiste la eleccion del usuario).
 *
 * Para codigo no-componente (handlers fuera de React, servicios) importa
 * `t` directamente de services/i18n.js.
 */
import { useSyncExternalStore } from 'react'
import { t, getLocale, setLocale, subscribeLocale } from '../services/i18n.js'

export function useT() {
  const lang = useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  return { t, lang, setLang: setLocale }
}
