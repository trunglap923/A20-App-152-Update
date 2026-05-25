import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function GET(req: Request) {
    try {
        /**
         * Optional: protect cron bằng secret
         */
        const authHeader = req.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const nowIso = new Date().toISOString()

        const { data, error } = await supabaseAdmin
            .from('payment_transactions')
            .update({
                status: 'expired',
                updated_at: nowIso,
            })
            .eq('status', 'pending')
            .lt('expired_at', nowIso)
            .select('id, provider, order_code')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            expired_count: data?.length || 0,
            expired_transactions: data || [],
        })
    } catch (error) {
        console.error('[CRON_EXPIRE_PAYMENTS]', error)

        return NextResponse.json(
            { error: 'Cron execution failed' },
            { status: 500 }
        )
    }
}