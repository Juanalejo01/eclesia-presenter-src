import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav.jsx'
import ServiceScreen from './screens/ServiceScreen.jsx'
import BibleScreen from './screens/BibleScreen.jsx'
import SongsScreen from './screens/SongsScreen.jsx'
import MoreScreen from './screens/MoreScreen.jsx'

export default function App() {
  return (
    // Layout: contenido scrollable + bottom nav fija
    <div className="min-h-screen bg-bg-1 text-ink-1 flex flex-col font-ui">
      <main className="flex-1 overflow-y-auto pb-[calc(60px+env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/" element={<Navigate to="/service" replace />} />
          <Route path="/service" element={<ServiceScreen />} />
          <Route path="/bible"   element={<BibleScreen />} />
          <Route path="/songs"   element={<SongsScreen />} />
          <Route path="/more"    element={<MoreScreen />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
