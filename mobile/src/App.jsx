import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav.jsx'
import ServiceScreen from './screens/ServiceScreen.jsx'
import BibleScreen from './screens/BibleScreen.jsx'
import SongsScreen from './screens/SongsScreen.jsx'
import MoreScreen from './screens/MoreScreen.jsx'
import PairScreen from './screens/PairScreen.jsx'
import { useBootstrap } from './hooks/useBootstrap.js'
import { useT } from './hooks/useT.js'

/**
 * Bootstrap del App:
 *   1. useBootstrap → transport.restore() + initLocale() async (T13)
 *   2. Mientras no esté listo → splash (t('app.loading'); pre-hidratación
 *      muestra el default ES, idéntico al comportamiento previo)
 *   3. Una vez listo: si hay creds → /service, si no → /pair
 *   4. BottomNav solo aparece cuando hay creds (en pairing, fuera del flow)
 */
export default function App() {
  const { t } = useT()
  const { ready, hasCredentials } = useBootstrap()

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
          (hasCredentials
            ? 'pb-[calc(60px+env(safe-area-inset-bottom))]'
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
          <Route path="/more"    element={<MoreScreen />} />
        </Routes>
      </main>
      {hasCredentials && <BottomNav />}
    </div>
  )
}
