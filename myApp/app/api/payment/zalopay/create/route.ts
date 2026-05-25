import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { createZaloOrder } from '@/lib/zalopay'

function generateAppTransId() {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')

    return `${yy}${mm}${dd}_${Date.now()}`
}

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const body = await req.json()

        const { plan_code, billing_cycle } = body as {
            plan_code?: string
            billing_cycle?: 'monthly' | 'yearly'
        }

        // 1. Validate input
        if (!plan_code || !billing_cycle) {
            return NextResponse.json(
                { error: 'Thiếu plan_code hoặc billing_cycle' },
                { status: 400 }
            )
        }

        if (!['monthly', 'yearly'].includes(billing_cycle)) {
            return NextResponse.json(
                { error: 'billing_cycle không hợp lệ' },
                { status: 400 }
            )
        }

        // 2. Get authenticated user
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 3. Get active plan by code
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

        // 4. Generate IDs
        const localOrderCode = `ORD-${Date.now()}`
        const appTransId = generateAppTransId()
        const now = new Date().toISOString()

        // 5. Insert local transaction first
        const { data: transaction, error: txError } = await supabase
            .from('payment_transactions')
            .insert({
                user_id: user.id,
                plan_id: plan.id,
                provider: 'zalopay',
                billing_cycle,
                order_code: localOrderCode, // internal order id
                provider_order_id: null, // set after ZaloPay success
                amount,
                currency: 'VND',
                status: 'pending',
                metadata: {
                    plan_code: plan.code,
                    plan_name: plan.name,
                    app_trans_id: appTransId,
                },
                created_at: now,
                updated_at: now,
            })
            .select()
            .single()

        if (txError || !transaction) {
            return NextResponse.json(
                { error: txError?.message || 'Không thể tạo transaction' },
                { status: 500 }
            )
        }

        console.log('[STEP_1] transaction inserted', transaction.id)

        // 6. Create ZaloPay order
        const zaloRes = await createZaloOrder({
            amount,
            orderCode: localOrderCode,
            description: `Thanh toán gói ${plan.name} (${billing_cycle})`,
            userId: user.id,
        })

        console.log('[STEP_2] ZALOPAY_RESPONSE', zaloRes)

        // 7. Handle ZaloPay failure
        if (!zaloRes || zaloRes.return_code !== 1) {
            await supabase
                .from('payment_transactions')
                .update({
                    status: 'failed',
                    metadata: {
                        ...transaction.metadata,
                        zalo_response: zaloRes,
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', transaction.id)

            return NextResponse.json(
                {
                    error: zaloRes?.return_message || 'Giao dịch thất bại',
                    debug: {
                        sub_return_code: zaloRes?.sub_return_code ?? null,
                        sub_return_message: zaloRes?.sub_return_message ?? null,
                    },
                },
                { status: 400 }
            )
        }

        // 8. Update transaction with provider response
        const { error: updateError } = await supabase
            .from('payment_transactions')
            .update({
                provider_order_id: zaloRes.order_token ?? null, // provider order id
                payment_url: zaloRes.order_url ?? null,
                qr_code: zaloRes.qr_code ?? null,
                metadata: {
                    ...transaction.metadata,
                    zalo_response: zaloRes,
                },
                updated_at: new Date().toISOString(),
            })
            .eq('id', transaction.id)

        if (updateError) {
            console.error('[STEP_3] UPDATE_TX_ERROR', updateError)

            return NextResponse.json(
                { error: 'Tạo đơn thành công nhưng không lưu được transaction' },
                { status: 500 }
            )
        }

        console.log('[STEP_3] transaction updated')

        // 9. Return payment URL
        return NextResponse.json({
            success: true,
            order_url: zaloRes.order_url,
            zp_trans_token: zaloRes.zp_trans_token ?? null,
            app_trans_id: appTransId,
            order_code: localOrderCode,
        })
    } catch (error) {
        console.error('[ZALOPAY_CREATE]', error)

        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        )
    }
}