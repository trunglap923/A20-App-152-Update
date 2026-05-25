import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

function adminEmailList(): string[] {
  const raw =
    process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function isAdminUser(email: string | undefined): boolean {
  if (!email) return false
  return adminEmailList().includes(email.trim().toLowerCase())
}

async function isAdminByProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[proxy] user_profiles:', error.message)
    return false
  }
  return data?.role?.toLowerCase() === 'admin'
}

/** Next.js 16+ dùng `proxy.ts` (edge) — không dùng `middleware.ts` để tránh lỗi parse / 500. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('[proxy] Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAuthPage =
    path.startsWith('/login') ||
    path.startsWith('/register') ||
    path.startsWith('/forgot-password')

  if (isAuthPage && user) {
    const isAdmin =
      isAdminUser(user.email) || (await isAdminByProfile(supabase, user.id))
    const dest = isAdmin ? '/admin' : '/'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  const needsLogin =
    path.startsWith('/dashboard') ||
    path.startsWith('/profile') ||
    path.startsWith('/settings') ||
    path.startsWith('/admin')

  if (!user && needsLogin) {
    const login = new URL('/login', request.url)
    login.searchParams.set('redirect', path)
    return NextResponse.redirect(login)
  }

  if (path.startsWith('/admin') && user) {
    const allowed =
      isAdminUser(user.email) || (await isAdminByProfile(supabase, user.id))
    if (!allowed) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/payment/webhook/|api/webhook/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
