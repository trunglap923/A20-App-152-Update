'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { logAuthEvent } from '@/lib/audit-log'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Lock, User, ArrowRight, Check } from 'lucide-react'
import { motion } from 'framer-motion'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'password') {
      let strength = 0
      if (value.length >= 8) strength++
      if (/[A-Z]/.test(value)) strength++
      if (/[0-9]/.test(value)) strength++
      if (/[^A-Za-z0-9]/.test(value)) strength++
      setPasswordStrength(strength)
    }
  }

  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error('Mật khẩu không khớp!')
      return
    }

    setIsLoading(true)
    const normalizedEmail = formData.email.trim().toLowerCase()

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: formData.password,
      options: {
        data: {
          full_name: formData.name,
        }
      }
    })

    setIsLoading(false)

    if (error) {
      await logAuthEvent({
        event: 'register',
        email: normalizedEmail,
        success: false,
        errorCode: error.message,
      })
      toast.error(error.message)
      return
    }

    // Supabase có thể không trả error khi email đã tồn tại (bật email confirmation).
    // Khi đó identities sẽ rỗng, cần chặn và báo lỗi ngay.
    const hasNoIdentity = (data.user?.identities?.length ?? 0) === 0
    if (hasNoIdentity) {
      await logAuthEvent({
        event: 'register',
        email: normalizedEmail,
        success: false,
        errorCode: 'IDENTITY_EXISTS',
      })
      toast.error('Email này đã được đăng ký. Vui lòng dùng email khác hoặc đăng nhập.')
      return
    }

    await logAuthEvent({
      event: 'register',
      email: normalizedEmail,
      success: true,
    })

    if (data.session) {
      toast.success('Đăng ký thành công!')
      window.location.assign('/dashboard')
    } else {
      toast.success('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.')
      router.push('/login')
    }
  }

  const passwordRequirements = [
    { label: 'Ít nhất 8 ký tự', met: formData.password.length >= 8 },
    { label: 'Chứa chữ hoa', met: /[A-Z]/.test(formData.password) },
    { label: 'Chứa số', met: /[0-9]/.test(formData.password) },
    { label: 'Chứa ký tự đặc biệt', met: /[^A-Za-z0-9]/.test(formData.password) },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Header */}
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
          <p className="text-muted-foreground">Tạo tài khoản mới của bạn</p>
        </div>

        {/* Form Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="bg-card border border-border rounded-2xl p-8 shadow-lg"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Họ tên
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={formData.name}
                  onChange={handleChange}
                  className="pl-10 h-10 rounded-lg"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="bạn@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  className="pl-10 h-10 rounded-lg"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  className="pl-10 h-10 rounded-lg"
                  required
                />
              </div>

              {/* Password Strength Indicator */}
              {formData.password && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-2"
                >
                  <div className="flex gap-1">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${i < passwordStrength ? 'bg-primary' : 'bg-muted'
                          }`}
                      />
                    ))}
                  </div>
                  <div className="space-y-1">
                    {passwordRequirements.map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <div className={`h-4 w-4 rounded-full flex items-center justify-center ${req.met ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                          {req.met && <Check className="h-3 w-3" />}
                        </div>
                        <span className={req.met ? 'text-muted-foreground' : 'text-muted-foreground'}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Xác nhận mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="pl-10 h-10 rounded-lg"
                  required
                />
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded mt-1" required />
              <span className="text-xs text-muted-foreground">
                Tôi đồng ý với{' '}
                <Link href="#" className="text-primary hover:text-primary/80">
                  Điều khoản dịch vụ
                </Link>
                {' '}và{' '}
                <Link href="#" className="text-primary hover:text-primary/80">
                  Chính sách riêng tư
                </Link>
              </span>
            </label>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 gap-2 rounded-lg mt-6"
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-4 w-4 border-2 border-transparent border-t-primary-foreground rounded-full"
                />
              ) : (
                <>
                  Tạo tài khoản
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </motion.div>

        {/* Login Link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-center mt-6 text-muted-foreground"
        >
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-primary hover:text-primary/80 transition font-medium">
            Đăng nhập ngay
          </Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
