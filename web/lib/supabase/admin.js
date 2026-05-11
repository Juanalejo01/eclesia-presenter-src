// Cliente Supabase ADMIN — usa service_role key, salta RLS.
// SOLO usar en Route Handlers de API (server-side).
// NUNCA exponer en cliente. La key debe estar en .env como SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE) {
    throw new Error('SUPABASE_SERVICE_ROLE no está configurada')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
