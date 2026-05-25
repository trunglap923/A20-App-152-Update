import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const formData = await req.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json(
                { error: 'Không tìm thấy file' },
                { status: 400 }
            )
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
        const fileName = `${crypto.randomUUID()}.${ext}`
        const filePath = `${id}/${fileName}`

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadError } = await supabaseAdmin.storage
            .from('avatars')
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: true,
            })

        if (uploadError) {
            return NextResponse.json(
                { error: uploadError.message },
                { status: 500 }
            )
        }

        const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(filePath)

        return NextResponse.json({
            avatarUrl: data.publicUrl,
        })
    } catch (error) {
        return NextResponse.json(
            { error: 'Upload avatar thất bại' },
            { status: 500 }
        )
    }
}