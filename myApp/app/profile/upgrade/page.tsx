'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Check,
  ArrowLeft,
  QrCode,
  Wallet,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

type Plan = {
  id: string
  code: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  credits_monthly: number
  credits_yearly: number
  features: string[]
  is_active?: boolean
  highlighted?: boolean
}


const paymentMethods = [
  { id: 'vietqr', name: 'VietQR', icon: QrCode, badge: 'Realtime' },
  //{ id: 'momo', name: 'MoMo', icon: Smartphone },
  { id: 'zalopay', name: 'ZaloPay', icon: Wallet, badge: 'Phổ biến' },
]


function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

function PricingCard({
  plan,
  isYearly,
  onSelect,
}: {
  plan: Plan
  isYearly: boolean
  onSelect: (plan: Plan) => void
}) {
  const price = isYearly ? plan.price_yearly : plan.price_monthly

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm',
        plan.highlighted
          ? 'border-primary ring-1 ring-primary shadow-md shadow-primary/10'
          : 'border-border'
      )}
    >
      {plan.highlighted && (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          Phổ biến nhất
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-xl font-bold">{plan.name}</h3>
        <p className="mt-2 h-10 text-sm text-muted-foreground">
          {plan.description}
        </p>
      </div>

      <div className="mb-6 flex items-baseline">
        <span className="text-4xl font-extrabold tracking-tight">
          {price === 0 ? 'Miễn phí' : formatCurrency(price)}
        </span>
        {price > 0 && (
          <span className="ml-1 font-medium text-muted-foreground">
            /{isYearly ? 'năm' : 'tháng'}
          </span>
        )}
      </div>
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground">
          Credit mỗi {isYearly ? 'năm' : 'tháng'}
        </p>

        <p className="mt-1 text-3xl font-extrabold text-primary">
          {isYearly
            ? plan.credits_yearly.toLocaleString('vi-VN')
            : plan.credits_monthly.toLocaleString('vi-VN')}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {isYearly && (
            <>
              Bao gồm bonus miễn phí 1 tháng đầu tiên
            </>
          )}
        </p>
      </div>

      <ul className="mb-8 flex-1 space-y-3">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-center text-sm text-muted-foreground">
            <Check className="mr-3 h-4 w-4 flex-shrink-0 text-primary" />
            {feature}
          </li>
        ))}
      </ul>

      <Button
        variant={plan.highlighted ? 'default' : 'outline'}
        className="h-11 w-full"
        onClick={() => onSelect(plan)}
        disabled={price === 0}
      >
        {price === 0 ? 'Gói hiện tại' : 'Nâng cấp ngay'}
      </Button>
    </motion.div>
  )
}

function PaymentModal({
  isOpen,
  onClose,
  plan,
  isYearly,
}: {
  isOpen: boolean
  onClose: () => void
  plan: Plan | null
  isYearly: boolean
}) {
  const router = useRouter()
  const [selectedMethod, setSelectedMethod] = useState('vietqr')
  const [paymentState, setPaymentState] = useState<
    'idle' | 'loading' | 'success' | 'fail' | 'redirecting'
  >('idle')

  const [qrData, setQrData] = useState<{
    order_code: string
    amount: number
    qr_url: string
    expired_at?: string
  } | null>(null)

  const [checkingPayment, setCheckingPayment] = useState(false)
  const [countdown, setCountdown] = useState('')


  useEffect(() => {
    if (isOpen) {
      setSelectedMethod('vietqr')
      setPaymentState('idle')
      setQrData(null)
      setCountdown('')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (!qrData?.order_code) return


    let interval: NodeJS.Timeout

    const checkPayment = async () => {
      try {
        setCheckingPayment(true)
        const res = await fetch(
          `/api/payment/status?order_code=${qrData.order_code}`
        )

        const data = await res.json()

        if (data.status === 'paid') {
          clearInterval(interval)

          setPaymentState('success')
        }

        if (data.status === 'expired') {
          clearInterval(interval)

          setPaymentState('fail')
        }
      } catch (error) {
        console.error('[CHECK_PAYMENT]', error)
      } finally {
        setCheckingPayment(false)
      }


    }

    interval = setInterval(checkPayment, 3000)

    checkPayment()

    return () => clearInterval(interval)
  }, [qrData])

  useEffect(() => {
    if (!qrData?.expired_at) return

    const interval = setInterval(() => {
      const now = Date.now()


      const expire = new Date(
        qrData.expired_at!
      ).getTime()

      const diff = expire - now

      if (diff <= 0) {
        setCountdown('Hết hạn')
        clearInterval(interval)
        return
      }

      const minutes = Math.floor(diff / 60000)

      const seconds = Math.floor(
        (diff % 60000) / 1000
      )

      setCountdown(
        `${minutes}:${seconds
          .toString()
          .padStart(2, '0')
        }`
      )


    }, 1000)

    return () => clearInterval(interval)
  }, [qrData])

  if (!plan) return null

  const price = isYearly ? plan.price_yearly : plan.price_monthly
  const methodObj = paymentMethods.find((m) => m.id === selectedMethod)

  const handlePayment = async () => {
    try {
      setPaymentState('loading')

      if (selectedMethod === 'vietqr') {
        const res = await fetch('/api/payment/vietqr/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_code: plan.code,
            billing_cycle: isYearly ? 'yearly' : 'monthly',
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || 'Không tạo được giao dịch VietQR')
        }

        setQrData(data)
        setPaymentState('idle')
        return
      }

      if (selectedMethod === 'momo') {
        const res = await fetch('/api/payment/momo/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_code: plan.code,
            billing_cycle: isYearly ? 'yearly' : 'monthly',
          }),
        })

        const data = await res.json()

        if (!res.ok) throw new Error(data?.error || 'Không tạo được thanh toán MoMo')

        if (data?.payUrl) {
          window.location.href = data.payUrl
          return
        }

        throw new Error('MoMo không trả về payUrl')
      }

      if (selectedMethod === 'zalopay') {
        const res = await fetch('/api/payment/zalopay/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_code: plan.code,
            billing_cycle: isYearly ? 'yearly' : 'monthly',
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || 'Không thể tạo thanh toán ZaloPay')
        }

        if (data.order_url) {
          window.location.href = data.order_url
          return
        }

        if (data.zp_trans_token) {
          window.location.href = `zalopay://payment?zptoken=${data.zp_trans_token}`
          return
        }

        throw new Error('Không lấy được link thanh toán ZaloPay')
      }

      throw new Error('Phương thức thanh toán không hợp lệ')
    } catch (error) {
      console.error('[PAYMENT_ERROR]', error)
      setPaymentState('fail')
    }
  }

  const renderPaymentContent = () => {
    if (paymentState === 'loading') {
      return (
        <div className="flex flex-col items-center justify-center space-y-4 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Đang xử lý giao dịch...
          </p>
        </div>
      )
    }

    if (paymentState === 'success') {
      return (
        <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold">Thanh toán thành công!</h3>
          <p className="text-sm text-muted-foreground">
            Bạn đã nâng cấp thành công lên gói {plan.name}.
          </p>
          <Button className="mt-4 w-full" onClick={onClose}>
            Tiếp tục
          </Button>
        </div>
      )
    }

    if (paymentState === 'fail') {
      return (
        <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold">Giao dịch thất bại</h3>
          <p className="text-sm text-muted-foreground">
            Có lỗi xảy ra trong quá trình thanh toán. Vui lòng thử lại.
          </p>
          <div className="mt-4 flex w-full gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Hủy
            </Button>
            <Button className="flex-1" onClick={() => setPaymentState('idle')}>
              Thử lại
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm text-muted-foreground">Gói đã chọn</p>
            <p className="font-semibold">
              {plan.name} ({isYearly ? 'Hàng năm' : 'Hàng tháng'})
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Tổng thanh toán</p>
            <p className="font-bold text-primary">{formatCurrency(price)}</p>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">Chọn phương thức thanh toán</p>
          <div className="grid gap-2">
            {paymentMethods.map((method) => {
              const Icon = method.icon
              const isSelected = selectedMethod === method.id

              return (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  className={cn(
                    'flex items-center justify-between rounded-lg border p-3 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span
                      className={cn(
                        'font-medium',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {method.name}
                    </span>
                  </div>

                  {method.badge && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                      {method.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="pt-2">
          {selectedMethod === 'vietqr' ? (
            !qrData ? (
              <div className="space-y-4 rounded-2xl border bg-card p-5 text-center shadow-sm">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
                  <QrCode className="h-10 w-10 text-primary" />
                </div>

                <div>
                  <p className="font-medium">Thanh toán bằng VietQR</p>
                  <p className="text-sm text-muted-foreground">
                    Nhấn nút bên dưới để tạo mã QR thanh toán
                  </p>
                </div>

                <Button className="w-full" onClick={handlePayment}>
                  Tạo mã thanh toán
                </Button>
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border bg-card p-6 text-center">
                <div className="mx-auto w-44 rounded-xl border bg-white p-2 shadow-sm">
                  <img
                    src={qrData.qr_url}
                    alt="VietQR"
                    className="h-auto w-full rounded-md"
                  />
                </div>

                <div>
                  <p className="font-medium">Quét mã để thanh toán</p>
                  <p className="text-sm text-muted-foreground">
                    Nội dung chuyển khoản đã được tạo sẵn
                  </p>
                </div>

                <div className="rounded-lg bg-muted/50 p-3 text-left text-sm">
                  <p><span className="font-medium">Mã đơn:</span> {qrData.order_code}</p>
                  <p><span className="font-medium">Số tiền:</span> {formatCurrency(qrData.amount)}</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />

                      <span className="text-sm font-medium text-primary">
                        Đang chờ thanh toán...
                      </span>
                    </div>

                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Hệ thống sẽ tự động xác nhận sau khi bạn chuyển khoản
                    </p>

                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      QR hết hạn sau
                    </p>
                    <p className="mt-1 text-lg font-bold text-primary">
                      {countdown}
                    </p>

                  </div>

                  {/* {checkingPayment && (<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"> <Loader2 className="h-3 w-3 animate-spin" />
                    Kiểm tra giao dịch...
                  </div>
                  )} */}

                </div>

              </div>
            )
          ) : (
            <Button className="h-12 w-full text-md" onClick={handlePayment}>
              Chuyển hướng đến {methodObj?.name}
            </Button>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Thanh toán nhanh qua QR hoặc ví điện tử. Giao dịch được bảo mật an toàn.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Khi user đóng dialog (bấm X, click ra ngoài, nhấn ESC)
        // và trạng thái đang là success => luôn chuyển về /profile
        if (!open) {
          if (paymentState === 'success') {
            onClose()
            router.push('/profile')
            router.refresh()
          } else {
            onClose()
          }
        }
      }}
    >
      <DialogContent className="w-[95vw] max-w-[560px] overflow-hidden rounded-2xl border bg-background p-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Thanh toán nâng cấp
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Hoàn tất thanh toán để kích hoạt gói{' '}
            <span className="font-medium text-foreground">{plan.name}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="max-h-[80vh] overflow-y-auto px-6 py-5 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {renderPaymentContent()}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function UpgradePage() {
  const [isYearly, setIsYearly] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch('/api/plans')
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Không tải được gói')
        }

        setPlans(
          data.plans.map((plan: any) => ({
            ...plan,
            features: Array.isArray(plan.features) ? plan.features : [],
            highlighted: plan.code === 'pro',
          }))
        )
      } catch (error) {
        console.error('[FETCH_PLANS]', error)
      } finally {
        setLoadingPlans(false)
      }
    }

    fetchPlans()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-20">
      <div className="sticky top-0 z-10 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8 sm:py-6">
          <Link
            href="/profile"
            className="mb-4 inline-flex items-center gap-2 text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại hồ sơ
          </Link>
          <h1 className="text-3xl font-bold">Nâng cấp tài khoản</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Chọn gói phù hợp với bạn
          </h2>
          <p className="text-lg text-muted-foreground">
            Trải nghiệm toàn bộ tính năng cao cấp để tối ưu hóa công việc của bạn.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className={cn(
                'text-sm font-medium',
                !isYearly ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Hàng tháng
            </span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'text-sm font-medium',
                  isYearly ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                Hàng năm
              </span>
              <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">
                Giảm 16%
              </span>
            </div>
          </div>
        </div>

        {loadingPlans ? (
          <div className="py-12 text-center text-muted-foreground">
            Đang tải gói dịch vụ...
          </div>
        ) : plans.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Không có gói nào khả dụng
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                isYearly={isYearly}
                onSelect={setSelectedPlan}
              />
            ))}
          </div>
        )}
      </div>

      <PaymentModal
        isOpen={!!selectedPlan}
        onClose={() => setSelectedPlan(null)}
        plan={selectedPlan}
        isYearly={isYearly}
      />
    </div>
  )
}