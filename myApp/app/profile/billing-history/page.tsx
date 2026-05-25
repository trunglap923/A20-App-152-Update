'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  Receipt,
  Calendar,
  Wallet,
  Hash,
  ExternalLink,
  Package,
  History
} from 'lucide-react'
import { createClient } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'react-toastify'

const supabase = createClient()

// --- Types ---

type Plan = {
  id: string
  name: string
  code: string
}

type PaymentTransaction = {
  id: string
  user_id: string
  provider: string
  billing_cycle: string
  order_code: string
  provider_transaction_id: string
  amount: number
  currency: string
  status: 'paid'
  metadata: any
  paid_at: string
  created_at: string
  plan_id: string
  plans: Plan
}

// --- Mappings ---

const STATUS_MAP = {
  paid: { label: 'Thành công', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle2 },
}

const PROVIDER_MAP: Record<string, string> = {
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  vietqr: 'VietQR',
}

// --- Utilities ---

const formatCurrency = (amount: number, currency: string = 'VND') => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function BillingHistoryPage() {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([])
  const [selectedTx, setSelectedTx] = useState<PaymentTransaction | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('payment_transactions')
          .select(`
            *,
            plans (
              id,
              name,
              code
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'paid')
          .order('created_at', { ascending: false })

        if (error) throw error

        setTransactions(data || [])
        if (data && data.length > 0) {
          setSelectedTx(data[0])
        }
      } catch (err) {
        console.error('[BILLING_HISTORY_ERROR]', err)
        toast.error('Không thể tải lịch sử giao dịch')
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [])

  const totalPaid = transactions
    .filter(t => t.status === 'paid')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse">Đang tải lịch sử giao dịch...</p>
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-8">
            <ArrowLeft className="h-4 w-4" />
            Quay lại hồ sơ
          </Link>

          <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-3xl shadow-sm">
            <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <Receipt className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Chưa có giao dịch nào</h1>
            <p className="text-muted-foreground max-w-md mb-8">
              Bạn chưa thực hiện bất kỳ giao dịch nâng cấp gói nào. Hãy khám phá các gói dịch vụ của chúng tôi.
            </p>
            <Link href="/profile/upgrade">
              <Button size="lg" className="rounded-full px-8 gap-2">
                Nâng cấp tài khoản ngay
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-20">
      {/* Header Section */}
      <div className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4 group">
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                Quay lại hồ sơ
              </Link>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Lịch sử mua gói</h1>
              <p className="text-muted-foreground mt-1">Xem và quản lý các giao dịch thanh toán của bạn</p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center gap-4"
            >
              <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary/80">Tổng chi tiêu</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(totalPaid)}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Panel: Transaction List */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 px-2">
              <History className="h-5 w-5 text-primary" />
              Danh sách giao dịch
            </h3>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-3 p-1 pr-4">
                {transactions.map((tx) => {
                  const status = STATUS_MAP[tx.status] || STATUS_MAP.paid
                  const StatusIcon = status.icon
                  const isSelected = selectedTx?.id === tx.id

                  return (
                    <motion.div
                      key={tx.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedTx(tx)}
                      className={`
                        cursor-pointer p-4 rounded-2xl border transition-all duration-200
                        ${isSelected
                          ? 'bg-card border-primary ring-1 ring-primary shadow-md'
                          : 'bg-card border-border hover:border-primary/50 hover:shadow-sm'}
                      `}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl bg-primary/5 text-primary`}>
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground">
                              {tx.plans?.name || 'Gói dịch vụ'}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(tx.created_at).toLocaleDateString('vi-VN')}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`${status.color} border-none font-medium`}>
                          {status.label}
                        </Badge>
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-muted-foreground">
                          {PROVIDER_MAP[tx.provider] || tx.provider}
                        </span>
                        <span className="font-bold text-lg">
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel: Transaction Detail */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {selectedTx && (
                <motion.div
                  key={selectedTx.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border-border rounded-3xl shadow-xl overflow-hidden bg-card">
                    <CardHeader className="bg-gradient-to-br from-primary/10 to-transparent border-b border-border/50 pb-8">
                      <div className="flex justify-between items-center mb-6">
                        <Badge variant="outline" className="rounded-full px-3 py-1 bg-background">
                          ID: {selectedTx.order_code}
                        </Badge>
                        {selectedTx.paid_at && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            Đã thanh toán lúc {new Date(selectedTx.paid_at).toLocaleTimeString('vi-VN')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg text-primary-foreground">
                          <Package className="h-8 w-8" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl font-bold">
                            {selectedTx.plans?.name || 'Gói dịch vụ'}
                          </CardTitle>
                          <CardDescription className="text-base">
                            Chu kỳ: {selectedTx.billing_cycle === 'yearly' ? 'Hàng năm' : 'Hàng tháng'}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-8 space-y-8">
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Số tiền</p>
                          <p className="text-2xl font-black text-foreground">
                            {formatCurrency(selectedTx.amount, selectedTx.currency)}
                          </p>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Trạng thái</p>
                          <div className="flex justify-end">
                            <Badge className={`${STATUS_MAP[selectedTx.status]?.color} border-none text-base px-4 py-1 rounded-full`}>
                              {STATUS_MAP[selectedTx.status]?.label}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/30 p-6 rounded-2xl border border-border/50">
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <Wallet className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-xs text-muted-foreground font-medium uppercase">Phương thức</p>
                              <p className="font-semibold">{PROVIDER_MAP[selectedTx.provider] || selectedTx.provider}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Hash className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-xs text-muted-foreground font-medium uppercase">Mã đơn hàng</p>
                              <p className="font-mono text-sm">{selectedTx.order_code}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-xs text-muted-foreground font-medium uppercase">Thời gian tạo</p>
                              <p className="font-semibold">{formatDate(selectedTx.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <ExternalLink className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-xs text-muted-foreground font-medium uppercase">Mã tham chiếu đối tác</p>
                              <p className="font-mono text-sm truncate max-w-[150px]">
                                {selectedTx.provider_transaction_id || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 flex gap-4">
                        <Button variant="outline" className="flex-1 rounded-xl h-12" onClick={() => window.print()}>
                          Tải hóa đơn (PDF)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * --- Row Level Security (RLS) Note ---
 * Table: payment_transactions
 * Select Policy: auth.uid() = user_id
 */
