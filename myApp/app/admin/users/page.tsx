'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'react-toastify'
import {
  Ban,
  CheckCircle,
  Search,
  UserPlus,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChevronDown, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AdminUserRow } from '@/lib/admin-mock-data'
import UserAvatar from '@/components/UserAvatar'
import EditUserModal from '@/components/admin/EditUserModal'
import { createClient } from '@/lib/supabaseClient'

const supabase = createClient()

function statusBadge(status: AdminUserRow['status']) {
  switch (status) {
    case 'active':
      return (
        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
          Hoạt động
        </Badge>
      )
    case 'suspended':
      return (
        <Badge className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100">
          Tạm khóa
        </Badge>
      )
    case 'pending':
      return (
        <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
          Chờ duyệt
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function planBadge(plan: string) {
  const normalized = plan.toLowerCase()

  if (normalized === 'pro') {
    return (
      <Badge className="border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
        Pro
      </Badge>
    )
  }

  if (normalized === 'premium') {
    return (
      <Badge className="border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
        Premium
      </Badge>
    )
  }

  return (
    <Badge className="border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100">
      Free
    </Badge>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<
    'all' | 'free' | 'pro' | 'premium'
  >('all')
  const [loading, setLoading] = useState(true)
  const [openPlanDropdown, setOpenPlanDropdown] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const USERS_PER_PAGE = 10

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch users')
        }

        setUsers(data)
      } catch {
        toast.error('Không thể tải danh sách người dùng')
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return [...users]
      .filter((u) => {
        const matchesSearch =
          !keyword ||
          u.fullName.toLowerCase().includes(keyword) ||
          u.email.toLowerCase().includes(keyword)

        const matchesPlan =
          planFilter === 'all'
            ? true
            : u.plan.toLowerCase() === planFilter

        return matchesSearch && matchesPlan
      })
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
  }, [users, search, planFilter])

  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE)

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  )

  const toggleSuspend = async (id: string) => {
    const target = users.find((u) => u.id === id)
    if (!target) return

    const nextBanned = target.status !== 'suspended'

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${id}/ban`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          banned: nextBanned,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
              ...u,
              status: nextBanned ? 'suspended' : 'active',
            }
            : u
        )
      )

      toast.success(nextBanned ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không thể cập nhật tài khoản'
      )
    }
  }

  const handleEdit = (user: AdminUserRow) => {
    setEditingUser(user)
  }

  return (
    <div className="relative space-y-6 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/80 to-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý tài khoản
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý người dùng, trạng thái tài khoản và thao tác nhanh từ
            Supabase Auth.
          </p>
        </div>

        <Button className="gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-indigo-400">
          <UserPlus className="h-4 w-4" />
          Thêm người dùng
        </Button>
      </div>

      <div className="relative rounded-2xl border border-slate-200 bg-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Danh sách người dùng
            </h2>
            <p className="text-xs text-slate-500">
              {filteredUsers.length} tài khoản được tìm thấy
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc email..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              />
            </div>

            <div className="relative min-w-[180px]">
              <button
                type="button"
                onClick={() => setOpenPlanDropdown((v) => !v)}
                className="
      flex h-10 w-full items-center justify-between
      rounded-xl border border-slate-200
      bg-white/90 px-4
      text-sm font-medium text-slate-700
      shadow-sm backdrop-blur
      transition-all
      hover:border-cyan-300
      hover:bg-cyan-50/40
      focus:outline-none
      focus:ring-4 focus:ring-cyan-100
    "
              >
                <span>
                  {planFilter === 'all'
                    ? 'Tất cả gói'
                    : planFilter === 'free'
                      ? 'Free'
                      : planFilter === 'pro'
                        ? 'Pro'
                        : 'Premium'}
                </span>

                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${openPlanDropdown ? 'rotate-180' : ''
                    }`}
                />
              </button>

              {openPlanDropdown && (
                <div
                  className="
        absolute right-0 top-12 z-50
        w-full overflow-hidden
        rounded-2xl border border-slate-200
        bg-white/95
        shadow-2xl backdrop-blur
      "
                >
                  {[
                    { value: 'all', label: 'Tất cả gói' },
                    { value: 'free', label: 'Free' },
                    { value: 'pro', label: 'Pro' },
                    { value: 'premium', label: 'Premium' },
                  ].map((item) => {
                    const active = planFilter === item.value

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          setPlanFilter(item.value as any)
                          setOpenPlanDropdown(false)
                        }}
                        className={`
              flex w-full items-center justify-between
              px-4 py-3 text-sm transition-all
              ${active
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'text-slate-700 hover:bg-slate-50'
                          }
            `}
                      >
                        <span>{item.label}</span>

                        {active && (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">
            Đang tải danh sách người dùng...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="[&_td]:border-r-0 [&_th]:border-r-0">
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="h-12 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Người dùng
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Gói
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Đã trả
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Mức dùng
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Đăng ký
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Đăng nhập cuối
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedUsers.map((u) => (
                  <TableRow
                    key={u.id}
                    className="border-slate-100 transition-colors hover:bg-slate-50/80"
                  >
                    <TableCell className="py-4">
                      <div className="flex items-start gap-3">
                        <UserAvatar fullName={u.fullName} avatarUrl={u.avatarUrl} />
                        <div>
                          <p className="font-medium text-slate-900">
                            {u.fullName}
                          </p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                          <div className="mt-1">{statusBadge(u.status)}</div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        {planBadge(u.plan)}

                        <p className="text-xs text-slate-500">
                          {u.plan === 'free'
                            ? 'Chưa nâng cấp'
                            : u.plan === 'pro'
                              ? 'Gói Pro'
                              : 'Gói Premium'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold tabular-nums text-slate-900">
                          {u.totalPaidVnd.toLocaleString('vi-VN')}₫
                        </p>

                        <p className="text-xs text-slate-500">
                          {u.totalPaidVnd > 0
                            ? 'Đã thanh toán'
                            : 'Chưa phát sinh'}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                            style={{ width: `${u.usageScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums text-slate-600">
                          {u.usageScore}/100
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {format(parseISO(u.registeredAt), 'dd/MM/yyyy HH:mm')}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {format(parseISO(u.lastLoginAt), 'dd/MM/yyyy HH:mm')}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-slate-500 hover:bg-cyan-50 hover:text-cyan-600"
                          onClick={() => handleEdit(u)}
                          title="Chỉnh sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => toggleSuspend(u.id)}
                          disabled={u.status === 'pending'}
                          title={
                            u.status === 'suspended' ? 'Mở khóa' : 'Tạm khóa'
                          }
                        >
                          {u.status === 'suspended' ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Ban className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-slate-500">
          Hiển thị {(currentPage - 1) * USERS_PER_PAGE + 1}
          -
          {Math.min(currentPage * USERS_PER_PAGE, filteredUsers.length)}
          {' '}trên {filteredUsers.length} người dùng
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Trước
          </Button>

          <div className="text-sm font-medium text-slate-700">
            {currentPage} / {totalPages || 1}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
      <EditUserModal
        user={editingUser}
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        onUpdated={(updatedUser) => {
          setUsers((prev) =>
            prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
          )
        }}
      />
    </div>
  )
}