'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ScrollText,
  CreditCard,
  ArrowLeft,
  Shield,
  Activity,
  Bell,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { href: '/admin/users', label: 'Tài khoản', icon: Users, end: false },
  { href: '/admin/audit', label: 'Nhật ký đăng nhập', icon: ScrollText, end: false },
  { href: '/admin/billing', label: 'Thanh toán & dùng', icon: CreditCard, end: false },
  { href: '/admin/ai-monitoring', label: 'Giám sát AI', icon: Activity, end: false },
  { href: '/admin/notifications-content', label: 'Thông báo & nội dung', icon: Bell, end: false },
  { href: '/admin/feedback', label: 'Góp ý & Báo lỗi', icon: MessageSquare, end: false },
] as const

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border bg-card/80 backdrop-blur-sm md:min-h-screen">
        <div className="p-4 border-b border-border/60">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Về Nexus
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Admin</p>
              <p className="text-xs text-muted-foreground">Bảng điều khiển</p>
            </div>
          </div>
        </div>
        <nav className="p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {nav.map((item) => {
            const Icon = item.icon
            const active = item.end
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  )
}
