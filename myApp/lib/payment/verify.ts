import crypto from 'crypto'

/**
 * Verifies the signature from SePay webhook
 */
export function verifySePaySignature(
  payload: string, // raw body string
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false

  // Example SePay verification: HMAC SHA256 of raw body
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')

    // Or some webhooks send Authorization: Bearer <TOKEN>
    // We will support both Token-based and HMAC-based
    if (signature.startsWith('Bearer ')) {
      return signature.replace('Bearer ', '') === secret
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch (error) {
    console.error('[VERIFY_SIGNATURE_ERROR]', error)
    return false
  }
}
