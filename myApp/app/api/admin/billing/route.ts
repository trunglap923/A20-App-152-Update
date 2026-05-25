import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin'

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('payment_transactions')
            .select(`
        id,
        created_at,
        amount,
        provider,
        status,
        user_id,
        subscriptions (
          billing_cycle,
          plans (
            name
          )
        )
      `)
            .order('created_at', { ascending: false })

        if (error) {
            throw error
        }

        const userIds = [...new Set(data.map((d) => d.user_id))]

        const { data: users } = await supabaseAdmin.auth.admin.listUsers()

        const formatted = data.map((item) => {
            const user = users.users.find(
                (u) => u.id === item.user_id
            )

            const sub = Array.isArray(item.subscriptions)
                ? item.subscriptions[0]
                : item.subscriptions

            const plan = Array.isArray(sub?.plans)
                ? sub?.plans?.[0]
                : sub?.plans

            return {
                id: item.id,
                created_at: item.created_at,
                amount: item.amount || 0,
                provider: item.provider || 'unknown',
                status: item.status || 'pending',
                user_email: user?.email || 'Unknown',
                description: plan?.name
                    ? `Thanh toán gói ${plan.name}`
                    : 'Thanh toán subscription',
            }
        })

        return NextResponse.json(formatted)
    } catch (err: any) {
        return NextResponse.json(
            {
                error: err.message,
            },
            {
                status: 500,
            }
        )
    }
}