'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { XCircle, ArrowLeft, RefreshCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

function FailedPaymentContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [countdown, setCountdown] = useState(10)

    const message = searchParams.get('message') || 'Giao dịch của bạn không thể hoàn tất. Vui lòng thử lại.'
    const orderId = searchParams.get('orderId') || searchParams.get('apptransid')

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer)
                    router.push('/profile/upgrade')
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [router])

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 px-4">
            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-xl text-center"
            >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <XCircle className="h-8 w-8" />
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Thanh toán thất bại
                </h1>

                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {message}
                </p>

                {orderId && (
                    <div className="mt-4 text-xs text-muted-foreground bg-muted/30 py-2 rounded-lg">
                        Mã đơn hàng: <span className="font-mono font-medium">{orderId}</span>
                    </div>
                )}

                <div className="mt-8 flex flex-col gap-3">
                    <Button
                        onClick={() => router.push('/profile/upgrade')}
                        className="w-full rounded-xl bg-primary h-12 text-sm font-medium transition"
                    >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Thử lại ngay
                    </Button>
                    
                    <Button
                        variant="outline"
                        onClick={() => router.push('/profile')}
                        className="w-full rounded-xl h-12 text-sm font-medium transition"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Quay lại hồ sơ
                    </Button>
                </div>

                <div className="mt-6">
                    <p className="text-xs text-muted-foreground italic">
                        Tự động quay lại trang nâng cấp sau {countdown}s
                    </p>
                </div>
            </motion.div>
        </div>
    )
}

export default function PaymentFailedPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
        }>
            <FailedPaymentContent />
        </Suspense>
    )
}
