'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

function PaymentSuccessContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [countdown, setCountdown] = useState(5)

    // Detect provider and status
    const momoResultCode = searchParams.get('resultCode')
    const zaloStatus = searchParams.get('status')
    
    const isMomo = momoResultCode !== null
    const isZalo = zaloStatus !== null

    const provider = useMemo(() => {
        if (isMomo) return 'MoMo'
        if (isZalo) return 'ZaloPay'
        return 'Thanh toán'
    }, [isMomo, isZalo])

    const orderId = searchParams.get('orderId') || searchParams.get('apptransid')
    const amount = searchParams.get('amount')

    useEffect(() => {
        // Redirect to failed page if payment failed
        if (isMomo && momoResultCode !== '0') {
            const message = searchParams.get('message') || 'Giao dịch MoMo thất bại'
            router.push(`/payment/failed?message=${encodeURIComponent(message)}&orderId=${orderId}`)
            return
        }

        if (isZalo && zaloStatus !== '1') {
            router.push(`/payment/failed?message=${encodeURIComponent('Giao dịch ZaloPay thất bại')}&orderId=${orderId}`)
            return
        }

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer)
                    router.push('/profile')
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [router, isMomo, momoResultCode, isZalo, zaloStatus, orderId, searchParams])

    // If we are redirecting to failed page, show a loader briefly
    if ((isMomo && momoResultCode !== '0') || (isZalo && zaloStatus !== '1')) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-xl text-center"
            >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckCircle2 className="h-8 w-8" />
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Thanh toán thành công
                </h1>

                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Giao dịch qua <span className="font-bold text-foreground">{provider}</span> đã hoàn tất. 
                    Gói dịch vụ của bạn đang được kích hoạt.
                </p>

                <div className="mt-6 space-y-2 rounded-2xl bg-muted/30 p-4 text-sm">
                    {orderId && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Mã đơn hàng</span>
                            <span className="font-medium font-mono">{orderId}</span>
                        </div>
                    )}
                    {amount && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Số tiền</span>
                            <span className="font-bold text-primary">
                                {Number(amount).toLocaleString('vi-VN')}đ
                            </span>
                        </div>
                    )}
                </div>

                <div className="mt-8">
                    <Button
                        onClick={() => router.push('/profile')}
                        className="w-full rounded-xl bg-primary h-12 text-sm font-medium transition hover:shadow-lg hover:shadow-primary/20"
                    >
                        Tiếp tục ngay
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>

                <div className="mt-6">
                    <p className="text-xs text-muted-foreground">
                        Hệ thống sẽ tự động chuyển hướng sau{' '}
                        <span className="font-bold text-primary">{countdown}s</span>
                    </p>
                </div>
            </motion.div>
        </div>
    )
}

export default function PaymentSuccessPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
        }>
            <PaymentSuccessContent />
        </Suspense>
    )
}