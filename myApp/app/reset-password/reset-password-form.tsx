'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Lock } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { logAuthEvent } from '@/lib/audit-log'

type ResetPasswordFormProps = {
  recoveryCode?: string
}

export default function ResetPasswordForm({ recoveryCode }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isError, setIsError] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const code = useMemo(() => recoveryCode ?? searchParams.get('code'), [recoveryCode, searchParams])
  const usedCodesStorageKey = 'used-reset-password-codes'

  useEffect(() => {
    if (!code) return

    try {
      const raw = window.localStorage.getItem(usedCodesStorageKey)
      const usedCodes: string[] = raw ? JSON.parse(raw) : []
      if (usedCodes.includes(code)) {
        router.replace('/404')
      }
    } catch {
      // Ignore malformed storage payloads and continue normal flow.
    }
  }, [code, router])

  const passwordRequirements = [
    { label: 'Ít nhất 8 ký tự', met: password.length >= 8 },
    { label: 'Chứa chữ hoa', met: /[A-Z]/.test(password) },
    { label: 'Chứa số', met: /[0-9]/.test(password) },
    { label: 'Chứa ký tự đặc biệt', met: /[^A-Za-z0-9]/.test(password) },
  ]
  const strength = passwordRequirements.filter((item) => item.met).length
  const isPasswordValid = strength === passwordRequirements.length

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setIsError(false)

    if (!code) {
      setIsError(true)
      setMessage('Link đặt lại mật khẩu không hợp lệ hoặc thiếu mã xác thực')
      return
    }

    if (!isPasswordValid) {
      setIsError(true)
      setMessage('Mật khẩu chưa đáp ứng đủ điều kiện bảo mật')
      return
    }

    if (password !== confirmPassword) {
      setIsError(true)
      setMessage('Mật khẩu nhập lại không khớp')
      return
    }

    setLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeError) {
        await logAuthEvent({
          event: 'password_reset',
          success: false,
          errorCode: exchangeError.message,
        })
        setLoading(false)
        router.replace('/404')
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      await logAuthEvent({
        event: 'password_reset',
        success: false,
        errorCode: error.message,
      })
      setIsError(true)
      setMessage('Đổi mật khẩu thất bại')
      setLoading(false)
      return
    }

    setMessage('')
    try {
      const raw = window.localStorage.getItem(usedCodesStorageKey)
      const usedCodes: string[] = raw ? JSON.parse(raw) : []
      if (!usedCodes.includes(code)) {
        usedCodes.push(code)
      }
      window.localStorage.setItem(usedCodesStorageKey, JSON.stringify(usedCodes))
    } catch {
      // Non-blocking storage write.
    }
    setLoading(false)
    await logAuthEvent({
      event: 'password_reset',
      success: true,
    })
    toast.success('Đổi mật khẩu thành công!')
    router.replace('/login')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center mb-4">
            <Image
              src="/android-chrome-192x192.png"
              alt="Nexus Logo"
              width={64}
              height={64}
              className="rounded-xl shadow-lg"
              priority
            />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Nexus</h1>
        <p className="text-muted-foreground">Đặt lại mật khẩu của bạn</p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-card border border-border rounded-2xl p-8 shadow-lg"
      >
        <form onSubmit={handleReset} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Mật khẩu mới
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-10 rounded-lg"
                required
              />
            </div>
            {password && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-1">
                <div className="flex gap-1">
                  {[...Array(4)].map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 flex-1 rounded-full transition-colors ${idx < strength ? 'bg-primary' : 'bg-muted'}`}
                    />
                  ))}
                </div>
                <div className="space-y-1">
                  {passwordRequirements.map((requirement) => (
                    <div key={requirement.label} className="flex items-center gap-2 text-xs">
                      <div
                        className={`h-4 w-4 rounded-full flex items-center justify-center ${requirement.met ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
                      >
                        {requirement.met && <Check className="h-3 w-3" />}
                      </div>
                      <span className="text-muted-foreground">{requirement.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              Nhập lại mật khẩu
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 h-10 rounded-lg"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 gap-2 rounded-lg"
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="h-4 w-4 border-2 border-transparent border-t-primary-foreground rounded-full"
              />
            ) : (
              <>
                Đổi mật khẩu
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {message && (
          <p className={`mt-4 text-center text-sm ${isError ? 'text-destructive' : 'text-primary'}`}>
            {message}
          </p>
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="text-center mt-6 text-muted-foreground"
      >
        Quay lại{' '}
        <Link href="/login" className="text-primary hover:text-primary/80 transition font-medium">
          Đăng nhập
        </Link>
      </motion.p>
    </motion.div>
  )
}
