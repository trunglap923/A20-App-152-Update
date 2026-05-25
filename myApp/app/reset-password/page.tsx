'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import ResetPasswordForm from './reset-password-form'

function ResetPasswordEntryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const errorDescription = searchParams.get('error_description')
    const code = searchParams.get('code')

    if (errorDescription) {
      router.replace('/404')
      return
    }

    if (code) {
      router.replace(`/reset-password/${encodeURIComponent(code)}`)
    }
  }, [router, searchParams])

  return <ResetPasswordForm />
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <Suspense fallback={<div className="text-muted-foreground">Đang tải thông tin...</div>}>
        <ResetPasswordEntryPage />
      </Suspense>
    </div>
  )
}