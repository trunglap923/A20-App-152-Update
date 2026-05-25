'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LogOut, Settings, User, ChevronDown, Shield } from 'lucide-react'
import { isUserAdminEmail } from '@/lib/admin-auth'
import { getProfileRoleByUserId } from '@/lib/supabase/user'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabaseClient'
import { secureSignOut } from '@/lib/supabase/secure-signout'

const supabase = createClient()


interface AccountPanelProps {
  isCollapsed?: boolean
}

export function AccountPanel({ isCollapsed = false }: AccountPanelProps) {

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    }

    getUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadRole() {
      if (!user?.id) {
        setProfileRole(null)
        return
      }
      const r = await getProfileRoleByUserId(user.id)
      if (!cancelled) setProfileRole(r)
    }
    loadRole()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (!user) {
    return (
      <div className="border-t border-border/40 space-y-2 p-3">
        <Link href="/login" className="block">
          <Button
            className="w-full gap-2 bg-primary hover:bg-primary/90 shadow-sm"
            size={isCollapsed ? 'sm' : 'default'}
          >
            <User className="h-4 w-4" />
            {!isCollapsed && 'Đăng nhập'}
          </Button>
        </Link>
        {!isCollapsed && (
          <Link href="/register" className="block">
            <Button
              variant="ghost"
              className="w-full justify-center text-xs hover:bg-sidebar-accent/50"
            >
              Đăng ký
            </Button>
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="border-t border-border/40 p-3">
      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-200 hover:bg-sidebar-accent/50',
            isDropdownOpen && 'bg-sidebar-accent/30'
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden bg-primary/20">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                  user?.user_metadata?.full_name || user?.email || 'U'
                )}&background=random`}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            )}
          </div>
          {!isCollapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">{user.user_metadata.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <ChevronDown className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200',
                isDropdownOpen && 'rotate-180'
              )} />
            </>
          )}
        </button>

        <AnimatePresence>
          {isDropdownOpen && !isCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-card shadow-lg z-50"
            >
              <Link href="/profile" className="block">
                <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted rounded-t-lg transition-colors">
                  <User className="h-4 w-4" />
                  Hồ sơ
                </button>
              </Link>
              <Link href="/settings" className="block">
                <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                  <Settings className="h-4 w-4" />
                  Cài đặt
                </button>
              </Link>
              {(profileRole?.toLowerCase() === 'admin' || isUserAdminEmail(user?.email)) && (
                <Link href="/admin" className="block">
                  <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                    <Shield className="h-4 w-4" />
                    Quản trị
                  </button>
                </Link>
              )}
              <button
                onClick={async () => {
                  await secureSignOut(supabase)
                  setUser(null)
                  setIsDropdownOpen(false)
                  window.location.href = '/login'
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
