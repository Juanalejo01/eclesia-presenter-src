/**
 * LanguageSwitcher (T13)
 *
 * Control segmentado de 3 opciones [Español | English | Português] para
 * la seccion Ajustes de MoreScreen (reemplaza el placeholder
 * 'Proximamente' de T11). Labels SIEMPRE en su idioma nativo —
 * 'Português', no 'Portuguese' — para que quien busca su idioma lo
 * reconozca aunque la UI este en otro.
 *
 * a11y: role=radiogroup + role=radio con aria-checked. Tap height >=44px.
 * Cambio instantaneo: setLang notifica a todos los useT() montados (sin
 * remount) y persiste via Preferences + espejo localStorage.
 */
import { AVAILABLE_LOCALES } from '../services/i18n.js'
import { useT } from '../hooks/useT.js'
import { tapLight } from '../services/haptics.js'

export default function LanguageSwitcher() {
  const { t, lang, setLang } = useT()

  function handlePick(id) {
    tapLight()
    setLang(id)
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-ink-2">{t('more.language')}</span>
      <div
        role="radiogroup"
        aria-label={t('more.languageAria')}
        className="flex bg-bg-3 rounded-lg p-1 gap-1"
      >
        {AVAILABLE_LOCALES.map((loc) => (
          <button
            key={loc.id}
            type="button"
            role="radio"
            aria-checked={loc.id === lang}
            onClick={() => handlePick(loc.id)}
            className={
              'min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors ' +
              (loc.id === lang
                ? 'bg-copper-300 text-bg-1'
                : 'text-ink-3 hover:text-ink-2 hover:bg-white/5')
            }
          >
            {loc.label}
          </button>
        ))}
      </div>
    </div>
  )
}
