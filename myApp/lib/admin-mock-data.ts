/**
 * Dữ liệu mẫu cho bảng điều khiển admin.
 * Khi có bảng Supabase (profiles, audit_logs, payments, usage) — thay bằng fetch/API.
 */

export type AdminUserRow = {
  id: string
  email: string
  fullName: string
  avatarUrl?: string
  phoneNumber?: string
  birthDate?: string
  status: 'active' | 'suspended' | 'pending'
  registeredAt: string
  lastLoginAt: string
  plan: 'free' | 'pro' | 'enterprise'
  totalPaidVnd: number
  usageScore: number
}

export type AuditLogRow = {
  id: string
  createdAt: string
  email: string
  event: 'login' | 'register' | 'logout' | 'password_reset'
  ip: string
  userAgent: string
  device?: string | null
  success: boolean
}

export type BillingRow = {
  id: string
  userId: string
  userEmail: string
  amountVnd: number
  status: 'paid' | 'pending' | 'failed'
  method: 'momo' | 'vnpay' | 'card' | 'internal'
  createdAt: string
  description: string
}

export type UsageByUserRow = {
  userEmail: string
  requests: number
  tokensEstimate: number
  costVnd: number
}

export type SignupsByDay = { date: string; signups: number; activeUsers: number }

export type RevenueByDay = { date: string; revenueVnd: number }

export const MOCK_ADMIN_USERS: AdminUserRow[] = [
  {
    id: 'u1',
    email: 'a.nexus@example.com',
    fullName: 'An Nexus',
    status: 'active',
    registeredAt: '2026-04-01T08:00:00',
    lastLoginAt: '2026-04-19T10:22:00',
    plan: 'pro',
    totalPaidVnd: 1_200_000,
    usageScore: 92,
  },
  {
    id: 'u2',
    email: 'b.team@example.com',
    fullName: 'B Team',
    status: 'active',
    registeredAt: '2026-04-05T12:30:00',
    lastLoginAt: '2026-04-18T16:01:00',
    plan: 'enterprise',
    totalPaidVnd: 4_500_000,
    usageScore: 100,
  },
  {
    id: 'u3',
    email: 'c.student@example.com',
    fullName: 'C Student',
    status: 'suspended',
    registeredAt: '2026-03-20T09:15:00',
    lastLoginAt: '2026-04-10T07:45:00',
    plan: 'free',
    totalPaidVnd: 0,
    usageScore: 34,
  },
  {
    id: 'u4',
    email: 'd.startup@example.com',
    fullName: 'D Startup',
    status: 'pending',
    registeredAt: '2026-04-17T14:00:00',
    lastLoginAt: '2026-04-17T14:05:00',
    plan: 'free',
    totalPaidVnd: 0,
    usageScore: 12,
  },
]

export const MOCK_AUDIT_LOGS: AuditLogRow[] = [
  {
    id: 'l1',
    createdAt: '2026-04-19T11:02:11',
    email: 'a.nexus@example.com',
    event: 'login',
    ip: '171.224.x.x',
    userAgent: 'Chrome 134 / Windows',
    success: true,
  },
  {
    id: 'l2',
    createdAt: '2026-04-19T10:58:00',
    email: 'new.user@example.com',
    event: 'register',
    ip: '14.161.x.x',
    userAgent: 'Safari / iOS',
    success: true,
  },
  {
    id: 'l3',
    createdAt: '2026-04-19T09:12:44',
    email: 'wrong@example.com',
    event: 'login',
    ip: '103.199.x.x',
    userAgent: 'Firefox / Linux',
    success: false,
  },
  {
    id: 'l4',
    createdAt: '2026-04-18T22:30:01',
    email: 'b.team@example.com',
    event: 'logout',
    ip: '58.186.x.x',
    userAgent: 'Edge / Windows',
    success: true,
  },
  {
    id: 'l5',
    createdAt: '2026-04-18T18:00:00',
    email: 'c.student@example.com',
    event: 'password_reset',
    ip: '113.161.x.x',
    userAgent: 'Chrome / Android',
    success: true,
  },
]

export const MOCK_BILLING: BillingRow[] = [
  {
    id: 'p1',
    userId: 'u1',
    userEmail: 'a.nexus@example.com',
    amountVnd: 199_000,
    status: 'paid',
    method: 'vnpay',
    createdAt: '2026-04-15T09:00:00',
    description: 'Gói Pro — tháng 4',
  },
  {
    id: 'p2',
    userId: 'u2',
    userEmail: 'b.team@example.com',
    amountVnd: 2_990_000,
    status: 'paid',
    method: 'momo',
    createdAt: '2026-04-12T11:20:00',
    description: 'Enterprise — quý 2',
  },
  {
    id: 'p3',
    userId: 'u1',
    userEmail: 'a.nexus@example.com',
    amountVnd: 199_000,
    status: 'pending',
    method: 'card',
    createdAt: '2026-04-19T08:00:00',
    description: 'Gia hạn Pro',
  },
  {
    id: 'p4',
    userId: 'u4',
    userEmail: 'd.startup@example.com',
    amountVnd: 99_000,
    status: 'failed',
    method: 'vnpay',
    createdAt: '2026-04-16T16:40:00',
    description: 'Gói Starter',
  },
]

function daysBack(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d)
    x.setDate(x.getDate() - i)
    out.push(x.toISOString().slice(0, 10))
  }
  return out
}

export function getMockSignupsSeries(): SignupsByDay[] {
  const dates = daysBack(14)
  return dates.map((date, i) => ({
    date,
    signups: Math.max(0, Math.round(8 + Math.sin(i / 2) * 5 + (i % 4) * 2)),
    activeUsers: Math.max(0, Math.round(40 + i * 3 + Math.cos(i / 3) * 12)),
  }))
}

export function getMockRevenueSeries(): RevenueByDay[] {
  const dates = daysBack(14)
  return dates.map((date, i) => ({
    date,
    revenueVnd: Math.max(0, Math.round(120_000 + i * 25_000 + Math.sin(i) * 80_000)),
  }))
}

export function getMockUsageByUser(): UsageByUserRow[] {
  return [
    { userEmail: 'b.team@example.com', requests: 18420, tokensEstimate: 9_200_000, costVnd: 2_100_000 },
    { userEmail: 'a.nexus@example.com', requests: 9210, tokensEstimate: 4_100_000, costVnd: 890_000 },
    { userEmail: 'c.student@example.com', requests: 1204, tokensEstimate: 600_000, costVnd: 120_000 },
    { userEmail: 'd.startup@example.com', requests: 340, tokensEstimate: 180_000, costVnd: 45_000 },
  ]
}

export function adminSummaryStats() {
  const users = MOCK_ADMIN_USERS
  const paid = MOCK_BILLING.filter((b) => b.status === 'paid')
  const totalRevenue = paid.reduce((s, b) => s + b.amountVnd, 0)
  return {
    userCount: users.length,
    activeUsers: users.filter((u) => u.status === 'active').length,
    suspendedUsers: users.filter((u) => u.status === 'suspended').length,
    totalRevenueVnd: totalRevenue,
    pendingPayments: MOCK_BILLING.filter((b) => b.status === 'pending').length,
  }
}
