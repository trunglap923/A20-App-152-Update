import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Fetch all feedback
    const { data: feedbacks, error: fbError } = await supabaseAdmin
      .from('user_feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (fbError) {
      // Bỏ qua lỗi nếu bảng chưa tồn tại (trường hợp user chưa tạo)
      if (fbError.code === '42P01') {
        return NextResponse.json([])
      }
      throw fbError
    }

    // Fetch all users to map emails
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers()

    if (usersError) throw usersError

    // Map users to feedback
    const result = feedbacks.map(fb => {
      const user = users.find(u => u.id === fb.user_id)
      return {
        ...fb,
        userEmail: user?.email || 'Khách (Chưa đăng nhập)',
        userName: user?.user_metadata?.full_name || user?.user_metadata?.name || 'Unknown'
      }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[ADMIN_FEEDBACK_API]', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status } = await req.json()

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('user_feedback')
      .update({ status })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[ADMIN_FEEDBACK_PATCH]', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
