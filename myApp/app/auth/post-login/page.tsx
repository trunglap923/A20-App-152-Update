'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { logAuthEvent } from '@/lib/audit-log'
import {
  getProfileRoleByUserIdWithRetry,
  resolvePathAfterAuth,
} from '@/lib/supabase/user'

async function getAuthenticatedUser(
  supabase: ReturnType<typeof createClient>
) {
  for (let i = 0; i < 8; i++) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) return user
    await new Promise((r) => setTimeout(r, 75))
  }
  return null
}

/**
 * Bước trung gian sau khi session được tạo trên client: không thuộc route cần login,
 * nên proxy không đẩy về /login khi cookie chưa kịp gửi kèm request đầu tiên tới /admin.
 * Trang này chạy trên client, đợi session + đọc role (có retry) rồi replace sang đích.
 */
function PostLoginRedirect() {
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const supabase = createClient()
      const user = await getAuthenticatedUser(supabase)

      if (cancelled) return

      if (!user) {
        window.location.replace('/login')
        return
      }

      // Log successful OAuth login
      await logAuthEvent({
        event: 'login',
        email: user.email,
        success: true,
      })

      const role = await getProfileRoleByUserIdWithRetry(user.id)
      const next = resolvePathAfterAuth(role, redirectParam, user.email)

      if (cancelled) return
      window.location.replace(next)
    }

    run().catch((e: unknown) => {
      if (!cancelled) {
        console.error('[post-login]', e)
        setError('Không thể chuyển trang. Thử tải lại hoặc đăng nhập lại.')
      }
    })

    return () => {
      cancelled = true
    }
  }, [redirectParam])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-destructive">{error}</p>
        <a href="/login" className="text-sm text-primary underline">
          Về đăng nhập
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function PostLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PostLoginRedirect />
    </Suspense>
  )
}
