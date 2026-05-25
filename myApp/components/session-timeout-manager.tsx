'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabaseClient'
import { secureSignOut } from '@/lib/supabase/secure-signout'
import { uploadActivityRef } from '@/lib/upload-activity'

const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000
const CHECK_INTERVAL_MS = 60 * 1000
const STORAGE_KEY = 'nexus:last-activity-at'

export function SessionTimeoutManager() {
  useEffect(() => {
    const supabase = createClient()
    let intervalId: ReturnType<typeof setInterval> | null = null
    let isTracking = false
    let timingOut = false

    const updateLastActivity = () => {
      sessionStorage.setItem(STORAGE_KEY, Date.now().toString())
    }

    const clearTracking = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      window.removeEventListener('mousemove', updateLastActivity)
      window.removeEventListener('keydown', updateLastActivity)
      window.removeEventListener('click', updateLastActivity)
      window.removeEventListener('scroll', updateLastActivity)
      window.removeEventListener('touchstart', updateLastActivity)
      isTracking = false
    }

    const handleTimeout = async () => {
      if (uploadActivityRef.current) return
      if (timingOut) return
      timingOut = true
      clearTracking()
      sessionStorage.removeItem(STORAGE_KEY)
      await secureSignOut(supabase)

      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?reason=timeout'
      }
    }

    const checkTimeout = async () => {
      if (uploadActivityRef.current) return
      const lastActivityAt = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0)
      if (!lastActivityAt) return

      if (Date.now() - lastActivityAt >= INACTIVITY_LIMIT_MS) {
        await handleTimeout()
      }
    }

    const startTracking = () => {
      if (isTracking) return

      updateLastActivity()
      window.addEventListener('mousemove', updateLastActivity)
      window.addEventListener('keydown', updateLastActivity)
      window.addEventListener('click', updateLastActivity)
      window.addEventListener('scroll', updateLastActivity)
      window.addEventListener('touchstart', updateLastActivity)
      intervalId = setInterval(() => {
        void checkTimeout()
      }, CHECK_INTERVAL_MS)
      isTracking = true
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        startTracking()
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        startTracking()
      } else {
        clearTracking()
        sessionStorage.removeItem(STORAGE_KEY)
      }
    })

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkTimeout()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearTracking()
      authListener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return null
}
