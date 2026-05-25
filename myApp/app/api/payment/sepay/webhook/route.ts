import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'
import { grantCreditsAfterPayment } from '@/lib/credits/grantCreditsAfterPayment'

// Helper to parse order code from transfer content
function parseTransferContent(content: string) {
    // Regex for VQR-<digits>
    const regex = /(?:VQR|vqr)[\-\s]*(\d+)/
    const match = content.match(regex)

    if (match) {
        return { orderCode: `VQR-${match[1]}` }
    }

    return { orderCode: null }
}

export async function POST(req: Request) {
    try {
        const rawBody = await req.text()
        const authHeader = req.headers.get('authorization') || ''

        const secret = process.env.SEPAY_WEBHOOK_SECRET || ''

        // 1. Verify Authorization Header
        if (secret && authHeader !== `Apikey ${secret}`) {
            return NextResponse.json(
                { error: 'Invalid Authorization header' },
                { status: 401 }
            )
        }

        // 2. Parse payload
        let payload: any

        try {
            payload = JSON.parse(rawBody)
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON' },
                { status: 400 }
            )
        }

        // 3. Extract SePay fields
        // IMPORTANT: SePay uses transferAmount
        const amount = Number(
            payload.transferAmount ??
            payload.amountIn ??
            payload.amount ??
            0
        )

        const description = String(
            payload.transactionContent ??
            payload.description ??
            payload.content ??
            ''
        )

        const providerTransactionId = String(
            payload.referenceCode ??
            payload.referenceNumber ??
            payload.transaction_id ??
            payload.id ??
            ''
        )

        // Optional: Ignore outgoing transfers
        if (payload.transferType && payload.transferType !== 'in') {
            return NextResponse.json({
                success: true,
                return_code: 1,
                return_message: 'ignored'
            })
        }

        // 4. Parse transfer content to find order_code
        const { orderCode } = parseTransferContent(description)

        if (!orderCode) {
            // Log Unrecognized Webhook
            await supabaseAdmin.from('payment_webhooks').insert({
                provider: 'sepay',
                transaction_id: null,
                payload,
                signature: authHeader,
                status: 'ignored'
            })

            return NextResponse.json({
                success: true,
                return_code: 1,
                return_message: 'No valid order_code found in description'
            })
        }

        // 5. Find transaction
        const { data: tx, error: txError } = await supabaseAdmin
            .from('payment_transactions')
            .select('*')
            .eq('order_code', orderCode)
            .eq('provider', 'vietqr')
            .single()

        if (txError || !tx) {
            console.error('[SEPAY_TX_NOT_FOUND]', orderCode)

            await supabaseAdmin.from('payment_webhooks').insert({
                provider: 'sepay',
                transaction_id: null,
                payload,
                signature: authHeader,
                status: 'failed'
            })

            return NextResponse.json({
                return_code: 0,
                return_message: 'transaction not found'
            })
        }

        // 6. Idempotency Check
        if (tx.status === 'paid') {
            return NextResponse.json({
                success: true,
                return_code: 1,
                return_message: 'already processed'
            })
        }

        // 7. Verify Amount
        if (Number(tx.amount) !== amount) {
            console.error('[SEPAY_INVALID_AMOUNT]', {
                expected: tx.amount,
                received: amount
            })

            await supabaseAdmin.from('payment_webhooks').insert({
                provider: 'sepay',
                transaction_id: tx.id,
                payload,
                signature: authHeader,
                status: 'failed'
            })

            return NextResponse.json({
                return_code: 0,
                return_message: 'invalid amount'
            })
        }

        // 8. Save Webhook Log
        await supabaseAdmin.from('payment_webhooks').insert({
            provider: 'sepay',
            transaction_id: tx.id,
            payload,
            signature: authHeader,
            status: 'received'
        })

        const now = new Date()

        // 9. Update Transaction
        const { error: updateTxError } = await supabaseAdmin
            .from('payment_transactions')
            .update({
                status: 'paid',
                provider_transaction_id: providerTransactionId,
                paid_at: now.toISOString(),
                updated_at: now.toISOString(),
                metadata: {
                    ...(tx.metadata || {}),
                    sepay_callback: payload,
                },
            })
            .eq('id', tx.id)
            .eq('status', 'pending') // Atomic update

        if (updateTxError) {
            console.error('[SEPAY_UPDATE_TX_ERROR]', updateTxError)

            return NextResponse.json({
                return_code: 0,
                return_message: 'update transaction failed'
            })
        }

        // 10. Process Subscription
        const endsAt =
            tx.billing_cycle === 'yearly'
                ? new Date(
                    now.getTime() + 365 * 24 * 60 * 60 * 1000
                ).toISOString()
                : new Date(
                    now.getTime() + 30 * 24 * 60 * 60 * 1000
                ).toISOString()

        // Check existing active subscription
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('user_id', tx.user_id)
            .eq('status', 'active')
            .maybeSingle()

        if (existingSub) {
            const { error: updateSubError } = await supabaseAdmin
                .from('subscriptions')
                .update({
                    plan_id: tx.plan_id,
                    billing_cycle: tx.billing_cycle,
                    starts_at: now.toISOString(),
                    ends_at: endsAt,
                    payment_transaction_id: tx.id,
                    updated_at: now.toISOString(),
                    status: 'active',
                })
                .eq('id', existingSub.id)

            if (updateSubError) {
                console.error(
                    '[SEPAY_UPDATE_SUB_ERROR]',
                    updateSubError
                )
            }
        } else {
            const { error: createSubError } = await supabaseAdmin
                .from('subscriptions')
                .insert({
                    user_id: tx.user_id,
                    plan_id: tx.plan_id,
                    billing_cycle: tx.billing_cycle,
                    status: 'active',
                    starts_at: now.toISOString(),
                    ends_at: endsAt,
                    payment_transaction_id: tx.id,
                    auto_renew: false,
                })

            if (createSubError) {
                console.error(
                    '[SEPAY_CREATE_SUB_ERROR]',
                    createSubError
                )
            }
        }

        // 11. Grant credits to user wallet
        try {
            const planCode = tx.metadata?.plan_code || ''

            await grantCreditsAfterPayment({
                userId: tx.user_id,
                planCode,
                billingCycle: tx.billing_cycle,
                paymentReference: tx.order_code,
                provider: 'vietqr',
            })
        } catch (creditError) {
            // Log but don't fail the webhook — subscription is already active
            console.error('[SEPAY_GRANT_CREDITS_ERROR]', creditError)
        }

        // 12. Mark webhook as processed
        await supabaseAdmin
            .from('payment_webhooks')
            .update({ status: 'processed' })
            .eq('transaction_id', tx.id)

        console.log('[SEPAY_SUCCESS]', tx.id)

        return NextResponse.json({
            success: true,
            return_code: 1,
            return_message: 'success'
        })
    } catch (error: any) {
        console.error('[SEPAY_WEBHOOK_ERROR]', error)

        return NextResponse.json(
            {
                return_code: 0,
                return_message: 'internal server error'
            },
            { status: 500 }
        )
    }
}