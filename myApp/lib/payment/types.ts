import { z } from 'zod'

export const WebhookPayloadSchema = z.object({
  id: z.number().or(z.string()).optional(),
  gateway: z.string().optional(),
  transactionDate: z.string().optional(),
  accountNumber: z.string().optional(),
  subAccount: z.string().optional(),
  amountIn: z.number().or(z.string()).optional(),
  amountOut: z.number().or(z.string()).optional(),
  accumulated: z.number().or(z.string()).optional(),
  code: z.string().optional(),
  transactionContent: z.string().optional(),
  referenceNumber: z.string().optional(),
  body: z.string().optional(),
  // Casso or SePay can have different fields
  // Below are some common fields just to ensure we can parse
}).passthrough() // Allow other fields

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>

export interface ParsedTransferContent {
  userId: string | null
  planCode: string | null
  orderCode: string | null
}
