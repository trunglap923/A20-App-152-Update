import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'
import { DeductCreditsParams } from './types'

/**
 * Deduct credits from a user's wallet for AI usage.
 *
 * - Subtracts from `user_credits.balance`
 * - Increments `user_credits.total_used`
 * - Inserts a `credit_transactions` row with `transaction_type = 'usage'`
 *
 * @throws Error if user has insufficient credits or user_credits row not found.
 */
export async function deductCredits(
    params: DeductCreditsParams
): Promise<{ success: boolean; newBalance: number }> {
    const { userId, amount, description, aiLogId, metadata } = params

    if (amount <= 0) {
        throw new Error('Deduction amount must be positive')
    }

    // ─── 1. Get current balance ──────────────────────────────────
    const { data: credits, error: fetchError } = await supabaseAdmin
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

    if (fetchError) {
        throw new Error(`Failed to fetch user_credits: ${fetchError.message}`)
    }

    if (!credits) {
        throw new Error('User has no credit wallet')
    }

    const currentBalance = Number(credits.balance)

    if (currentBalance < amount) {
        throw new Error(
            `Insufficient credits: balance=${currentBalance}, required=${amount}`
        )
    }

    // ─── 2. Update balance ───────────────────────────────────────
    const newBalance = currentBalance - amount
    const now = new Date().toISOString()

    const { error: updateError } = await supabaseAdmin
        .from('user_credits')
        .update({
            balance: newBalance,
            total_used: Number(credits.total_used) + amount,
            updated_at: now,
        })
        .eq('user_id', userId)

    if (updateError) {
        throw new Error(`Failed to update user_credits: ${updateError.message}`)
    }

    // ─── 3. Record transaction ───────────────────────────────────
    const { error: txError } = await supabaseAdmin
        .from('credit_transactions')
        .insert({
            user_id: userId,
            amount: -amount, // negative for deduction
            balance_after: newBalance,
            transaction_type: 'usage',
            description,
            payment_reference: null,
            ai_log_id: aiLogId || null,
            metadata: metadata || {},
            created_at: now,
        })

    if (txError) {
        console.error('[DEDUCT_CREDITS] Insert credit_transaction failed:', txError)
        throw new Error(`Failed to insert credit_transaction: ${txError.message}`)
    }

    console.log(
        '[DEDUCT_CREDITS] Success:',
        `userId=${userId}, deducted=${amount}, newBalance=${newBalance}`
    )

    return { success: true, newBalance }
}
