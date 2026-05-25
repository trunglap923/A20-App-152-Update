import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { plan_code, billing_cycle } = body

        console.log('[MOMO_CREATE_BODY]', body)

        if (!plan_code || !billing_cycle) {
            return NextResponse.json(
                { error: 'Missing plan_code or billing_cycle' },
                { status: 400 }
            )
        }

        if (!['monthly', 'yearly'].includes(billing_cycle)) {
            return NextResponse.json(
                { error: 'Invalid billing_cycle' },
                { status: 400 }
            )
        }

        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        console.log('[MOMO_CREATE_USER]', {
            userId: user?.id,
            email: user?.email,
        })

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: plan, error: planError } = await supabaseAdmin
            .from('plans')
            .select('*')
            .eq('code', plan_code)
            .eq('is_active', true)
            .single()

        console.log('[MOMO_CREATE_PLAN]', {
            plan,
            planError,
        })

        if (planError || !plan) {
            return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
        }

        const amount =
            billing_cycle === 'yearly'
                ? Number(plan.price_yearly)
                : Number(plan.price_monthly)

        console.log('[MOMO_CREATE_AMOUNT]', { amount, billing_cycle })

        if (!amount || amount <= 0) {
            return NextResponse.json(
                { error: 'Invalid plan amount' },
                { status: 400 }
            )
        }

        const partnerCode = process.env.MOMO_PARTNER_CODE!
        const accessKey = process.env.MOMO_ACCESS_KEY!
        const secretKey = process.env.MOMO_SECRET_KEY!
        const redirectUrl = process.env.MOMO_REDIRECT_URL!
        const ipnUrl = process.env.MOMO_IPN_URL!
        const endpoint = process.env.MOMO_ENDPOINT!

        console.log('[MOMO_CREATE_ENV]', {
            redirectUrl,
            ipnUrl,
            endpoint,
            partnerCode,
            hasAccessKey: !!accessKey,
            hasSecretKey: !!secretKey,
        })

        if (!redirectUrl || !ipnUrl) {
            return NextResponse.json(
                { error: 'Missing MOMO_REDIRECT_URL or MOMO_IPN_URL' },
                { status: 500 }
            )
        }

        const now = new Date()
        const nowIso = now.toISOString()
        const expiredAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()

        const { data: existingTx } = await supabaseAdmin
            .from('payment_transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('provider', 'momo')
            .eq('plan_id', plan.id)
            .eq('billing_cycle', billing_cycle)
            .eq('status', 'pending')
            .gt('expired_at', nowIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        console.log('[MOMO_CREATE_EXISTING_TX]', existingTx)

        if (existingTx?.payment_url) {
            console.log('[MOMO_CREATE_REUSE_PENDING]', {
                transactionId: existingTx.id,
                paymentUrl: existingTx.payment_url,
            })

            return NextResponse.json({
                payUrl: existingTx.payment_url,
                reused: true,
            })
        }

        const { error: expirePendingError } = await supabaseAdmin
            .from('payment_transactions')
            .update({
                status: 'expired',
                updated_at: nowIso,
            })
            .eq('user_id', user.id)
            .eq('provider', 'momo')
            .eq('status', 'pending')
            .lt('expired_at', nowIso)

        if (expirePendingError) {
            console.warn('[MOMO_CREATE_EXPIRE_PENDING_ERROR]', expirePendingError)
        }

        const providerOrderId = `${partnerCode}${Date.now()}`
        const requestId = providerOrderId
        const orderCode = `NEXUS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        const orderInfo = `Nâng cấp gói ${plan.name} ${billing_cycle}`

        console.log('[MOMO_CREATE_ORDER]', {
            providerOrderId,
            requestId,
            orderCode,
            orderInfo,
        })

        const { error: insertError } = await supabaseAdmin
            .from('payment_transactions')
            .insert({
                user_id: user.id,
                plan_id: plan.id,
                provider: 'momo',
                billing_cycle,
                order_code: orderCode,
                provider_order_id: providerOrderId,
                amount,
                currency: 'VND',
                status: 'pending',
                expired_at: expiredAt,
                metadata: {
                    plan_code: plan.code,
                    plan_name: plan.name,
                },
                created_at: nowIso,
                updated_at: nowIso,
            })

        if (insertError) {
            console.error('[MOMO_CREATE_INSERT_TX_ERROR]', insertError)

            return NextResponse.json(
                { error: insertError.message },
                { status: 500 }
            )
        }

        console.log('[MOMO_CREATE_INSERT_TX_OK]', { providerOrderId })

        const rawSignature =
            `accessKey=${accessKey}` +
            `&amount=${amount}` +
            `&extraData=` +
            `&ipnUrl=${ipnUrl}` +
            `&orderId=${providerOrderId}` +
            `&orderInfo=${orderInfo}` +
            `&partnerCode=${partnerCode}` +
            `&redirectUrl=${redirectUrl}` +
            `&requestId=${requestId}` +
            `&requestType=payWithMethod`

        const signature = crypto
            .createHmac('sha256', secretKey)
            .update(rawSignature)
            .digest('hex')

        console.log('[MOMO_CREATE_SIGNATURE_RAW]', rawSignature)
        console.log('[MOMO_CREATE_SIGNATURE]', signature)

        const momoPayload = {
            partnerCode,
            partnerName: 'Nexus AI',
            storeId: 'NexusAI',
            requestId,
            amount,
            orderId: providerOrderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            lang: 'vi',
            requestType: 'payWithMethod',
            autoCapture: true,
            extraData: '',
            orderGroupId: '',
            signature,
        }

        console.log('[MOMO_CREATE_REQUEST]', momoPayload)

        const momoRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(momoPayload),
        })

        console.log('[MOMO_CREATE_HTTP_STATUS]', {
            ok: momoRes.ok,
            status: momoRes.status,
            statusText: momoRes.statusText,
        })

        const result = await momoRes.json()

        console.log('[MOMO_CREATE_RESPONSE]', result)

        if (!momoRes.ok || result.resultCode !== 0) {
            console.error('[MOMO_CREATE_FAILED]', result)

            await supabaseAdmin
                .from('payment_transactions')
                .update({
                    status: 'failed',
                    metadata: result,
                    updated_at: new Date().toISOString(),
                })
                .eq('provider_order_id', providerOrderId)

            return NextResponse.json(
                { error: result.message || 'MoMo create failed' },
                { status: 400 }
            )
        }

        const { error: savePayUrlError } = await supabaseAdmin
            .from('payment_transactions')
            .update({
                payment_url: result.payUrl,
                metadata: result,
                updated_at: new Date().toISOString(),
            })
            .eq('provider_order_id', providerOrderId)

        if (savePayUrlError) {
            console.error('[MOMO_CREATE_SAVE_PAYURL_ERROR]', savePayUrlError)
        }

        console.log('[MOMO_CREATE_DONE]', {
            providerOrderId,
            payUrl: result.payUrl,
        })

        return NextResponse.json({
            payUrl: result.payUrl,
            reused: false,
        })
    } catch (error) {
        console.error('[MOMO_CREATE_ERROR]', {
            error,
            message: error instanceof Error ? error.message : 'unknown',
        })

        return NextResponse.json(
            { error: 'Cannot create payment' },
            { status: 500 }
        )
    }
}