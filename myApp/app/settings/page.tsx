'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Bell, Moon, Globe, Lock, Trash2, Save } from 'lucide-react'
import { CustomApiKeysSettings } from '@/components/custom-api-keys-settings'
import { motion } from 'framer-motion'
import { useTheme } from '@/components/theme-provider'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme()
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    darkMode: false,
    language: 'vi',
    twoFactor: false,
    dataSharing: true,
  })
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!resolvedTheme) return
    setSettings((prev) => ({
      ...prev,
      darkMode: resolvedTheme === 'dark',
    }))
  }, [resolvedTheme])

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => {
      const nextValue = !prev[key]

      if (key === 'darkMode') {
        setTheme(nextValue ? 'dark' : 'light')
      }

      return {
        ...prev,
        [key]: nextValue,
      }
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsSaving(false)
  }

  const settingGroups = [
    // {
    //   title: 'Thông báo',
    //   icon: Bell,
    //   settings: [
    //     {
    //       key: 'emailNotifications',
    //       label: 'Thông báo qua Email',
    //       description: 'Nhận cập nhật qua email',
    //     },
    //     {
    //       key: 'pushNotifications',
    //       label: 'Thông báo Push',
    //       description: 'Nhận thông báo trên thiết bị của bạn',
    //     },
    //   ]
    // },
    {
      title: 'Giao diện',
      icon: Moon,
      settings: [
        {
          key: 'darkMode',
          label: 'Chế độ tối',
          description: 'Sử dụng chế độ tối cho ứng dụng',
        },
      ]
    },
    {
      title: 'Bảo mật',
      icon: Lock,
      settings: [
        {
          key: 'twoFactor',
          label: 'Xác thực hai yếu tố',
          description: 'Bảo vệ tài khoản với 2FA',
        },
        {
          key: 'dataSharing',
          label: 'Chia sẻ dữ liệu ẩn danh',
          description: 'Giúp chúng tôi cải thiện bằng cách chia sẻ dữ liệu',
        },
      ]
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </button>

          <h1 className="text-3xl font-bold text-foreground">Cài đặt</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <CustomApiKeysSettings />
          </motion.div>

          {settingGroups.map((group, idx) => {
            const Icon = group.icon
            return (
              <motion.div
                key={group.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-card border border-border rounded-2xl p-8 shadow-lg"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{group.title}</h2>
                </div>

                <div className="space-y-4">
                  {group.settings.map((setting) => (
                    <motion.div
                      key={setting.key}
                      className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition"
                      whileHover={{ scale: 1.01 }}
                    >
                      <div>
                        <p className="font-medium text-foreground">{setting.label}</p>
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                      </div>

                      {/* Toggle Switch */}
                      <button
                        onClick={() => handleToggle(setting.key as keyof typeof settings)}
                        className={`h-6 w-11 rounded-full transition-colors ${settings[setting.key as keyof typeof settings]
                          ? 'bg-primary'
                          : 'bg-muted'
                          }`}
                      >
                        <motion.div
                          initial={false}
                          animate={{
                            x: settings[setting.key as keyof typeof settings] ? 20 : 4,
                          }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className="h-5 w-5 rounded-full bg-white shadow-md m-0.5"
                        />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )
          })}

          {/* Language Selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-2xl p-8 shadow-lg"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Ngôn ngữ</h2>
            </div>

            <div className="space-y-2">
              {[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ].map(lang => (
                <label key={lang.value} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input
                    type="radio"
                    name="language"
                    value={lang.value}
                    checked={settings.language === lang.value}
                    onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                    className="w-4 h-4 rounded-full"
                  />
                  <span className="text-foreground">{lang.label}</span>
                </label>
              ))}
            </div>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card border-2 border-destructive/20 rounded-2xl p-8 shadow-lg"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold text-destructive">Vùng nguy hiểm</h2>
            </div>

            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start h-10 text-destructive hover:text-destructive/90">
                <Trash2 className="h-4 w-4 mr-2" />
                Xóa tất cả dữ liệu của tôi
              </Button>
              <Button variant="outline" className="w-full justify-start h-10 text-destructive hover:text-destructive/90">
                Xóa tài khoản vĩnh viễn
              </Button>
            </div>
          </motion.div>

          {/* Save Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-3 pt-4"
          >
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {isSaving ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-4 w-4 border-2 border-transparent border-t-primary-foreground rounded-full"
                />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Lưu thay đổi
                </>
              )}
            </Button>
            <Link href="/profile">
              <Button variant="outline">Hủy</Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
