import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

type ActivateSubscriptionInput = {
    userId: string
    planId: string
    billingCycle: 'monthly' | 'yearly'
    transactionId: string
}

export async function activateSubscription({
    userId,
    planId,
    billingCycle,
    transactionId,
}: ActivateSubscriptionInput) {
    console.log('[ACTIVATE_SUB_START]', {
        userId,
        planId,
        billingCycle,
        transactionId,
    })

    const now = new Date()
    const nowIso = now.toISOString()

    /**
     * =========================================
     * 0) IDEMPOTENCY
     * tránh webhook retry tạo nhiều sub
     * =========================================
     */
    const { data: existingProcessedSub, error: existingProcessedSubError } =
        await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('payment_transaction_id', transactionId)
            .maybeSingle()

    if (existingProcessedSubError) {
        console.error(
            '[ACTIVATE_SUB_EXISTING_CHECK_ERROR]',
            existingProcessedSubError
        )

        throw new Error(
            `Existing subscription check failed: ${existingProcessedSubError.message}`
        )
    }

    if (existingProcessedSub) {
        console.log('[ACTIVATE_SUB_ALREADY_PROCESSED]', {
            subscriptionId: existingProcessedSub.id,
        })

        return {
            success: true,
            already_processed: true,
            subscription_id: existingProcessedSub.id,
        }
    }

    /**
     * =========================================
     * 1) GET PLAN
     * =========================================
     */
    const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single()

    if (planError || !plan) {
        console.error('[ACTIVATE_SUB_PLAN_NOT_FOUND]', {
            planId,
            planError,
        })

        throw new Error(
            `Plan not found while activating subscription: ${planError?.message}`
        )
    }

    console.log('[ACTIVATE_SUB_PLAN_OK]', {
        planId,
        planCode: plan.code,
    })

    /**
     * =========================================
     * 2) GET CURRENT ACTIVE SUB
     * =========================================
     */
    const { data: activeSubs, error: currentSubError } =
        await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)

    if (currentSubError) {
        console.error(
            '[ACTIVATE_SUB_CURRENT_SUB_ERROR]',
            currentSubError
        )

        throw new Error(
            `Current subscription lookup failed: ${currentSubError.message}`
        )
    }

    const currentSub = activeSubs?.[0] || null

    console.log(
        '[ACTIVATE_SUB_CURRENT_SUB]',
        currentSub
            ? `found: ${currentSub.id}, ends_at=${currentSub.ends_at}`
            : 'none'
    )

    /**
     * =========================================
     * 3) CALCULATE PERIOD
     * =========================================
     *
     * Nếu còn sub active:
     * nối tiếp từ ends_at
     *
     * Nếu hết:
     * bắt đầu từ hiện tại
     */
    let startDate = now

    if (currentSub?.ends_at) {
        const currentEnd = new Date(currentSub.ends_at)

        if (currentEnd > now) {
            startDate = currentEnd
        }
    }

    const endDate = new Date(startDate)

    if (billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1)
    } else {
        endDate.setMonth(endDate.getMonth() + 1)
    }

    console.log('[ACTIVATE_SUB_PERIOD]', {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        billingCycle,
    })

    /**
     * =========================================
     * 4) EXPIRE OLD ACTIVE SUBS
     * =========================================
     */
    if (currentSub) {
        const { error: expireError } = await supabaseAdmin
            .from('subscriptions')
            .update({
                status: 'expired',
                expired_at: nowIso,
                updated_at: nowIso,
            })
            .eq('user_id', userId)
            .eq('status', 'active')

        if (expireError) {
            console.error(
                '[ACTIVATE_SUB_EXPIRE_OLD_ERROR]',
                expireError
            )

            throw new Error(
                `Expire old subscription failed: ${expireError.message}`
            )
        }

        console.log('[ACTIVATE_SUB_EXPIRE_OLD_OK]')
    }

    /**
     * =========================================
     * 5) CREATE NEW ACTIVE SUB
     * =========================================
     */
    const insertPayload = {
        user_id: userId,
        plan_id: planId,
        payment_transaction_id: transactionId,
        billing_cycle: billingCycle,
        status: 'active',
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        auto_renew: false,
        created_at: nowIso,
        updated_at: nowIso,
    }

    console.log(
        '[ACTIVATE_SUB_INSERT_PAYLOAD]',
        insertPayload
    )

    const { data: insertedSub, error: subError } =
        await supabaseAdmin
            .from('subscriptions')
            .insert(insertPayload)
            .select()
            .single()

    if (subError) {
        console.error(
            '[ACTIVATE_SUB_INSERT_ERROR]',
            subError
        )

        throw new Error(
            `Subscription insert failed: ${subError.message} (code: ${subError.code})`
        )
    }

    console.log('[ACTIVATE_SUB_INSERT_OK]', {
        subscriptionId: insertedSub.id,
    })

    /**
     * =========================================
     * 6) DONE
     * =========================================
     */
    console.log('[ACTIVATE_SUB_DONE]', {
        userId,
        subscriptionId: insertedSub.id,
        planCode: plan.code,
    })

    return {
        success: true,
        subscription_id: insertedSub.id,
        plan_code: plan.code,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
    }
}