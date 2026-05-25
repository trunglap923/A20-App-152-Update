import { createClient } from '@/lib/supabaseServer'
import { processSuccessfulPayment } from './service'
import { PAYMENT_PROVIDERS, WEBHOOK_STATUS } from './constants'
import { WebhookPayload } from './types'

export async function logWebhook(provider: string, payload: WebhookPayload) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('payment_webhooks')
    .insert({
      provider,
      payload,
      status: WEBHOOK_STATUS.RECEIVED,
    })
    .select()
    .single()

  if (error) {
    console.error('[WEBHOOK_LOG_ERROR]', error)
  }
  return data
}

export async function updateWebhookStatus(
  webhookId: string,
  status: string,
  transactionId?: string,
  errorMessage?: string
) {
  const supabase = await createClient()
  
  await supabase
    .from('payment_webhooks')
    .update({
      status,
      transaction_id: transactionId || null,
      error_message: errorMessage || null,
      processed_at: status === WEBHOOK_STATUS.PROCESSED ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', webhookId)
}

export async function handleBankTransferWebhook(
  webhookId: string,
  orderCode: string,
  amount: number,
  providerTransactionId: string
) {
  const supabase = await createClient()

  // 1. Find the transaction
  const { data: tx, error: txError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('order_code', orderCode)
    .eq('provider', PAYMENT_PROVIDERS.VIETQR)
    .single()

  if (txError || !tx) {
    await updateWebhookStatus(webhookId, WEBHOOK_STATUS.FAILED, undefined, 'Transaction not found')
    throw new Error('Transaction not found')
  }

  // 2. Validate Amount
  if (Number(tx.amount) !== amount) {
    await updateWebhookStatus(webhookId, WEBHOOK_STATUS.FAILED, tx.id, 'Invalid amount')
    throw new Error('Invalid amount')
  }

  // 3. Process Payment (idempotent inside processSuccessfulPayment)
  try {
    const result = await processSuccessfulPayment(tx.id, providerTransactionId)
    
    // 4. Update webhook status
    await updateWebhookStatus(webhookId, WEBHOOK_STATUS.PROCESSED, tx.id)
    
    return result
  } catch (error: any) {
    await updateWebhookStatus(webhookId, WEBHOOK_STATUS.FAILED, tx.id, error.message)
    throw error
  }
}
