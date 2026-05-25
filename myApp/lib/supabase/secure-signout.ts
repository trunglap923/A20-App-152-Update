import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuthEvent } from '@/lib/audit-log'

const SUPABASE_STORAGE_KEY_PATTERN = /^sb-.*-auth-token(?:\.\d+)?$/

function clearSupabaseBrowserStorage() {
  if (typeof window === 'undefined') return

  const localStorageKeys = Object.keys(window.localStorage)
  for (const key of localStorageKeys) {
    if (SUPABASE_STORAGE_KEY_PATTERN.test(key)) {
      window.localStorage.removeItem(key)
    }
  }

  const sessionStorageKeys = Object.keys(window.sessionStorage)
  for (const key of sessionStorageKeys) {
    if (SUPABASE_STORAGE_KEY_PATTERN.test(key)) {
      window.sessionStorage.removeItem(key)
    }
  }
}

function clearSupabaseCookies() {
  if (typeof document === 'undefined') return

  const cookies = document.cookie.split(';')
  for (const rawCookie of cookies) {
    const cookieName = rawCookie.split('=')[0]?.trim()
    if (!cookieName || !cookieName.startsWith('sb-')) continue

    document.cookie = `${cookieName}=; Max-Age=0; path=/; SameSite=Lax`
    document.cookie = `${cookieName}=; Max-Age=0; path=/; domain=${window.location.hostname}; SameSite=Lax`
  }
}

export async function secureSignOut(supabase: SupabaseClient) {
  let userEmail: string | undefined
  try {
    const { data } = await supabase.auth.getUser()
    userEmail = data?.user?.email ?? undefined
  } catch {
    // Ignore lookup errors and continue sign out.
  }

  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    await logAuthEvent({
      event: 'logout',
      email: userEmail,
      success: !error,
      errorCode: error?.message,
    })
  } finally {
    clearSupabaseBrowserStorage()
    clearSupabaseCookies()
  }
}
