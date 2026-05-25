import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()
        const { banned } = body as { banned: boolean }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: banned ? '876000h' : 'none', // ~100 năm hoặc unban
        })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: banned ? 'User đã bị khóa' : 'User đã được mở khóa',
        })
    } catch (error) {
        return NextResponse.json(
            { error: 'Không thể cập nhật trạng thái user' },
            { status: 500 }
        )
    }
}