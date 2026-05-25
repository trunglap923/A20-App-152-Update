import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'
import { GrantCreditsParams, PLAN_CREDITS } from './types'

/**
 * Grant credits to a user after a successful payment.
 *
 * This function is idempotent — if credits have already been granted
 * for the given `paymentReference`, it returns immediately without
 * duplicating credits.
 *
 * Called from both VietQR (SePay) and ZaloPay webhooks.
 */
export async function grantCreditsAfterPayment(
    params: GrantCreditsParams
): Promise<{ success: boolean; alreadyGranted: boolean; creditsAdded: number }> {
    const { userId, planCode, billingCycle, paymentReference, provider } = params

    // ─── 1. Idempotency check ────────────────────────────────────
    const { data: existingTx } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .eq('transaction_type', 'purchase')
        .eq('payment_reference', paymentReference)
        .maybeSingle()

    if (existingTx) {
        console.log('[GRANT_CREDITS] Already granted for', paymentReference)
        return { success: true, alreadyGranted: true, creditsAdded: 0 }
    }

    // ─── 2. Determine credit amount ──────────────────────────────
    const planCredits = PLAN_CREDITS[planCode]

    if (!planCredits) {
        console.error('[GRANT_CREDITS] Unknown plan code:', planCode)
        return { success: false, alreadyGranted: false, creditsAdded: 0 }
    }

    const creditsToAdd = billingCycle === 'yearly'
        ? planCredits.yearly
        : planCredits.monthly

    if (creditsToAdd <= 0) {
        console.log('[GRANT_CREDITS] Zero credits for plan:', planCode)
        return { success: true, alreadyGranted: false, creditsAdded: 0 }
    }

    // ─── 3. Upsert user_credits ──────────────────────────────────
    // Try to get existing row first
    const { data: existingCredits } = await supabaseAdmin
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

    const now = new Date().toISOString()
    let newBalance: number

    if (existingCredits) {
        // Update existing row
        newBalance = Number(existingCredits.balance) + creditsToAdd

        const { error: updateError } = await supabaseAdmin
            .from('user_credits')
            .update({
                balance: newBalance,
                total_purchased: Number(existingCredits.total_purchased) + creditsToAdd,
                updated_at: now,
            })
            .eq('user_id', userId)

        if (updateError) {
            console.error('[GRANT_CREDITS] Update user_credits failed:', updateError)
            throw new Error(`Failed to update user_credits: ${updateError.message}`)
        }
    } else {
        // Create new row
        newBalance = creditsToAdd

        const { error: insertError } = await supabaseAdmin
            .from('user_credits')
            .insert({
                user_id: userId,
                balance: newBalance,
                total_purchased: creditsToAdd,
                total_used: 0,
                created_at: now,
                updated_at: now,
            })

        if (insertError) {
            console.error('[GRANT_CREDITS] Insert user_credits failed:', insertError)
            throw new Error(`Failed to insert user_credits: ${insertError.message}`)
        }
    }

    // ─── 4. Record credit transaction ────────────────────────────
    const description = `Nạp ${creditsToAdd.toLocaleString('vi-VN')} credits — Gói ${planCode} (${billingCycle === 'yearly' ? 'năm' : 'tháng'})`

    const { error: txError } = await supabaseAdmin
        .from('credit_transactions')
        .insert({
            user_id: userId,
            amount: creditsToAdd,
            balance_after: newBalance,
            transaction_type: 'purchase',
            description,
            payment_reference: paymentReference,
            ai_log_id: null,
            metadata: {
                provider,
                planCode,
                billingCycle,
            },
            created_at: now,
        })

    if (txError) {
        console.error('[GRANT_CREDITS] Insert credit_transaction failed:', txError)
        throw new Error(`Failed to insert credit_transaction: ${txError.message}`)
    }

    console.log(
        '[GRANT_CREDITS] Success:',
        `userId=${userId}, credits=${creditsToAdd}, balance=${newBalance}, ref=${paymentReference}`
    )

    return { success: true, alreadyGranted: false, creditsAdded: creditsToAdd }
}
