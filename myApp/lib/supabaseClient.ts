import { createBrowserClient } from '@supabase/ssr'

let supabaseClientSingleton: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!supabaseClientSingleton) {
    supabaseClientSingleton = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    )
  }
  return supabaseClientSingleton
}
