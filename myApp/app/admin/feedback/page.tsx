'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'react-toastify'
import {
  MessageSquare, Bug, Lightbulb, Star, Search, CheckCircle2, Clock, Inbox, ChevronDown, Check, Reply, Send, Loader2, Mail
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabaseClient'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

const supabase = createClient()

type FeedbackRow = {
  id: string
  user_id: string
  type: 'bug' | 'feature' | 'general'
  rating: number | null
  message: string
  status: 'new' | 'in_progress' | 'resolved'
  created_at: string
  userEmail: string
  userName: string
}

function typeBadge(type: string) {
  switch (type) {
    case 'bug': return <Badge className="border border-rose-200 bg-rose-50 text-rose-700"><Bug className="w-3 h-3 mr-1" />Báo lỗi</Badge>
    case 'feature': return <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700"><Lightbulb className="w-3 h-3 mr-1" />Góp ý</Badge>
    case 'general': return <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-700"><Star className="w-3 h-3 mr-1" />Đánh giá</Badge>
    default: return <Badge variant="outline">{type}</Badge>
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'new': return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200"><Inbox className="w-3 h-3 mr-1" />Mới</Badge>
    case 'in_progress': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200"><Clock className="w-3 h-3 mr-1" />Đang xử lý</Badge>
    case 'resolved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Đã xử lý</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feature' | 'general'>('all')

  const [openStatusDropdown, setOpenStatusDropdown] = useState(false)
  const [openTypeDropdown, setOpenTypeDropdown] = useState(false)
  const [loading, setLoading] = useState(true)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // Reply Modal
  const [replyingTo, setReplyingTo] = useState<FeedbackRow | null>(null)
  const [replyMessage, setReplyMessage] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)

  const fetchFeedbacks = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/feedback`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      setFeedbacks(data)
    } catch {
      toast.error('Không thể tải danh sách feedback')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeedbacks()
  }, [])

  const filteredFeedbacks = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return feedbacks.filter(f => {
      const matchesSearch = !keyword ||
        f.message.toLowerCase().includes(keyword) ||
        f.userEmail.toLowerCase().includes(keyword) ||
        f.userName.toLowerCase().includes(keyword)

      const matchesStatus = statusFilter === 'all' || f.status === statusFilter
      const matchesType = typeFilter === 'all' || f.type === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [feedbacks, search, statusFilter, typeFilter])

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, typeFilter])

  const totalPages = Math.ceil(filteredFeedbacks.length / ITEMS_PER_PAGE)
  const paginatedFeedbacks = filteredFeedbacks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/feedback`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id, status: newStatus })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update status')

      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status: newStatus as any } : f))
      toast.success('Đã cập nhật trạng thái')
    } catch (err: any) {
      toast.error('Lỗi cập nhật. Bạn có đủ quyền Admin không?')
    }
  }

  const handleSendReply = async () => {
    if (!replyingTo || !replyMessage.trim()) return

    setIsSendingReply(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      // Gửi in-app notification
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/feedback/reply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userId: replyingTo.user_id,
          title: `Phản hồi từ Admin về: ${replyingTo.type === 'bug' ? 'Báo lỗi' : replyingTo.type === 'feature' ? 'Góp ý' : 'Đánh giá'} của bạn`,
          content: replyMessage.trim()
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send reply')

      // Đánh dấu thành "Đã xử lý" luôn cho tiện
      if (replyingTo.status !== 'resolved') {
        await updateStatus(replyingTo.id, 'resolved')
      }

      toast.success('Đã gửi phản hồi đến người dùng!')
      setReplyingTo(null)
      setReplyMessage('')
    } catch (error: any) {
      toast.error('Gửi phản hồi thất bại: ' + error.message)
    } finally {
      setIsSendingReply(false)
    }
  }

  return (
    <div className="relative space-y-6 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/80 to-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.10),transparent_35%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Góp ý & Báo lỗi</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý phản hồi và trả lời trực tiếp đến người dùng.</p>
        </div>
      </div>

      <div className="relative rounded-2xl border border-slate-200 bg-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Danh sách Feedback</h2>
            <p className="text-xs text-slate-500">{filteredFeedbacks.length} kết quả được tìm thấy</p>
          </div>

          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:max-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              />
            </div>

            {/* Lọc loại Feedback */}
            <div className="relative min-w-[140px]">
              <button
                onClick={() => setOpenTypeDropdown((v) => !v)}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition-all hover:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
              >
                <span>{typeFilter === 'all' ? 'Tất cả loại' : typeFilter === 'bug' ? 'Báo lỗi' : typeFilter === 'feature' ? 'Góp ý' : 'Đánh giá'}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {openTypeDropdown && (
                <div className="absolute right-0 top-12 z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
                  {[{ value: 'all', label: 'Tất cả loại' }, { value: 'bug', label: 'Báo lỗi' }, { value: 'feature', label: 'Góp ý' }, { value: 'general', label: 'Đánh giá' }].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => { setTypeFilter(item.value as any); setOpenTypeDropdown(false) }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-sm ${typeFilter === item.value ? 'bg-cyan-50 text-cyan-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span>{item.label}</span>
                      {typeFilter === item.value && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lọc Trạng thái */}
            <div className="relative min-w-[140px]">
              <button
                onClick={() => setOpenStatusDropdown((v) => !v)}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white/90 px-4 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition-all hover:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
              >
                <span>{statusFilter === 'all' ? 'Tất cả trạng thái' : statusFilter === 'new' ? 'Mới' : statusFilter === 'in_progress' ? 'Đang xử lý' : 'Đã xử lý'}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {openStatusDropdown && (
                <div className="absolute right-0 top-12 z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
                  {[{ value: 'all', label: 'Tất cả trạng thái' }, { value: 'new', label: 'Mới' }, { value: 'in_progress', label: 'Đang xử lý' }, { value: 'resolved', label: 'Đã xử lý' }].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => { setStatusFilter(item.value as any); setOpenStatusDropdown(false) }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-sm ${statusFilter === item.value ? 'bg-cyan-50 text-cyan-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span>{item.label}</span>
                      {statusFilter === item.value && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Đang tải danh sách feedback...</div>
        ) : paginatedFeedbacks.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 flex flex-col items-center justify-center py-10">
            <MessageSquare className="w-10 h-10 text-slate-300 mb-3" />
            <p>Không có phản hồi nào phù hợp.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="[&_td]:border-r-0 [&_th]:border-r-0">
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="h-12 text-xs font-semibold uppercase tracking-wide text-slate-500">Người dùng</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loại</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nội dung</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ngày gửi</TableHead>
                  <TableHead className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Trạng thái</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Hành động</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedFeedbacks.map((f) => (
                  <TableRow key={f.id} className="border-slate-100 transition-colors hover:bg-slate-50/80">
                    <TableCell className="py-4 align-top min-w-[150px]">
                      <p className="font-medium text-slate-900">{f.userName}</p>
                      <p className="text-xs text-slate-500">{f.userEmail}</p>
                    </TableCell>

                    <TableCell className="align-top min-w-[100px]">
                      <div className="space-y-1">
                        {typeBadge(f.type)}
                        {f.type === 'general' && f.rating && (
                          <div className="flex text-yellow-400 mt-1">
                            {[...Array(f.rating)].map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[250px] align-top">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{f.message}</p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-xs text-slate-500 align-top">
                      {format(parseISO(f.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>

                    <TableCell className="text-center align-top">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="focus:outline-none">
                          {statusBadge(f.status)}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-xl">
                          <DropdownMenuItem onClick={() => updateStatus(f.id, 'new')} className="gap-2 cursor-pointer text-sm">
                            <Inbox className="w-4 h-4 text-blue-500" /> Mới
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(f.id, 'in_progress')} className="gap-2 cursor-pointer text-sm">
                            <Clock className="w-4 h-4 text-amber-500" /> Đang xử lý
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(f.id, 'resolved')} className="gap-2 cursor-pointer text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Đã xử lý
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    <TableCell className="text-right align-top">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-2 h-8 rounded-lg"
                        onClick={() => setReplyingTo(f)}
                      >
                        <Reply className="w-4 h-4" /> Phản hồi
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {!loading && filteredFeedbacks.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-slate-500">
            Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredFeedbacks.length)} trên {filteredFeedbacks.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Trước</Button>
            <div className="text-sm font-medium text-slate-700">{currentPage} / {totalPages || 1}</div>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Sau</Button>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      <Dialog open={!!replyingTo} onOpenChange={(open) => !open && setReplyingTo(null)}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="w-5 h-5 text-primary" /> Phản hồi người dùng
            </DialogTitle>
            <DialogDescription>
              Gửi thông báo trực tiếp cho <span className="font-semibold text-foreground">{replyingTo?.userName}</span> ({replyingTo?.userEmail})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-4 rounded-xl border border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-2">
                {replyingTo?.type === 'bug' ? 'Báo lỗi gốc:' : replyingTo?.type === 'feature' ? 'Góp ý gốc:' : 'Đánh giá gốc:'}
              </div>
              <p className="text-sm italic text-foreground">&quot;{replyingTo?.message}&quot;</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nội dung phản hồi của bạn</label>
              <Textarea
                placeholder="Nhập câu trả lời... Người dùng sẽ nhận được qua thông báo trong ứng dụng."
                className="min-h-[120px] resize-none"
                value={replyMessage}
                onChange={e => setReplyMessage(e.target.value)}
              />
            </div>

            {/* <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-100 dark:border-blue-900">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-blue-700 dark:text-blue-400">Hoặc phản hồi qua Email?</span>
              </div>
              <a 
                href={`mailto:${replyingTo?.userEmail}?subject=Phản hồi từ Admin Nexus&body=Xin chào ${replyingTo?.userName},%0D%0A%0D%0ACảm ơn bạn đã phản hồi:%0D%0A"${replyingTo?.message}"%0D%0A%0D%0A`}
                className="text-xs bg-white dark:bg-background px-3 py-1.5 rounded-lg font-medium shadow-sm border border-border hover:bg-muted transition-colors"
              >
                Mở Mail App
              </a>
            </div> */}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReplyingTo(null)} className="rounded-xl">Hủy</Button>
            <Button onClick={handleSendReply} disabled={isSendingReply || !replyMessage.trim()} className="rounded-xl gap-2">
              {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Gửi Thông Báo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

