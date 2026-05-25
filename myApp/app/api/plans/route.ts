import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET() {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .eq('is_active', true)
            .order('price_monthly', { ascending: true })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ plans: data })
    } catch (error) {
        return NextResponse.json(
            { error: 'Không thể tải danh sách gói' },
            { status: 500 }
        )
    }
}