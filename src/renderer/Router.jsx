import { useEffect, useState } from 'react'
import App from './App.jsx'
import ProjectionView from './pages/ProjectionView.jsx'

function getRoute() {
  return (window.location.hash || '#/').split('?')[0]
}

export default function Router() {
  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const onChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  if (route.startsWith('#/projection')) return <ProjectionView />
  return <App />
}
