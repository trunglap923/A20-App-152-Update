'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, User, Mail, Phone, Calendar, Save, X, Pencil, Settings, KeyRound, LogOut, Upload, Crown, Coins, TrendingDown, TrendingUp, ArrowUpRight, ArrowDownRight, History } from 'lucide-react'
import type { CreditsApiResponse, CreditTransaction } from '@/lib/types'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabaseClient'
import { getUserProfile, updateUserProfile, type UserProfile } from '@/lib/supabase/user'
import { secureSignOut } from '@/lib/supabase/secure-signout'
import { cn } from '@/lib/utils'
import { toast } from 'react-toastify'

const supabase = createClient()

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [tempProfile, setTempProfile] = useState<UserProfile | null>(null)

  // Avatar states
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const [subscription, setSubscription] = useState<any>(null)
  const [hasPurchased, setHasPurchased] = useState(false)
  const [creditsData, setCreditsData] = useState<CreditsApiResponse | null>(null)
  // Cleanup preview URL khi component unmount hoặc thay đổi
  useEffect(() => {
    let channel: any;

    const getUser = async () => {
      try {
        const data = await getUserProfile()

        if (data) {
          setProfile(data)
          setTempProfile(data)
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: activeSub } = await supabase
          .from('subscriptions')
          .select(`*, plans (id, code, name)`)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gt('ends_at', new Date().toISOString())
          .maybeSingle()

        setSubscription(activeSub)

        const { data: transactions } = await supabase
          .from('payment_transactions')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'paid')
          .limit(1)

        setHasPurchased(!!transactions?.length)

        // Initial fetch credits
        fetchCredits(user.id)

        // Realtime listener
        const channelName = `profile-credits-${user.id}`
        console.log(`[REALTIME] Subscribing to ${channelName}`)

        channel = supabase
          .channel(channelName)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'user_credits',
            filter: `user_id=eq.${user.id}`
          }, (payload: any) => {
            console.log('[REALTIME] Received credit update:', payload)
            fetchCredits(user.id)
          })
          .subscribe((status: string) => {
            console.log(`[REALTIME] Subscription status for ${channelName}:`, status)
          })

      } catch (err) {
        console.error(err)
        toast.error('Không thể tải thông tin hồ sơ')
      }
    }

    const fetchCredits = async (userId: string) => {
      try {
        const { data: userCredits } = await supabase
          .from('user_credits')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        const { data: creditTxs } = await supabase
          .from('credit_transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20)

        setCreditsData({
          balance: userCredits ? Number(userCredits.balance) : 50,
          total_purchased: userCredits ? Number(userCredits.total_purchased) : 0,
          total_used: userCredits ? Number(userCredits.total_used) : 0,
          transactions: creditTxs || [],
        })
      } catch (err) {
        console.error('[CREDITS_FETCH]', err)
      }
    }

    getUser()

    return () => {
      if (channel) {
        console.log('[REALTIME] Unsubscribing...')
        supabase.removeChannel(channel)
      }
    }
  }, [])



  const revokePreview = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview)
      setAvatarPreview(null)
    }
  }

  const handleEdit = () => {
    if (!profile) return
    setIsEditing(true)
    setTempProfile(profile)
    setSelectedAvatar(null)
    revokePreview()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validation
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ảnh phải nhỏ hơn 2MB')
      return
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Chỉ hỗ trợ file JPG, PNG, WebP')
      return
    }

    // Revoke URL cũ trước khi tạo mới
    revokePreview()

    setSelectedAvatar(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const uploadAvatar = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Vui lòng đăng nhập lại')
        return null
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png'
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        toast.error('Tải ảnh lên thất bại: ' + uploadError.message)
        return null
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      return data.publicUrl
    } catch (err: any) {
      console.error(err)
      toast.error('Có lỗi xảy ra khi tải ảnh lên')
      return null
    }
  }

  const handleSave = async () => {
    if (!tempProfile) return

    let newAvatarUrl = profile?.avatarUrl

    // Upload avatar nếu có
    if (selectedAvatar) {
      setIsUploading(true)
      const uploadedUrl = await uploadAvatar(selectedAvatar)
      if (uploadedUrl) newAvatarUrl = uploadedUrl
      setIsUploading(false)
    }

    // Validation
    const normalizedPhone = tempProfile.phoneNumber?.trim() || ''
    const birthDate = tempProfile.birthDate
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (normalizedPhone) {
      const phoneRegex = /^(02\d{8,9}|03\d{8}|05\d{8}|07\d{8}|08\d{8}|09\d{8})$/
      if (!phoneRegex.test(normalizedPhone)) {
        toast.error('Số điện thoại không hợp lệ.')
        return
      }
    }

    if (birthDate) {
      const selectedDate = new Date(`${birthDate}T00:00:00`)
      if (Number.isNaN(selectedDate.getTime()) || selectedDate >= today) {
        toast.error('Ngày sinh phải nhỏ hơn ngày hiện tại.')
        return
      }
    }

    try {
      await updateUserProfile({
        phoneNumber: normalizedPhone,
        birthDate: birthDate,
        avatarUrl: newAvatarUrl,
      })

      setProfile((prev) =>
        prev
          ? {
            ...prev,
            phoneNumber: normalizedPhone,
            birthDate: birthDate,
            avatarUrl: newAvatarUrl,
          }
          : null
      )

      // Cleanup
      revokePreview()
      setSelectedAvatar(null)
      setIsEditing(false)

      toast.success('Cập nhật hồ sơ thành công.')
    } catch (err) {
      console.error(err)
      toast.error('Cập nhật hồ sơ thất bại. Vui lòng thử lại.')
    }
  }

  const handleCancel = () => {
    revokePreview()
    setSelectedAvatar(null)
    setIsEditing(false)
    setTempProfile(profile)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setTempProfile((prev) => (prev ? { ...prev, [name]: value } : prev))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Hồ sơ của tôi</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Profile Card */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-8 shadow-lg">
            {/* Avatar Section */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="relative group">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg overflow-hidden">
                    {avatarPreview || profile?.avatarUrl ? (
                      <img
                        src={avatarPreview || profile?.avatarUrl || ''}
                        alt="Avatar"
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-12 w-12 text-primary-foreground" />
                    )}
                  </div>

                  {isEditing && (
                    <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer shadow-md hover:bg-primary/90 transition-all">
                      <Upload className="h-4 w-4" />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-foreground">{profile?.name}</h2>
                  <p className="text-muted-foreground">{profile?.email}</p>
                  {subscription?.plans && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5">
                      <Crown className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        Đang dùng gói {subscription.plans.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {!isEditing && (
                <Button onClick={handleEdit} variant="outline" className="gap-2 w-full sm:w-auto">
                  <Pencil className="h-4 w-4" />
                  Chỉnh sửa
                </Button>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <User className="h-4 w-4 inline mr-2" />
                    Họ và tên
                  </label>
                  <Input value={profile?.name ?? ''} disabled className="h-10 rounded-lg" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <Mail className="h-4 w-4 inline mr-2" />
                    Email
                  </label>
                  <Input type="email" value={profile?.email ?? ''} disabled className="h-10 rounded-lg" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <Phone className="h-4 w-4 inline mr-2" />
                    Số điện thoại
                  </label>
                  <Input
                    name="phoneNumber"
                    value={isEditing ? tempProfile?.phoneNumber ?? '' : profile?.phoneNumber ?? ''}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="h-10 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <Calendar className="h-4 w-4 inline mr-2" />
                    Ngày sinh
                  </label>
                  <Input
                    name="birthDate"
                    type="date"
                    value={isEditing ? tempProfile?.birthDate ?? '' : profile?.birthDate ?? ''}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="h-10 rounded-lg"
                  />
                </div>
              </div>

              {isEditing && (
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={isUploading}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    <Save className="h-4 w-4" />
                    {isUploading ? 'Đang tải lên...' : 'Lưu thay đổi'}
                  </Button>
                  <Button onClick={handleCancel} variant="outline" className="gap-2">
                    <X className="h-4 w-4" />
                    Hủy
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Credit Wallet Card */}
          {creditsData && (
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Coins className="h-5 w-5 text-primary" />
                  Ví Credit
                </h3>
                <Link href="/profile/credits-history">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1">
                    Xem tất cả
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Số dư hiện tại</p>
                  <p className="text-2xl font-extrabold text-primary">
                    {creditsData.balance.toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    Đã nạp
                  </p>
                  <p className="text-2xl font-extrabold text-foreground">
                    {creditsData.total_purchased.toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <TrendingDown className="h-3 w-3 text-rose-500" />
                    Đã dùng
                  </p>
                  <p className="text-2xl font-extrabold text-foreground">
                    {creditsData.total_used.toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-4">
                {(() => {
                  const usedPercent = Math.round((creditsData.total_used / (creditsData.balance + creditsData.total_used)) * 100 || 0)
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Hạn mức đã sử dụng</span>
                        <span className={cn(
                          "font-bold",
                          usedPercent > 90 ? "text-red-500" : usedPercent > 70 ? "text-orange-500" : "text-blue-500"
                        )}>
                          {usedPercent}%
                        </span>
                      </div>
                      <div className="h-4 w-full bg-muted/50 rounded-full overflow-hidden border border-border/50 shadow-inner">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${usedPercent}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={cn(
                            "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                            usedPercent > 90
                              ? "from-red-600 via-red-500 to-red-400"
                              : usedPercent > 70
                                ? "from-orange-500 via-orange-500 to-orange-400"
                                : "from-blue-600 via-blue-500 to-cyan-400"
                          )}
                        />
                      </div>
                    </>
                  )
                })()}
                <p className="text-[11px] text-muted-foreground text-center">
                  Bạn còn <b>{creditsData.balance.toLocaleString('vi-VN')}</b> credit khả dụng. Hãy nạp thêm khi thanh đạt mức 100%.
                </p>
              </div>

              {/* Recent Transactions */}

            </div>
          )}

          {/* Account Actions */}
          {!isEditing && (
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground mb-6">Cài đặt tài khoản</h3>
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

                  <Link href="/profile/upgrade" className="w-full">
                    <Button variant="outline" className="w-full justify-center h-11 gap-2">
                      <Crown className="h-4 w-4" />
                      Nâng cấp tài khoản
                    </Button>
                  </Link>

                  <Link href="/profile/billing-history" className="w-full">
                    <Button variant="outline" className="w-full justify-center h-11 gap-2">
                      <History className="h-4 w-4" />
                      Lịch sử mua gói
                    </Button>
                  </Link>

                  <Link href="/settings" className="w-full">
                    <Button variant="outline" className="w-full justify-center h-11 gap-2">
                      <Settings className="h-4 w-4" />
                      Cài đặt chi tiết
                    </Button>
                  </Link>
                  {profile?.providers?.includes('email') ? (
                    <Button variant="outline" className="w-full justify-center h-11 gap-2" asChild>
                      <Link href="/settings/password">
                        <KeyRound className="h-4 w-4" />
                        Thay đổi mật khẩu
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full justify-center h-11 gap-2 opacity-50 cursor-not-allowed" disabled title="Chỉ khả dụng khi đăng nhập bằng email và mật khẩu">
                      <KeyRound className="h-4 w-4" />
                      Thay đổi mật khẩu
                    </Button>
                  )}
                </div>

                <div className="pt-2 border-t border-border/60">
                  <Button
                    variant="ghost"
                    className="w-full justify-center h-11 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      await secureSignOut(supabase)
                      window.location.href = '/login'
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Đăng xuất
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
