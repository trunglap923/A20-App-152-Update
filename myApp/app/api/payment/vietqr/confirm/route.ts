import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { order_code } = await req.json()

        const { data: tx } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('order_code', order_code)
            .eq('provider', 'vietqr')
            .single()

        if (!tx) {
            return NextResponse.json({ error: 'Không tìm thấy giao dịch' }, { status: 404 })
        }

        // MVP: fake confirm manual
        await supabase
            .from('payment_transactions')
            .update({
                status: 'completed',
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', tx.id)

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}