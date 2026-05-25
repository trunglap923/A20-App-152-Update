import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const body = await req.json()

        const { plan_code, billing_cycle } = body as {
            plan_code?: string
            billing_cycle?: 'monthly' | 'yearly'
        }

        if (!plan_code || !billing_cycle) {
            return NextResponse.json(
                { error: 'Thiếu plan_code hoặc billing_cycle' },
                { status: 400 }
            )
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('*')
            .eq('code', plan_code)
            .eq('is_active', true)
            .single()

        if (planError || !plan) {
            return NextResponse.json(
                { error: 'Plan không tồn tại' },
                { status: 404 }
            )
        }

        const amount =
            billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly

        if (!amount || amount <= 0) {
            return NextResponse.json(
                { error: 'Giá gói không hợp lệ' },
                { status: 400 }
            )
        }

        const now = new Date()
        const nowIso = now.toISOString()

        // Expire old pending transactions
        await supabase
            .from('payment_transactions')
            .update({
                status: 'expired',
                updated_at: nowIso,
            })
            .eq('user_id', user.id)
            .eq('provider', 'vietqr')
            .eq('status', 'pending')
            .lt('expired_at', nowIso)

        // 1. Check pending transaction còn hạn
        const { data: existingTx } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('plan_id', plan.id)
            .eq('provider', 'vietqr')
            .eq('billing_cycle', billing_cycle)
            .eq('status', 'pending')
            .gt('expired_at', nowIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        // 2. Reuse transaction cũ
        if (existingTx) {
            return NextResponse.json({
                success: true,
                reused: true,
                order_code: existingTx.order_code,
                amount: existingTx.amount,
                qr_url: existingTx.qr_code,
                expired_at: existingTx.expired_at,
            })
        }

        // 3. Tạo transaction mới
        const orderCode = `VQR-${Date.now()}`
        const expiredAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

        const bankCode = process.env.NEXT_PUBLIC_BANK_CODE || 'TCB'
        const bankAccount = process.env.NEXT_PUBLIC_BANK_ACCOUNT || '123456789'
        
        // Template: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>
        const qrUrl = `https://img.vietqr.io/image/${bankCode}-${bankAccount}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(orderCode)}`

        const { data: transaction, error: insertError } = await supabase
            .from('payment_transactions')
            .insert({
                user_id: user.id,
                plan_id: plan.id,
                provider: 'vietqr',
                billing_cycle,
                order_code: orderCode,
                provider_order_id: null,
                amount,
                currency: 'VND',
                status: 'pending',
                qr_code: qrUrl,
                expired_at: expiredAt,
                metadata: { plan_code: plan.code },
                created_at: nowIso,
                updated_at: nowIso,
            })
            .select()
            .single()

        if (insertError || !transaction) {
            return NextResponse.json(
                { error: insertError?.message || 'Không thể tạo transaction' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            reused: false,
            order_code: transaction.order_code,
            amount: transaction.amount,
            qr_url: transaction.qr_code,
            expired_at: transaction.expired_at,
        })
    } catch (error: any) {
        console.error('[VIETQR_CREATE]', error)

        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}