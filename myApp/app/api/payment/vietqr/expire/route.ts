import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function POST() {
    try {
        const supabase = supabaseAdmin

        const expiredBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()

        const { data, error } = await supabase
            .from('payment_transactions')
            .update({
                status: 'expired',
                updated_at: new Date().toISOString(),
            })
            .eq('provider', 'vietqr')
            .eq('status', 'pending')
            .lt('created_at', expiredBefore)
            .select('id, order_code')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            expired_count: data.length,
            expired_orders: data,
        })
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}