'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  loginWithEmail,
  loginWithGoogle,
  loginWithFacebook,
} from '@/lib/supabase/auth'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const { data, error } = await loginWithEmail(email, password)

    if (error) {
      toast.error(error.message)
      setIsLoading(false)
      return
    }

    toast.success('Đăng nhập thành công!')
    const q = new URLSearchParams()
    const r = searchParams.get('redirect')
    if (r) q.set('redirect', r)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    // Trang /auth/post-login không cần login ở proxy → không bị đẩy về /login khi
    // request đầu tới /admin chưa gửi cookie; trang đó mới replace sang /admin.
    window.location.assign(`/auth/post-login${suffix}`)
  }

  const handleGoogleLogin = async () => {
    const { error } = await loginWithGoogle()
    if (error) {
      toast.error(error.message)
    }
  }

  const handleFacebookLogin = async () => {
    const { error } = await loginWithFacebook()
    if (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
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
          <p className="text-muted-foreground">Đăng nhập vào tài khoản của bạn</p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="bg-card border border-border rounded-2xl p-8 shadow-lg"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="bạn@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-10 rounded-lg"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Mật khẩu
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
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" />
                <span className="text-muted-foreground">Nhớ mật khẩu</span>
              </label>
              <Link href="/forgot-password" className="text-primary hover:text-primary/80 transition">
                Quên mật khẩu?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 gap-2 rounded-lg"
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-4 w-4 border-2 border-transparent border-t-primary-foreground rounded-full"
                />
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">HOẶC</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-10 rounded-lg" onClick={handleGoogleLogin} type="button">
              Google
            </Button>
            <Button variant="outline" className="h-10 rounded-lg" onClick={handleFacebookLogin} type="button">
              Facebook
            </Button>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-center mt-6 text-muted-foreground"
        >
          Chưa có tài khoản?{' '}
          <Link href="/register" className="text-primary hover:text-primary/80 transition font-medium">
            Đăng ký ngay
          </Link>
        </motion.p>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
