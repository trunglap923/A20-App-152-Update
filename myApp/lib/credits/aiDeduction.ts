import { deductCredits } from './deductCredits'
import { CREDIT_RATE_USD } from './types'
import type { AiUsageDeductionParams } from './types'

/**
 * Model pricing per token (USD).
 * Source: https://openai.com/pricing, https://ai.google.dev/pricing, etc.
 *
 * Format: { input: USD per 1 token, output: USD per 1 token }
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // ─── OpenAI ──────────────────────────────────────────────────
    'gpt-4o':           { input: 2.50 / 1e6,  output: 10.00 / 1e6 },
    'gpt-4o-mini':      { input: 0.15 / 1e6,  output: 0.60  / 1e6 },
    'gpt-4-turbo':      { input: 10.00 / 1e6, output: 30.00 / 1e6 },
    'gpt-4':            { input: 30.00 / 1e6, output: 60.00 / 1e6 },
    'gpt-3.5-turbo':    { input: 0.50  / 1e6, output: 1.50  / 1e6 },
    'o1':               { input: 15.00 / 1e6, output: 60.00 / 1e6 },
    'o1-mini':          { input: 3.00  / 1e6, output: 12.00 / 1e6 },
    'o3-mini':          { input: 1.10  / 1e6, output: 4.40  / 1e6 },

    // ─── Google Gemini ───────────────────────────────────────────
    'gemini-1.5-pro':       { input: 1.25  / 1e6, output: 5.00  / 1e6 },
    'gemini-1.5-flash':     { input: 0.075 / 1e6, output: 0.30  / 1e6 },
    'gemini-2.0-flash':     { input: 0.10  / 1e6, output: 0.40  / 1e6 },
    'gemini-2.5-flash':     { input: 0.15  / 1e6, output: 0.60  / 1e6 },
    'gemini-2.5-pro':       { input: 1.25  / 1e6, output: 10.00 / 1e6 },

    // ─── Anthropic Claude ────────────────────────────────────────
    'claude-3-opus':        { input: 15.00 / 1e6, output: 75.00 / 1e6 },
    'claude-3-sonnet':      { input: 3.00  / 1e6, output: 15.00 / 1e6 },
    'claude-3-haiku':       { input: 0.25  / 1e6, output: 1.25  / 1e6 },
    'claude-3.5-sonnet':    { input: 3.00  / 1e6, output: 15.00 / 1e6 },
    'claude-3.5-haiku':     { input: 0.80  / 1e6, output: 4.00  / 1e6 },
    'claude-4-sonnet':      { input: 3.00  / 1e6, output: 15.00 / 1e6 },
    'claude-4-opus':        { input: 15.00 / 1e6, output: 75.00 / 1e6 },

    // ─── xAI Grok ────────────────────────────────────────────────
    'grok-2':           { input: 2.00  / 1e6, output: 10.00 / 1e6 },
    'grok-3':           { input: 3.00  / 1e6, output: 15.00 / 1e6 },
    'grok-3-mini':      { input: 0.30  / 1e6, output: 0.50  / 1e6 },

    // ─── OpenAI Whisper (STT) ────────────────────────────────────
    // Whisper charges per minute, not per token. Use a fixed cost per call.
    'whisper-1':        { input: 0, output: 0 },
}

/**
 * Default pricing for unknown models — uses gpt-4o-mini pricing as a safe default.
 */
const DEFAULT_PRICING = { input: 0.15 / 1e6, output: 0.60 / 1e6 }

/**
 * Fixed cost for models that don't use token-based pricing (e.g., Whisper STT).
 * Cost in USD per call.
 */
const FIXED_COST_MODELS: Record<string, number> = {
    'whisper-1': 0.006, // ~$0.006/minute, assume ~1 min average
}

/**
 * Find the best matching pricing entry for a model name.
 * Handles cases like "gpt-4o-mini-2024-07-18" matching "gpt-4o-mini".
 */
function findModelPricing(modelName: string): { input: number; output: number } {
    const normalized = modelName.toLowerCase().trim()

    // Exact match
    if (MODEL_PRICING[normalized]) {
        return MODEL_PRICING[normalized]
    }

    // Prefix match (e.g., "gpt-4o-mini-2024-07-18" → "gpt-4o-mini")
    const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length)
    for (const key of keys) {
        if (normalized.startsWith(key)) {
            return MODEL_PRICING[key]
        }
    }

    console.warn(`[AI_DEDUCTION] Unknown model "${modelName}", using default pricing`)
    return DEFAULT_PRICING
}

/**
 * Calculate actual USD cost from token usage and model name.
 */
export function calculateActualCostUsd(
    modelName: string,
    inputTokens: number,
    outputTokens: number
): number {
    const normalized = modelName.toLowerCase().trim()

    // Check fixed-cost models first (e.g., Whisper)
    if (FIXED_COST_MODELS[normalized]) {
        return FIXED_COST_MODELS[normalized]
    }

    const pricing = findModelPricing(modelName)
    return (inputTokens * pricing.input) + (outputTokens * pricing.output)
}

/**
 * Convert USD cost to credits using the fixed rate.
 * Always rounds UP so any usage > 0 costs at least 1 credit.
 */
export function usdToCredits(costUsd: number): number {
    if (costUsd <= 0) return 0
    return Math.ceil(costUsd / CREDIT_RATE_USD)
}

/**
 * Process AI usage deduction based on actual USD cost.
 *
 * 1. Calculates actual_cost_usd from input_tokens, output_tokens, model_name
 * 2. Converts to credits: credits_used = ceil(actual_cost_usd / 0.002)
 * 3. Checks user_credits.balance
 * 4. If insufficient → throws "Insufficient credits"
 * 5. If sufficient → deducts balance, increases total_used, inserts credit_transaction
 *
 * Metadata saved:
 * - actual_cost_usd, credit_rate_usd, input_tokens, output_tokens
 * - model_name, task_type, ai_log_id
 */
export async function processAiUsageDeduction(params: AiUsageDeductionParams) {
    const { userId, taskType, modelName, inputTokens, outputTokens, aiLogId } = params

    // 1. Calculate actual USD cost
    const actualCostUsd = calculateActualCostUsd(modelName, inputTokens, outputTokens)

    // 2. Convert to credits (ceil)
    const creditsUsed = usdToCredits(actualCostUsd)

    // If cost is truly zero (e.g., reused answer, no LLM call), skip deduction
    if (creditsUsed <= 0) {
        console.log('[AI_DEDUCTION] Zero cost, skipping deduction')
        return { success: true, newBalance: -1, creditsUsed: 0, actualCostUsd: 0 }
    }

    const description = `AI: ${taskType} (${modelName}) — $${actualCostUsd.toFixed(6)}`

    // 3-5. Check balance, deduct, and record transaction
    try {
        const result = await deductCredits({
            userId,
            amount: creditsUsed,
            description,
            aiLogId,
            metadata: {
                actual_cost_usd: actualCostUsd,
                credit_rate_usd: CREDIT_RATE_USD,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                model_name: modelName,
                task_type: taskType,
                ai_log_id: aiLogId || null,
            },
        })

        return { ...result, creditsUsed, actualCostUsd }
    } catch (error) {
        console.error('[AI_DEDUCTION_ERROR]', error)
        throw error
    }
}
