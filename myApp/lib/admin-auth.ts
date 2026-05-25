/**
 * Danh sách admin (client): dùng `NEXT_PUBLIC_ADMIN_EMAILS` — cùng danh sách với
 * `ADMIN_EMAILS` / `NEXT_PUBLIC_ADMIN_EMAILS` trong `proxy.ts` (edge, Next.js 16+).
 */
export function getAdminEmailListClient(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isUserAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return getAdminEmailListClient().includes(email.trim().toLowerCase())
}
