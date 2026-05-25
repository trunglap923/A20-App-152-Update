import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import type { CreditsApiResponse } from '@/lib/credits/types'

/**
 * GET /api/credits
 *
 * Returns current credit balance, totals, and recent transactions
 * for the authenticated user.
 */
export async function GET() {
    try {
        const supabase = await createClient()

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // ─── 1. Get user credits ─────────────────────────────────
        const { data: credits } = await supabase
            .from('user_credits')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()

        // ─── 2. Get recent transactions ──────────────────────────
        const { data: transactions } = await supabase
            .from('credit_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)

        const response: CreditsApiResponse = {
            balance: credits ? Number(credits.balance) : 0,
            total_purchased: credits ? Number(credits.total_purchased) : 0,
            total_used: credits ? Number(credits.total_used) : 0,
            transactions: transactions || [],
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('[API_CREDITS]', error)

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
