'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CreditCard, Wallet } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type BillingRow = {
  id: string
  created_at: string
  amount: number
  provider: string
  status: string
  user_email: string
  description: string
}

type UsageRow = {
  userEmail: string
  costVnd: number
}

function payStatus(s: string) {
  if (s === 'paid') {
    return (
      <Badge className="border border-[#10B981] bg-[#10B981]/10 text-[#0F9F6E] hover:bg-[#10B981]/15">
        Đã trả
      </Badge>
    )
  }

  if (s === 'pending') {
    return (
      <Badge className="border border-[#FF8A00] bg-[#FF8A00]/10 text-[#D97706] hover:bg-[#FF8A00]/15">
        Chờ
      </Badge>
    )
  }

  return (
    <Badge className="border border-[#DC143C] bg-[#DC143C]/10 text-[#C11235] hover:bg-[#DC143C]/15">
      Lỗi
    </Badge>
  )
}

function paymentMethod(method: string) {
  const m = method.toLowerCase()

  const iconClass = 'h-4 w-4 text-cyan-600'

  if (
    m.includes('momo') ||
    m.includes('wallet') ||
    m.includes('ví')
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs uppercase text-cyan-700">
        <Wallet className={iconClass} />
        {method}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs uppercase text-cyan-700">
      <CreditCard className={iconClass} />
      {method}
    </span>
  )
}

export default function AdminBillingPage() {
  const [billing, setBilling] = useState<BillingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBilling = async () => {
      try {
        const res = await fetch('/api/admin/billing')

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed')
        }

        setBilling(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchBilling()
  }, [])

  const billingSorted = useMemo(() => {
    return [...billing].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )
  }, [billing])

  const totalPaid = useMemo(() => {
    return billing
      .filter((b) => b.status === 'paid')
      .reduce((sum, b) => sum + b.amount, 0)
  }, [billing])

  const paidUsers = useMemo(() => {
    return new Set(
      billing
        .filter((b) => b.status === 'paid')
        .map((b) => b.user_email)
    ).size
  }, [billing])

  const usage: UsageRow[] = useMemo(() => {
    const grouped: Record<string, number> = {}

    billing
      .filter((b) => b.status === 'paid')
      .forEach((b) => {
        grouped[b.user_email] =
          (grouped[b.user_email] || 0) + b.amount
      })

    return Object.entries(grouped)
      .map(([userEmail, costVnd]) => ({
        userEmail,
        costVnd,
      }))
      .sort((a, b) => b.costVnd - a.costVnd)
      .slice(0, 10)
  }, [billing])

  return (
    <div className="relative space-y-8 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/70 to-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.1),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(199,36,255,0.1),transparent_35%)]" />

      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />

      <div>
        <h1 className="relative text-2xl font-bold tracking-tight text-slate-900">
          Thanh toán & mức dùng
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Dữ liệu realtime từ payment_transactions.
        </p>
      </div>

      <div className="relative flex flex-wrap gap-2">
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
          Payment Intelligence
        </span>

        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
          Usage Forecast
        </span>
      </div>

      <div className="relative grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              Tổng đã thanh toán
            </CardDescription>

            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {totalPaid.toLocaleString('vi-VN')} ₫
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              Tổng giao dịch
            </CardDescription>

            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {billing.length}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">
              User trả phí
            </CardDescription>

            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {paidUsers}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="relative rounded-2xl border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <CardHeader>
          <CardTitle className="text-slate-900">
            Top user chi tiêu
          </CardTitle>

          <CardDescription className="text-slate-500">
            Tổng tiền đã thanh toán
          </CardDescription>
        </CardHeader>

        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={usage}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            >
              <defs>
                <linearGradient
                  id="energyBar"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#0B3D91" />
                  <stop offset="60%" stopColor="#6D28D9" />
                  <stop offset="100%" stopColor="#00E5FF" />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#E2E8F0"
                horizontal={false}
              />

              <XAxis
                type="number"
                className="text-xs"
                stroke="#64748B"
              />

              <YAxis
                type="category"
                dataKey="userEmail"
                width={160}
                className="text-xs"
                stroke="#64748B"
                tickFormatter={(v) =>
                  v.length > 18 ? `${v.slice(0, 16)}…` : v
                }
              />

              <Tooltip
                formatter={(value: number) => [
                  `${value.toLocaleString('vi-VN')} ₫`,
                  'Đã trả',
                ]}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: '#CBD5E1',
                  backgroundColor: '#FFFFFF',
                }}
              />

              <Bar
                dataKey="costVnd"
                name="Chi phí (₫)"
                fill="url(#energyBar)"
                radius={[0, 10, 10, 0]}
                barSize={10}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Giao dịch gần đây
        </h2>

        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">
              Đang tải giao dịch...
            </div>
          ) : billingSorted.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              Chưa có giao dịch nào
            </div>
          ) : (
            <Table className="[&_td]:border-r-0 [&_th]:border-r-0">
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead className="text-slate-600">
                    Thời điểm
                  </TableHead>

                  <TableHead className="text-slate-600">
                    User
                  </TableHead>

                  <TableHead className="text-slate-600">
                    Mô tả
                  </TableHead>

                  <TableHead className="text-slate-600">
                    Số tiền
                  </TableHead>

                  <TableHead className="text-slate-600">
                    Cổng
                  </TableHead>

                  <TableHead className="text-slate-600">
                    Trạng thái
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {billingSorted.map((b) => (
                  <TableRow
                    key={b.id}
                    className="border-slate-100 transition-colors hover:bg-slate-100/70"
                  >
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {format(
                        parseISO(b.created_at),
                        'dd/MM/yyyy HH:mm'
                      )}
                    </TableCell>

                    <TableCell className="text-sm font-medium text-slate-900">
                      {b.user_email}
                    </TableCell>

                    <TableCell className="text-sm text-slate-500">
                      {b.description}
                    </TableCell>

                    <TableCell className="tabular-nums text-slate-700">
                      {b.amount.toLocaleString('vi-VN')} ₫
                    </TableCell>

                    <TableCell>
                      {paymentMethod(b.provider)}
                    </TableCell>

                    <TableCell>
                      {payStatus(b.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}