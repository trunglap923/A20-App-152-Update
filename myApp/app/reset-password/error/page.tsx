'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Mail, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  'expired-or-used': {
    title: 'Link đã hết hạn hoặc đã được sử dụng',
    description: 'Vì lý do bảo mật, mỗi link đặt lại mật khẩu chỉ dùng được một lần. Vui lòng yêu cầu link mới.',
  },
  'invalid-link': {
    title: 'Link không hợp lệ',
    description: 'Link đặt lại mật khẩu không đúng định dạng hoặc thiếu thông tin xác thực.',
  },
  default: {
    title: 'Không thể đặt lại mật khẩu',
    description: 'Đã xảy ra lỗi trong quá trình xác thực link. Vui lòng thử lại bằng một link mới.',
  },
}

function ResetPasswordErrorContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason') ?? 'default'
  const content = ERROR_MESSAGES[reason] ?? ERROR_MESSAGES.default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-lg"
      >
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-foreground text-center">{content.title}</h1>
        <p className="text-sm text-muted-foreground text-center mt-3">{content.description}</p>

        <div className="mt-6 space-y-3">
          <Link href="/forgot-password" className="block">
            <Button className="w-full gap-2">
              <Mail className="h-4 w-4" />
              Gửi lại link đổi mật khẩu
            </Button>
          </Link>
          <Link href="/login" className="block">
            <Button variant="outline" className="w-full gap-2">
              <RefreshCcw className="h-4 w-4" />
              Quay lại đăng nhập
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

export default function ResetPasswordErrorPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Đang tải thông tin...</div>}>
      <ResetPasswordErrorContent />
    </Suspense>
  )
}
