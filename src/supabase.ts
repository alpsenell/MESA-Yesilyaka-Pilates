import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the Supabase environment variables are present. */
export const isConfigured = Boolean(url && anonKey)

// A single shared client. When env vars are missing we still export a client
// built from empty strings so imports don't crash; callers gate on
// `isConfigured` and show a setup screen instead of making requests.
export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
