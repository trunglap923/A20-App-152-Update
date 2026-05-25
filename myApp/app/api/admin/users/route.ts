import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function GET() {
    try {
        // USERS
        const {
            data: { users },
            error: usersError,
        } = await supabaseAdmin.auth.admin.listUsers()

        if (usersError) {
            throw usersError
        }

        // SUBSCRIPTIONS + PLAN
        const { data: subscriptions, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select(`
                user_id,
                status,
                plan_id,
                plans!subscriptions_plan_id_fkey (
                    name,
                    code
  )
`)
            .eq('status', 'active')

        if (subError) {
            throw subError
        }

        // PAYMENTS
        const { data: payments, error: payError } = await supabaseAdmin
            .from('payment_transactions')
            .select(`
        user_id,
        amount,
        status
      `)
            .eq('status', 'paid')

        if (payError) {
            throw payError
        }

        // MAP USERS
        const result = users.map((user) => {
            const activeSub = subscriptions.find(
                (s) =>
                    s.user_id === user.id &&
                    s.status === 'active'
            )
            const plansRelation: any = activeSub?.plans

            const planCode = Array.isArray(plansRelation)
                ? plansRelation[0]?.code
                : plansRelation?.code

            const userPayments = payments.filter(
                (p) => p.user_id === user.id
            )

            const totalPaidVnd = userPayments.reduce(
                (sum, p) => sum + p.amount,
                0
            )

            return {
                id: user.id,

                fullName:
                    user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    'Unknown User',

                email: user.email || '',

                avatarUrl:
                    user.user_metadata?.avatar_url || null,

                registeredAt: user.created_at,

                lastLoginAt:
                    user.last_sign_in_at || user.created_at,

                status: user.banned_until
                    ? 'suspended'
                    : 'active',

                plan: planCode || 'free',

                totalPaidVnd,

                usageScore: Math.min(
                    100,
                    Math.floor(totalPaidVnd / 10000)
                ),
            }
        })

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('[ADMIN_USERS_API]', error)

        return NextResponse.json(
            {
                error: error.message || 'Internal server error',
            },
            {
                status: 500,
            }
        )
    }
}