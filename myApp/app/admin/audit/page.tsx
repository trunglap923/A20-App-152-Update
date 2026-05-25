'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Check, Chrome, Laptop, Smartphone, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AuditLogRow } from '@/lib/admin-mock-data'
import { createClient } from '@/lib/supabaseClient'

const supabase = createClient()

const eventLabels: Record<string, string> = {
  login: 'Đăng nhập',
  register: 'Đăng ký',
  logout: 'Đăng xuất',
  password_reset: 'Đặt lại MK',
}

export default function AdminAuditPage() {
  const PAGE_SIZE = 15
  const [eventFilter, setEventFilter] = useState<'all' | 'login' | 'register' | 'logout' | 'password_reset'>('all')
  const [resultFilter, setResultFilter] = useState<'all' | 'success' | 'failed'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [apiRows, setApiRows] = useState<AuditLogRow[]>([])
  const [loadError, setLoadError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const loadRows = async () => {
      setIsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/audit?limit=500`, {
          method: 'GET',
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!response.ok) {
          throw new Error('Không thể tải nhật ký từ database')
        }
        const payload = await response.json()
        if (isMounted && Array.isArray(payload?.rows)) {
          setApiRows(payload.rows)
          setLoadError('')
        }
      } catch (error) {
        if (isMounted) {
          setApiRows([])
          setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu log')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadRows()
    return () => {
      isMounted = false
    }
  }, [])

  const rows = useMemo(() => {
    return [...apiRows]
      .filter((r) => (eventFilter === 'all' ? true : r.event === eventFilter))
      .filter((r) => (resultFilter === 'all' ? true : resultFilter === 'success' ? r.success : !r.success))
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [apiRows, eventFilter, resultFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [eventFilter, resultFilter])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pagedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }, [rows, safeCurrentPage, PAGE_SIZE])

  const formatAuditTime = (value: string) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return format(d, 'dd/MM/yyyy HH:mm:ss')
  }

  const getFriendlyDeviceName = (userAgent: string) => {
    if (!userAgent || userAgent === '-' || userAgent === '') return 'Unknown Device'
    const ua = userAgent

    // OS detection with version
    let os = 'Unknown OS'
    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10'
    else if (/Windows NT 11.0/i.test(ua) || (ua.includes('Windows NT 10.0') && ua.includes('6619'))) os = 'Windows 11'
    else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7'
    else if (/iPhone OS ([0-9_]+)/i.test(ua)) {
      const version = ua.match(/iPhone OS ([0-9_]+)/i)?.[1].replace(/_/g, '.')
      os = `iOS ${version}`
    } else if (/Android ([0-9.]+)/i.test(ua)) {
      const version = ua.match(/Android ([0-9.]+)/i)?.[1]
      os = `Android ${version}`
    } else if (/Mac OS X ([0-9_]+)/i.test(ua)) {
      const version = ua.match(/Mac OS X ([0-9_]+)/i)?.[1].replace(/_/g, '.')
      os = `macOS ${version}`
    } else if (/Linux/i.test(ua)) os = 'Linux'

    // Browser detection with version
    let browser = 'Unknown Browser'
    if (/Edg\/([0-9.]+)/i.test(ua)) {
      const version = ua.match(/Edg\/([0-9.]+)/i)?.[1].split('.')[0]
      browser = `Edge ${version}`
    } else if (/Chrome\/([0-9.]+)/i.test(ua)) {
      const version = ua.match(/Chrome\/([0-9.]+)/i)?.[1].split('.')[0]
      browser = `Chrome ${version}`
    } else if (/Firefox\/([0-9.]+)/i.test(ua)) {
      const version = ua.match(/Firefox\/([0-9.]+)/i)?.[1].split('.')[0]
      browser = `Firefox ${version}`
    } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
      const version = ua.match(/Version\/([0-9.]+)/i)?.[1]?.split('.')[0] || '??'
      browser = `Safari ${version}`
    }

    return `${os} • ${browser}`
  }

  const renderDeviceIcon = (userAgent: string) => {
    const ua = userAgent.toLowerCase()
    const iconClass =
      'h-4 w-4 text-slate-400 transition-all duration-200 hover:text-[#2979FF] hover:drop-shadow-[0_0_8px_rgba(41,121,255,0.5)]'
    
    if (ua.includes('chrome')) return <Chrome className={iconClass} />
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
      return <Smartphone className={iconClass} />
    }
    return <Laptop className={iconClass} />
  }

  return (
    <div className="relative space-y-6 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/70 to-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.1),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div>
        <h1 className="relative text-2xl font-bold tracking-tight text-slate-900">Nhật ký đăng nhập & đăng ký</h1>
        <p className="mt-1 text-sm text-slate-500">
          Dữ liệu đang lấy từ database (auth_audit_logs).
        </p>
        {loadError && <p className="mt-1 text-sm text-red-600">{loadError}</p>}
      </div>

      <div className="relative flex flex-wrap gap-2">
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">Auth Security Feed</span>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">Risk Signals</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <Button
            variant={eventFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className={eventFilter === 'all' ? 'border-transparent bg-gradient-to-r from-cyan-500 to-indigo-500 text-white hover:from-cyan-400 hover:to-indigo-400' : ''}
            onClick={() => setEventFilter('all')}
          >
            Tất cả sự kiện
          </Button>
          <Button variant={eventFilter === 'login' ? 'default' : 'outline'} size="sm" onClick={() => setEventFilter('login')}>
            Đăng nhập
          </Button>
          <Button
            variant={eventFilter === 'register' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEventFilter('register')}
          >
            Đăng ký
          </Button>
          <Button variant={eventFilter === 'logout' ? 'default' : 'outline'} size="sm" onClick={() => setEventFilter('logout')}>
            Đăng xuất
          </Button>
          <Button
            variant={eventFilter === 'password_reset' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEventFilter('password_reset')}
          >
            Đặt lại MK
          </Button>
          <div className="mx-1 h-5 w-px bg-slate-300" />
          <Button
            variant={resultFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className={resultFilter === 'all' ? 'border-transparent bg-gradient-to-r from-cyan-500 to-indigo-500 text-white hover:from-cyan-400 hover:to-indigo-400' : ''}
            onClick={() => setResultFilter('all')}
          >
            Tất cả kết quả
          </Button>
          <Button
            variant={resultFilter === 'success' ? 'default' : 'outline'}
            size="sm"
            className={resultFilter === 'success' ? 'bg-[#00C853] hover:bg-[#00B54A] text-white' : ''}
            onClick={() => setResultFilter('success')}
          >
            Thành công
          </Button>
          <Button
            variant={resultFilter === 'failed' ? 'default' : 'outline'}
            size="sm"
            className={resultFilter === 'failed' ? 'bg-[#FF3B30] hover:bg-[#E02E25] text-white' : ''}
            onClick={() => setResultFilter('failed')}
          >
            Thất bại
          </Button>
          <span className="ml-auto text-xs text-slate-500">
            Tổng: {rows.length} log • Trang {safeCurrentPage}/{totalPages}
          </span>
        </div>
        <Table className="[&_td]:border-r-0 [&_th]:border-r-0">
          <TableHeader>
            <TableRow className="border-b border-slate-200 bg-white hover:bg-white">
              <TableHead className="text-slate-600">Thời điểm</TableHead>
              <TableHead className="text-slate-600">Email</TableHead>
              <TableHead className="text-slate-600">Sự kiện</TableHead>
              <TableHead className="text-slate-600">IP</TableHead>
              <TableHead className="text-slate-600">Thiết bị</TableHead>
              <TableHead className="text-slate-600">Kết quả</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-24 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-slate-500 font-medium">Đang tải nhật ký thực tế...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : pagedRows.map((r) => (
              <TableRow key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {formatAuditTime(r.at)}
                </TableCell>
                <TableCell className="font-medium text-slate-900">{r.email}</TableCell>
                <TableCell className="text-slate-700">{eventLabels[r.event] ?? r.event}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{r.ip}</TableCell>
                <TableCell className="max-w-[200px]">
                  <div className="flex items-center gap-2">
                    {renderDeviceIcon(r.userAgent)}
                    <span className="truncate text-xs text-slate-500" title={r.userAgent}>
                      {r.device || getFriendlyDeviceName(r.userAgent)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {r.success ? (
                    <Badge className="border border-[#39FF14] bg-[#39FF14]/10 text-[#1A9E0A] hover:bg-[#39FF14]/15">
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Thành công
                    </Badge>
                  ) : (
                    <Badge className="border border-[#FF3B30] bg-[#FF3B30]/10 text-[#D92C22] hover:bg-[#FF3B30]/15">
                      <X className="mr-1 h-3.5 w-3.5" />
                      Thất bại
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {pagedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                  Chưa có dữ liệu nhật ký.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Trang trước
          </Button>
          <span className="min-w-20 text-center text-sm text-slate-600">
            {safeCurrentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Trang sau
          </Button>
        </div>
      </div>
    </div>
  )
}
