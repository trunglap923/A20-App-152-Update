import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type NotificationRow = {
  id: string
  title: string
  content: string
  channel: 'Email' | 'In-app Notification' | 'Push Notification'
  is_read: boolean
  created_at: string
}

function getServiceDb() {
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) return null
  return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

export async function GET() {
  try {
    const reqClient = await createServerClient()
    const {
      data: { user },
      error: userError,
    } = await reqClient.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbAny = (getServiceDb() ?? reqClient) as any
    const listed = await dbAny
      .from('user_notifications')
      .select('id, title, content, channel, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (listed.error) {
      return NextResponse.json({ error: listed.error.message, notifications: [], unreadCount: 0 }, { status: 500 })
    }

    const rows = (listed.data ?? []) as NotificationRow[]
    const unreadCount = rows.filter((row) => !row.is_read).length
    return NextResponse.json({
      notifications: rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        channel: row.channel,
        isRead: row.is_read,
        createdAt: row.created_at,
      })),
      unreadCount,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error', notifications: [], unreadCount: 0 }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const reqClient = await createServerClient()
    const {
      data: { user },
      error: userError,
    } = await reqClient.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = (await req.json()) as { id?: string; markAll?: boolean }
    const dbAny = (getServiceDb() ?? reqClient) as any

    if (payload.markAll) {
      const updated = await dbAny.from('user_notifications').update({ is_read: true }).eq('user_id', user.id)
      if (updated.error) {
        return NextResponse.json({ error: updated.error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (!payload.id) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const updated = await dbAny
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', payload.id)
      .eq('user_id', user.id)
    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
