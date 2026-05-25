import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'
import { activateSubscription } from '@/lib/payments/activateSubscription'

export async function POST(req: NextRequest) {
    console.log('[MOMO_WEBHOOK_HIT]')

    try {
        const rawBody = await req.text()
        console.log('[MOMO_WEBHOOK_RAW_BODY]', rawBody)

        let body: Record<string, unknown>
        try {
            body = JSON.parse(rawBody)
        } catch {
            console.error('[MOMO_WEBHOOK_PARSE_ERROR] Body is not valid JSON')
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        console.log('[MOMO_WEBHOOK_BODY]', JSON.stringify(body, null, 2))

        const {
            partnerCode,
            orderId,
            requestId,
            amount,
            orderInfo,
            orderType,
            transId,
            resultCode,
            message,
            payType,
            responseTime,
            extraData,
            signature,
        } = body as Record<string, string | number>

        // Validation cơ bản
        if (!orderId || !requestId || !signature) {
            console.error('[MOMO_WEBHOOK_MISSING_FIELDS]', { orderId, requestId, signature })
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const accessKey = process.env.MOMO_ACCESS_KEY!
        const secretKey = process.env.MOMO_SECRET_KEY!

        if (!accessKey || !secretKey) {
            console.error('[MOMO_WEBHOOK_MISSING_ENV]')
            return NextResponse.json({ error: 'Server config error' }, { status: 500 })
        }

        // ====================== SIGNATURE VERIFICATION ======================
        const rawSignature =
            `accessKey=${accessKey}` +
            `&amount=${amount}` +
            `&extraData=${extraData ?? ''}` +
            `&orderId=${orderId}` +
            `&orderInfo=${orderInfo}` +
            `&orderType=${orderType}` +
            `&partnerCode=${partnerCode}` +
            `&payType=${payType}` +
            `&requestId=${requestId}` +
            `&responseTime=${responseTime}` +
            `&resultCode=${resultCode}` +
            `&transId=${transId}`

        const expectedSignature = crypto
            .createHmac('sha256', secretKey)
            .update(rawSignature)
            .digest('hex')

        if (expectedSignature !== signature) {
            console.error('[MOMO_INVALID_SIGNATURE]', {
                received: signature,
                expected: expectedSignature,
                orderId,
            })
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
        }

        console.log('[MOMO_SIGNATURE_OK]', { orderId, resultCode })

        // ====================== FIND TRANSACTION ======================
        const { data: transaction, error: txError } = await supabaseAdmin
            .from('payment_transactions')
            .select('*')
            .eq('provider_order_id', orderId)
            .single()

        if (txError || !transaction) {
            console.error('[MOMO_TRANSACTION_NOT_FOUND]', { orderId })
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }

        // Verify amount
        if (Number(amount) !== Number(transaction.amount)) {
            console.error('[MOMO_AMOUNT_MISMATCH]', {
                expected: transaction.amount,
                received: amount,
            })
            return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
        }

        // Idempotency
        if (transaction.status === 'paid') {
            return new NextResponse(null, { status: 204 })
        }

        const nowIso = new Date().toISOString()

        // Log webhook
        await supabaseAdmin
            .from('payment_webhooks')
            .insert({
                provider: 'momo',
                transaction_id: transaction.id,
                event_type: Number(resultCode) === 0 ? 'payment.success' : 'payment.failed',
                payload: body,
                signature,
                created_at: nowIso,
            })
            .then(({ error }) => {
                if (error) console.error('[MOMO_WEBHOOK_LOG_ERROR]', error.message)
            })

        const callbackMeta = {
            ...(transaction.metadata || {}),
            momo_ipn: body,
        }

        // ====================== SUCCESS CASE ======================
        if (Number(resultCode) === 0) {
            try {
                await activateSubscription({
                    userId: transaction.user_id,
                    planId: transaction.plan_id,
                    billingCycle: transaction.billing_cycle,
                    transactionId: transaction.id,
                })

                // Mark paid chỉ khi activate thành công
                await supabaseAdmin
                    .from('payment_transactions')
                    .update({
                        status: 'paid',
                        paid_at: nowIso,
                        metadata: callbackMeta,
                        updated_at: nowIso,
                    })
                    .eq('id', transaction.id)

                console.log('[MOMO_PAYMENT_SUCCESS]', { orderId, transId })
            } catch (subError) {
                console.error('[MOMO_ACTIVATE_SUB_ERROR]', subError)

                // Vẫn mark paid nhưng ghi lỗi để debug
                await supabaseAdmin
                    .from('payment_transactions')
                    .update({
                        status: 'paid',
                        paid_at: nowIso,
                        metadata: {
                            ...callbackMeta,
                            activation_error: subError instanceof Error ? subError.message : String(subError),
                        },
                        updated_at: nowIso,
                    })
                    .eq('id', transaction.id)
            }

            return new NextResponse(null, { status: 204 })
        }

        // ====================== FAILED CASE ======================
        await supabaseAdmin
            .from('payment_transactions')
            .update({
                status: 'failed',
                metadata: callbackMeta,
                updated_at: nowIso,
            })
            .eq('id', transaction.id)

        console.log('[MOMO_PAYMENT_FAILED]', { orderId, resultCode, message })

        return new NextResponse(null, { status: 204 })
    } catch (error) {
        console.error('[MOMO_WEBHOOK_ERROR]', error)
        return new NextResponse(null, { status: 204 }) // Vẫn trả 204 để MoMo không retry liên tục
    }
}