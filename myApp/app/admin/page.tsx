'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { createClient } from '@/lib/supabaseClient'

const supabase = createClient()

const PAYMENT_COLORS: Record<string, string> = {
  paid: '#10B981',
  pending: '#FF8A00',
  failed: '#DC143C',
}

export default function AdminOverviewPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])

  const [signups, setSignups] = useState<any[]>([])
  const [revenue, setRevenue] = useState<any[]>([])

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        /**
         * =========================
         * LOAD PAYMENTS
         * =========================
         */
        const { data: paymentsData, error: paymentsError } =
          await supabase
            .from('payment_transactions')
            .select('*')
            .order('created_at', { ascending: true })

        if (paymentsError) {
          console.error('[PAYMENTS_ERROR]', paymentsError)
        }

        /**
         * =========================
         * LOAD USERS
         * =========================
         */
        const { data: usersData, error: usersError } =
          await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: true })

        if (usersError) {
          console.error('[USERS_ERROR]', usersError)
        }

        const payments = paymentsData || []
        const users = usersData || []

        setPayments(payments)
        setUsers(users)

        /**
         * =========================
         * REVENUE CHART
         * =========================
         */
        const revenueMap = new Map<string, number>()

        payments
          .filter((p) => p.status === 'paid')
          .forEach((p) => {
            const date = format(
              parseISO(p.created_at),
              'yyyy-MM-dd'
            )

            revenueMap.set(
              date,
              (revenueMap.get(date) || 0) + p.amount
            )
          })

        setRevenue(
          Array.from(revenueMap.entries()).map(
            ([date, revenueVnd]) => ({
              date,
              revenueVnd,
            })
          )
        )

        /**
         * =========================
         * SIGNUP CHART
         * =========================
         */
        const signupMap = new Map<
          string,
          {
            signups: number
            activeUsers: number
          }
        >()

        users.forEach((u, index) => {
          const date = format(
            parseISO(u.created_at),
            'yyyy-MM-dd'
          )

          const existing = signupMap.get(date)

          signupMap.set(date, {
            signups: (existing?.signups || 0) + 1,
            activeUsers: index + 1,
          })
        })

        setSignups(
          Array.from(signupMap.entries()).map(
            ([date, value]) => ({
              date,
              signups: value.signups,
              activeUsers: value.activeUsers,
            })
          )
        )
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  /**
   * =========================
   * STATS
   * =========================
   */
  const stats = useMemo(() => {
    const totalRevenueVnd = payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0)

    const pendingPayments = payments.filter(
      (p) => p.status === 'pending'
    ).length

    const activeUsers = new Set(
      payments
        .filter((p) => p.status === 'paid')
        .map((p) => p.user_id)
    ).size

    const suspendedUsers = 0

    return {
      userCount: users.length,
      activeUsers,
      suspendedUsers,
      totalRevenueVnd,
      pendingPayments,
    }
  }, [payments, users])

  /**
   * =========================
   * PIE CHART
   * =========================
   */
  const paymentPie = (
    ['paid', 'pending', 'failed'] as const
  )
    .map((status) => ({
      name:
        status === 'paid'
          ? 'Đã thanh toán'
          : status === 'pending'
            ? 'Chờ xử lý'
            : 'Thất bại',

      value: payments.filter(
        (b) => b.status === status
      ).length,

      status,
    }))
    .filter((d) => d.value > 0)

  /**
   * =========================
   * LOADING
   * =========================
   */
  if (loading) {
    return (
      <div className="flex h-[500px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="relative space-y-8 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/70 to-white p-4 md:p-6">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.12),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(109,40,217,0.1),transparent_38%)]" />

      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />

      {/* Header */}
      <div>
        <h1 className="relative text-2xl font-bold tracking-tight text-slate-900">
          Tổng quan
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Theo dõi người dùng và thanh toán realtime từ Supabase.
        </p>
      </div>

      {/* Tags */}
      <div className="relative flex flex-wrap gap-2">
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
          AI Signals
        </span>

        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          Realtime Metrics
        </span>

        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
          Predictive View
        </span>
      </div>

      {/* Stats */}
      <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(6,182,212,0.16)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              Người dùng
            </CardDescription>

            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {stats.userCount}
            </CardTitle>
          </CardHeader>

          <CardContent className="text-xs text-slate-500">
            Hoạt động: {stats.activeUsers} · Tạm khóa:{' '}
            {stats.suspendedUsers}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(6,182,212,0.16)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              Doanh thu (giao dịch đã trả)
            </CardDescription>

            <CardTitle className="text-2xl tabular-nums text-slate-900">
              {(stats.totalRevenueVnd / 1_000_000).toFixed(
                2
              )}
              M ₫
            </CardTitle>
          </CardHeader>

          <CardContent className="text-xs text-slate-500">
            Từ payment_transactions
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(6,182,212,0.16)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              Giao dịch chờ
            </CardDescription>

            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {stats.pendingPayments}
            </CardTitle>
          </CardHeader>

          <CardContent className="text-xs text-slate-500">
            Cần xác nhận / đối soát
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(6,182,212,0.16)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              Tổng giao dịch
            </CardDescription>

            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {payments.length}
            </CardTitle>
          </CardHeader>

          <CardContent className="text-xs text-slate-500">
            Realtime database
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="relative grid gap-6 lg:grid-cols-2">
        {/* Signups */}
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:shadow-[0_16px_34px_rgba(14,116,144,0.16)]">
          <CardHeader>
            <CardTitle className="text-slate-900">
              Đăng ký & hoạt động
            </CardTitle>

            <CardDescription className="text-slate-500">
              Dữ liệu realtime
            </CardDescription>
          </CardHeader>

          <CardContent className="h-[300px] pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={signups}
                margin={{
                  top: 8,
                  right: 8,
                  left: 0,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient
                    id="fillSignups"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#00E5FF"
                      stopOpacity={0.45}
                    />

                    <stop
                      offset="100%"
                      stopColor="#00E5FF"
                      stopOpacity={0}
                    />
                  </linearGradient>

                  <linearGradient
                    id="fillActiveUsers"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#2979FF"
                      stopOpacity={0.28}
                    />

                    <stop
                      offset="100%"
                      stopColor="#2979FF"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="#E2E8F0"
                />

                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    format(parseISO(d), 'dd/MM')
                  }
                  className="text-xs"
                  stroke="#64748B"
                />

                <YAxis
                  className="text-xs"
                  stroke="#64748B"
                />

                <Tooltip
                  labelFormatter={(d) =>
                    format(parseISO(String(d)), 'dd/MM/yyyy')
                  }
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: '#CBD5E1',
                    backgroundColor: '#FFFFFF',
                  }}
                />

                <Legend />

                <Area
                  type="monotone"
                  dataKey="signups"
                  name="Đăng ký mới"
                  stroke="#00E5FF"
                  strokeWidth={2.5}
                  fill="url(#fillSignups)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#00E5FF',
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  name="User hoạt động"
                  stroke="#2979FF"
                  strokeWidth={2}
                  fill="url(#fillActiveUsers)"
                  fillOpacity={1}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:shadow-[0_16px_34px_rgba(91,33,182,0.14)]">
          <CardHeader>
            <CardTitle className="text-slate-900">
              Doanh thu theo ngày
            </CardTitle>

            <CardDescription className="text-slate-500">
              Realtime revenue analytics
            </CardDescription>
          </CardHeader>

          <CardContent className="h-[300px] pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenue}
                margin={{
                  top: 8,
                  right: 8,
                  left: 0,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient
                    id="barRevenue"
                    x1="0"
                    y1="1"
                    x2="0"
                    y2="0"
                  >
                    <stop offset="0%" stopColor="#0B3D91" />
                    <stop offset="100%" stopColor="#C724FF" />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="#E2E8F0"
                />

                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    format(parseISO(d), 'dd/MM')
                  }
                  className="text-xs"
                  stroke="#64748B"
                />

                <YAxis
                  className="text-xs"
                  stroke="#64748B"
                  tickFormatter={(v) =>
                    `${Math.round(Number(v) / 1000)}k`
                  }
                />

                <Tooltip
                  formatter={(v: number) => [
                    `${v.toLocaleString('vi-VN')} ₫`,
                    'Doanh thu',
                  ]}
                  labelFormatter={(d) =>
                    format(parseISO(String(d)), 'dd/MM/yyyy')
                  }
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: '#CBD5E1',
                    backgroundColor: '#FFFFFF',
                  }}
                />

                <Bar
                  dataKey="revenueVnd"
                  name="Doanh thu (₫)"
                  fill="url(#barRevenue)"
                  radius={[10, 10, 0, 0]}
                  barSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pie */}
      <Card className="relative border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <CardHeader>
          <CardTitle className="text-slate-900">
            Trạng thái thanh toán
          </CardTitle>

          <CardDescription className="text-slate-500">
            Phân bổ giao dịch realtime
          </CardDescription>
        </CardHeader>

        <CardContent className="flex h-[280px] items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={paymentPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) =>
                  `${name}: ${value}`
                }
              >
                {paymentPie.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={
                      PAYMENT_COLORS[
                      entry.status
                      ] ?? '#888'
                    }
                  />
                ))}
              </Pie>

              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: '#CBD5E1',
                  backgroundColor: '#FFFFFF',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}