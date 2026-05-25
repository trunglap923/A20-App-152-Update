import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        const { fullName, phoneNumber, birthDate, avatarUrl } = body

        const { error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .upsert({
                id,
                phone_number: phoneNumber || null,
                birth_date: birthDate || null,
                updated_at: new Date().toISOString(),
            })

        if (profileError) {
            return NextResponse.json({ error: profileError.message }, { status: 400 })
        }

        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
            id,
            {
                user_metadata: {
                    full_name: fullName,
                    avatar_url: avatarUrl,
                },
            }
        )

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 400 })
        }

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json(
            { error: 'Không thể cập nhật người dùng' },
            { status: 500 }
        )
    }
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const { data: authUser, error: authError } =
            await supabaseAdmin.auth.admin.getUserById(id)

        if (authError || !authUser.user) {
            return NextResponse.json(
                { error: authError?.message || 'Không tìm thấy user' },
                { status: 404 }
            )
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .select('phone_number, birth_date')
            .eq('id', id)
            .maybeSingle()

        if (profileError) {
            return NextResponse.json({ error: profileError.message }, { status: 400 })
        }

        const user = authUser.user

        return NextResponse.json({
            id: user.id,
            fullName:
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                'Người dùng',
            email: user.email || '',
            avatarUrl: user.user_metadata?.avatar_url || '',
            phoneNumber: profile?.phone_number || '',
            birthDate: profile?.birth_date || '',
        })
    } catch {
        return NextResponse.json(
            { error: 'Không thể tải thông tin người dùng' },
            { status: 500 }
        )
    }
}