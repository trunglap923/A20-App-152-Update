import type { ParsedTransferContent } from './types'

/**
 * Extracts order code or specific data from the transfer content.
 * E.g., if orderCode is VQR-12345678, we extract it.
 */
export function parseTransferContent(content: string): ParsedTransferContent {
  const result: ParsedTransferContent = {
    userId: null,
    planCode: null,
    orderCode: null,
  }

  if (!content) return result

  // Normalize content: uppercase, remove multiple spaces
  const normalized = content.toUpperCase().replace(/\s+/g, ' ').trim()

  // Match VQR-\d+ pattern for our transaction codes
  const vqrMatch = normalized.match(/VQR-\d+/)
  if (vqrMatch) {
    result.orderCode = vqrMatch[0]
  }

  // Alternatively, if we use SUB_${userId}_${planId} pattern
  const subMatch = normalized.match(/SUB_([A-Z0-9]+)_([A-Z0-9]+)/)
  if (subMatch) {
    result.userId = subMatch[1]
    result.planCode = subMatch[2]
  }

  return result
}
