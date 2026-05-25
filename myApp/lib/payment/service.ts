import { createClient } from '@/lib/supabaseServer'
import { PAYMENT_STATUS, SUBSCRIPTION_STATUS } from './constants'

export async function createPaymentTransaction(params: {
  userId: string
  planId: string
  planCode: string
  provider: string
  billingCycle: 'monthly' | 'yearly'
  amount: number
  orderCode: string
  qrUrl: string
  expiredAt: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payment_transactions')
    .insert({
      user_id: params.userId,
      plan_id: params.planId,
      provider: params.provider,
      billing_cycle: params.billingCycle,
      order_code: params.orderCode,
      provider_transaction_id: params.orderCode,
      amount: params.amount,
      currency: 'VND',
      status: PAYMENT_STATUS.PENDING,
      qr_code: params.qrUrl,
      expired_at: params.expiredAt,
      metadata: { plan_code: params.planCode },
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create transaction: ${error.message}`)
  }

  return data
}

export async function processSuccessfulPayment(transactionId: string, providerTransactionId: string) {
  const supabase = await createClient()

  // 1. Get transaction and lock it (via select, or let DB handle concurrency via constraints)
  const { data: tx, error: txError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('id', transactionId)
    .single()

  if (txError || !tx) {
    throw new Error('Transaction not found')
  }

  if (tx.status === PAYMENT_STATUS.PAID) {
    return { success: true, alreadyProcessed: true }
  }

  // 2. Expire old active subscriptions
  await supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.EXPIRED,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', tx.user_id)
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)

  // 3. Calculate new subscription ends_at
  const durationDays = tx.billing_cycle === 'yearly' ? 365 : 30
  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000)

  // 4. Mark payment as PAID
  const { error: updateTxError } = await supabase
    .from('payment_transactions')
    .update({
      status: PAYMENT_STATUS.PAID,
      paid_at: new Date().toISOString(),
      provider_transaction_id: providerTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tx.id)
    .eq('status', PAYMENT_STATUS.PENDING) // atomic check

  if (updateTxError) {
    throw new Error(`Failed to update transaction status: ${updateTxError.message}`)
  }

  // 5. Create new subscription
  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: tx.user_id,
      plan_id: tx.plan_id,
      billing_cycle: tx.billing_cycle,
      payment_transaction_id: tx.id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })

  if (subError) {
    throw new Error(`Failed to create subscription: ${subError.message}`)
  }

  return { success: true, alreadyProcessed: false }
}
