import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav.jsx'
import ServiceScreen from './screens/ServiceScreen.jsx'
import BibleScreen from './screens/BibleScreen.jsx'
import SongsScreen from './screens/SongsScreen.jsx'
import SongEditorScreen from './screens/SongEditorScreen.jsx'
import MoreScreen from './screens/MoreScreen.jsx'
import AccountScreen from './screens/AccountScreen.jsx'
import PairScreen from './screens/PairScreen.jsx'
import { useBootstrap } from './hooks/useBootstrap.js'
import { useT } from './hooks/useT.js'

/**
 * Bootstrap del App:
 *   1. useBootstrap → transport.restore() + initLocale() async (T13)
 *   2. Mientras no esté listo → splash (t('app.loading'); pre-hidratación
 *      muestra el default ES, idéntico al comportamiento previo)
 *   3. Una vez listo: si hay creds → /service, si no → /pair
 *   4. BottomNav aparece en toda ruta salvo /pair. OJO: la visibilidad
 *      se deriva de la RUTA, no de hasCredentials — ese flag es un
 *      snapshot one-shot del boot y se quedaba obsoleto: si arrancabas
 *      sin creds y emparejabas, la barra no aparecía hasta reiniciar
 *      la app (bug reportado en v0.2.0).
 */
export default function App() {
  const { t } = useT()
  const { ready, hasCredentials } = useBootstrap()
  const { pathname } = useLocation()
  const showNav = pathname !== '/pair'

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg-1 text-ink-3 font-ui">
        {t('app.loading')}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-1 text-ink-1 flex flex-col font-ui">
      <main
        className={
          'flex-1 overflow-y-auto ' +
          (showNav
            ? 'pb-[calc(62px+env(safe-area-inset-bottom))]'
            : '')
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={hasCredentials ? '/service' : '/pair'} replace />
            }
          />
          <Route path="/pair"    element={<PairScreen />} />
          <Route path="/service" element={<ServiceScreen />} />
          <Route path="/bible"   element={<BibleScreen />} />
          <Route path="/songs"   element={<SongsScreen />} />
          {/* Editor cloud (C2) — subrutas de /songs: el tab Canciones del
              BottomNav sigue activo gracias al startsWith('/songs'). */}
          <Route path="/songs/cloud/new" element={<SongEditorScreen />} />
          <Route path="/songs/cloud/:id" element={<SongEditorScreen />} />
          <Route path="/more"    element={<MoreScreen />} />
          <Route path="/account" element={<AccountScreen />} />
        </Routes>
      </main>
      {showNav && <BottomNav />}
    </div>
  )
}
