/**
 * Credit Wallet System — Type Definitions
 */

export interface UserCredits {
    user_id: string
    balance: number
    total_purchased: number
    total_used: number
    created_at: string
    updated_at: string
}

export interface CreditTransaction {
    id: string
    user_id: string
    amount: number
    balance_after: number
    transaction_type: CreditTransactionType
    description: string | null
    payment_reference: string | null
    ai_log_id: string | null
    metadata: Record<string, any>
    created_at: string
}

export type CreditTransactionType =
    | 'purchase'
    | 'yearly_bonus'
    | 'usage'
    | 'refund'
    | 'admin_adjust'

export interface GrantCreditsParams {
    userId: string
    planCode: string
    billingCycle: 'monthly' | 'yearly'
    paymentReference: string
    provider: string
}

export interface DeductCreditsParams {
    userId: string
    amount: number
    description: string
    aiLogId?: string
    metadata?: Record<string, any>
}

/**
 * Params for AI usage deduction based on actual USD cost.
 */
export interface AiUsageDeductionParams {
    userId: string
    taskType: string
    modelName: string
    inputTokens: number
    outputTokens: number
    aiLogId?: string
}

/**
 * Fixed credit rate: 1 credit = 0.002 USD
 */
export const CREDIT_RATE_USD = 0.002

export interface CreditsApiResponse {
    balance: number
    total_purchased: number
    total_used: number
    transactions: CreditTransaction[]
}

/**
 * Credit amounts per plan and billing cycle.
 */
export const PLAN_CREDITS: Record<string, { monthly: number; yearly: number }> = {
    free: { monthly: 50, yearly: 50 },
    pro: { monthly: 700, yearly: 8000 },
    premium: { monthly: 1500, yearly: 16500 },
}
