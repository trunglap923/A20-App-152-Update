import { NextResponse } from 'next/server'
import CryptoJS from 'crypto-js'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'
import { grantCreditsAfterPayment } from '@/lib/credits/grantCreditsAfterPayment'

export async function POST(req: Request) {
    try {
        const supabase = supabaseAdmin

        const body = await req.json()

        console.log('[ZALOPAY_CALLBACK_BODY]', body)

        const { data, mac } = body

        /**
         * Verify MAC
         */
        const expectedMac = CryptoJS.HmacSHA256(
            data,
            process.env.ZALOPAY_KEY2!
        ).toString()

        if (expectedMac !== mac) {
            console.error('[ZALOPAY_INVALID_MAC]')

            return NextResponse.json({
                return_code: -1,
                return_message: 'invalid mac',
            })
        }

        /**
         * Parse callback payload
         */
        const parsed = JSON.parse(data)

        console.log('[ZALOPAY_PARSED]', parsed)

        const appTransId = parsed.app_trans_id
        const zpTransId = parsed.zp_trans_id
        const amount = parsed.amount

        /**
         * IMPORTANT
         * Nếu order_code DB của bạn lưu:
         * ZLP-xxxx
         *
         * còn app_trans_id dạng:
         * 250507_ZLP-xxxx
         *
         * thì phải split
         */
        const localOrderCode = appTransId.split('_')[1]

        console.log('[ORDER_CODE]', localOrderCode)

        /**
         * Find transaction
         */
        const { data: tx, error: txError } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('order_code', localOrderCode)
            .single()

        if (txError || !tx) {
            console.error('[TX_NOT_FOUND]', txError)

            return NextResponse.json({
                return_code: 0,
                return_message: 'transaction not found',
            })
        }

        /**
         * Idempotency
         * ZaloPay callback có thể retry nhiều lần
         */
        if (tx.status === 'paid') {
            console.log('[ALREADY_PROCESSED]', tx.id)

            return NextResponse.json({
                return_code: 1,
                return_message: 'already processed',
            })
        }

        /**
         * Verify amount
         */
        if (Number(tx.amount) !== Number(amount)) {
            console.error('[INVALID_AMOUNT]', {
                dbAmount: tx.amount,
                callbackAmount: amount,
            })

            return NextResponse.json({
                return_code: 0,
                return_message: 'invalid amount',
            })
        }

        /**
         * Save webhook log
         */
        await supabase
            .from('payment_webhooks')
            .insert({
                provider: 'zalopay',
                transaction_id: tx.id,
                payload: parsed,
                signature: mac,
                status: 'received',
            })

        /**
         * Update transaction
         */
        const { error: updateTxError } = await supabase
            .from('payment_transactions')
            .update({
                status: 'paid',
                provider_transaction_id: String(zpTransId),
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                metadata: {
                    ...(tx.metadata || {}),
                    zalopay_callback: parsed,
                },
            })
            .eq('id', tx.id)

        if (updateTxError) {
            console.error('[UPDATE_TX_ERROR]', updateTxError)

            return NextResponse.json({
                return_code: 0,
                return_message: 'update transaction failed',
            })
        }

        /**
         * Subscription period
         */
        const now = new Date()

        const endsAt =
            tx.billing_cycle === 'yearly'
                ? new Date(
                    now.getTime() + 365 * 24 * 60 * 60 * 1000
                ).toISOString()
                : new Date(
                    now.getTime() + 30 * 24 * 60 * 60 * 1000
                ).toISOString()

        /**
         * Check existing active subscription
         */
        const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', tx.user_id)
            .eq('status', 'active')
            .maybeSingle()

        if (existingSub) {
            /**
             * Update existing subscription
             */
            const { error: updateSubError } = await supabase
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
                    '[UPDATE_SUBSCRIPTION_ERROR]',
                    updateSubError
                )

                return NextResponse.json({
                    return_code: 0,
                    return_message: 'update subscription failed',
                })
            }
        } else {
            /**
             * Create new subscription
             */
            const { error: createSubError } = await supabase
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
                    '[CREATE_SUBSCRIPTION_ERROR]',
                    createSubError
                )

                return NextResponse.json({
                    return_code: 0,
                    return_message: 'create subscription failed',
                })
            }
        }

        /**
         * Grant credits to user wallet
         */
        try {
            const planCode = tx.metadata?.plan_code || ''

            await grantCreditsAfterPayment({
                userId: tx.user_id,
                planCode,
                billingCycle: tx.billing_cycle,
                paymentReference: tx.order_code,
                provider: 'zalopay',
            })
        } catch (creditError) {
            // Log but don't fail the webhook — subscription is already active
            console.error('[ZALOPAY_GRANT_CREDITS_ERROR]', creditError)
        }

        /**
         * Update webhook status
         */
        await supabase
            .from('payment_webhooks')
            .update({
                status: 'processed',
            })
            .eq('transaction_id', tx.id)

        console.log('[ZALOPAY_SUCCESS]', tx.id)

        return NextResponse.json({
            return_code: 1,
            return_message: 'success',
        })
    } catch (error) {
        console.error('[ZALOPAY_CALLBACK_ERROR]', error)

        return NextResponse.json({
            return_code: 0,
            return_message: 'internal server error',
        })
    }
}