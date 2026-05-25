export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  FAILED: 'failed',
} as const

export const SUBSCRIPTION_STATUS = {
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const

export const WEBHOOK_STATUS = {
  RECEIVED: 'received',
  VERIFIED: 'verified',
  PROCESSED: 'processed',
  FAILED: 'failed',
} as const

export const PAYMENT_PROVIDERS = {
  VIETQR: 'vietqr',
  MOMO: 'momo',
  ZALOPAY: 'zalopay',
} as const
