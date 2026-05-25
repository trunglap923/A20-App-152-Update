import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(req: Request) {
    try {
        const supabase = await createClient()

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const orderCode = searchParams.get('order_code')

        if (!orderCode) {
            return NextResponse.json(
                { error: 'Missing order_code' },
                { status: 400 }
            )
        }

        const { data: tx, error: txError } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('order_code', orderCode)
            .eq('user_id', user.id) // ONLY owner
            .single()

        if (txError || !tx) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            status: tx.status,
            paid_at: tx.paid_at,
        })
    } catch (error) {
        console.error('[PAYMENT_STATUS]', error)

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
