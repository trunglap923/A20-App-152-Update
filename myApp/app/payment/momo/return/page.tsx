'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PaymentState = 'loading' | 'success' | 'failed'

function MomoReturnContent() {
    const searchParams = useSearchParams()
    const [state, setState] = useState<PaymentState>('loading')

    const resultCode = searchParams.get('resultCode')
    const message = searchParams.get('message')
    const orderId = searchParams.get('orderId')
    const requestId = searchParams.get('requestId')

    const isSuccess = useMemo(() => resultCode === '0', [resultCode])

    useEffect(() => {
        // Đây chỉ là trang hiển thị UI sau redirect từ MoMo.
        // DB KHÔNG update ở đây — webhook mới là source of truth.
        const timer = setTimeout(() => {
            setState(isSuccess ? 'success' : 'failed')
        }, 1200)

        return () => clearTimeout(timer)
    }, [isSuccess])

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
            <div className="mx-auto max-w-xl">
                <Link
                    href="/profile/upgrade"
                    className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Quay lại trang nâng cấp
                </Link>

                <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                    <div className="border-b bg-muted/30 px-6 py-5">
                        <h1 className="text-xl font-bold">Kết quả thanh toán MoMo</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Hệ thống đang đồng bộ trạng thái giao dịch của bạn
                        </p>
                    </div>

                    <div className="px-6 py-8">
                        {state === 'loading' && (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>

                                <h2 className="text-xl font-bold">Đang xác nhận giao dịch...</h2>
                                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                                    Giao dịch đã được gửi từ MoMo. Hệ thống đang xác nhận và cập nhật
                                    gói của bạn.
                                </p>
                            </div>
                        )}

                        {state === 'success' && (
                            <div className="flex flex-col items-center justify-center py-4 text-center">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                                    <CheckCircle2 className="h-8 w-8" />
                                </div>

                                <h2 className="text-2xl font-bold">Thanh toán thành công</h2>
                                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                                    Giao dịch MoMo đã được ghi nhận. Gói của bạn sẽ được kích hoạt ngay
                                    sau khi webhook hoàn tất xử lý.
                                </p>

                                <div className="mt-6 w-full rounded-2xl border bg-muted/40 p-4 text-left text-sm">
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Mã giao dịch</span>
                                        <span className="font-medium">{orderId || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Request ID</span>
                                        <span className="font-medium">{requestId || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Trạng thái</span>
                                        <span className="font-medium text-green-600">Thành công</span>
                                    </div>
                                </div>

                                <div className="mt-6 flex w-full gap-3">
                                    <Button asChild variant="outline" className="flex-1">
                                        <Link href="/profile">Về hồ sơ</Link>
                                    </Button>
                                    <Button asChild className="flex-1">
                                        <Link href="/profile/upgrade">Xem gói</Link>
                                    </Button>
                                </div>
                            </div>
                        )}

                        {state === 'failed' && (
                            <div className="flex flex-col items-center justify-center py-4 text-center">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                                    <XCircle className="h-8 w-8" />
                                </div>

                                <h2 className="text-2xl font-bold">Thanh toán thất bại</h2>
                                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                                    Giao dịch chưa hoàn tất hoặc đã bị hủy trên MoMo. Bạn có thể thử lại
                                    bất kỳ lúc nào.
                                </p>

                                <div className="mt-6 w-full rounded-2xl border bg-muted/40 p-4 text-left text-sm">
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Mã giao dịch</span>
                                        <span className="font-medium">{orderId || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Mã lỗi</span>
                                        <span className="font-medium">{resultCode || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Thông báo</span>
                                        <span className={cn('font-medium text-right')}>
                                            {message || 'Giao dịch thất bại'}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6 flex w-full gap-3">
                                    <Button asChild variant="outline" className="flex-1">
                                        <Link href="/profile">Về hồ sơ</Link>
                                    </Button>
                                    <Button asChild className="flex-1">
                                        <Link href="/profile/upgrade">Thử lại</Link>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function MomoReturnPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            }
        >
            <MomoReturnContent />
        </Suspense>
    )
}