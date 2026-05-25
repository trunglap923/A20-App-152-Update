import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { userId, title, content } = await req.json()

    if (!userId || !title || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('user_notifications').insert({
      user_id: userId,
      title: title,
      content: content,
      channel: 'In-app Notification',
      is_read: false,
      campaign_id: null
    })

    if (error) {
      // Ignore if table doesn't exist
      if (error.code === '42P01') {
        console.warn('user_notifications table does not exist')
        return NextResponse.json({ success: true })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[ADMIN_FEEDBACK_REPLY_API]', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
