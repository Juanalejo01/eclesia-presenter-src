'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '../../lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="text-sm text-ink-3 hover:text-ink-1 px-4 h-10 rounded-lg
                 border border-copper-300/15 bg-bg-2 hover:bg-bg-3 transition-all
                 disabled:opacity-50"
    >
      {loading ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  )
}
