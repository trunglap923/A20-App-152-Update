'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabaseClient'

const supabase = createClient()

type UserNotification = {
  id: string
  title: string
  content: string
  channel: 'Email' | 'In-app Notification' | 'Push Notification'
  isRead: boolean
  createdAt: string
}

type NotificationApiResponse = {
  notifications?: UserNotification[]
  unreadCount?: number
  error?: string
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', { hour12: false })
}

export function UserNotificationBell() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<UserNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const loadNotifications = useCallback(
    async (showLoader: boolean) => {
      if (showLoader) setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/notifications`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = (await response.json()) as NotificationApiResponse
        if (!response.ok) return
        setItems(data.notifications ?? [])
        setUnreadCount(data.unreadCount ?? 0)
      } finally {
        if (showLoader) setLoading(false)
      }
    },
    [setItems, setUnreadCount]
  )

  useEffect(() => {
    void loadNotifications(true)
    const timer = window.setInterval(() => {
      void loadNotifications(false)
    }, 6000)
    return () => {
      window.clearInterval(timer)
    }
  }, [loadNotifications])

  async function markOneAsRead(id: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/notifications`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ id }),
    })
  }

  async function markAllAsRead() {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })))
    setUnreadCount(0)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/notifications`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ markAll: true }),
    })
  }

  const hasUnread = unreadCount > 0
  const trigger = useMemo(
    () => (
      <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full border border-slate-200">
        <Bell className="h-4 w-4" />
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </Button>
    ),
    [hasUnread, unreadCount]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Thông báo của bạn</p>
            <p className="text-xs text-slate-500">{unreadCount} chưa đọc</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={markAllAsRead}
            disabled={!hasUnread}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Đọc hết
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? <p className="px-4 py-6 text-sm text-slate-500">Đang tải thông báo...</p> : null}
          {!loading && items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Bạn chưa có thông báo nào.</p>
          ) : null}
          {!loading &&
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full border-b px-4 py-3 text-left transition-colors hover:bg-slate-50"
                onClick={() => {
                  if (!item.isRead) {
                    void markOneAsRead(item.id)
                  }
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <p className="line-clamp-1 text-sm font-medium text-slate-900">{item.title}</p>
                  {!item.isRead ? (
                    <Badge className="border-blue-500/40 bg-blue-500/10 text-blue-700">Mới</Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs text-slate-600">{item.content}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatRelativeTime(item.createdAt)}</p>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
