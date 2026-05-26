'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Bell,
  CalendarClock,
  LayoutTemplate,
  Loader2,
  Megaphone,
  MousePointerClick,
  Send,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'react-toastify'
import { createClient } from '@/lib/supabaseClient'

const supabase = createClient()

type BroadcastChannel = 'Email' | 'In-app Notification' | 'Push Notification'
type AudienceGroup =
  | 'Tất cả user'
  | 'User đang hoạt động'
  | 'User trả phí (Pro/Enterprise)'
  | 'User sắp hết hạn gói'

type BroadcastStatus = 'Đang gửi' | 'Đã gửi' | 'Lỗi'
type BannerPlacement = 'Top bar' | 'Cạnh bên' | 'Popup giữa màn hình'
type BannerType = 'Info' | 'Warning' | 'Khuyến mãi'
type BannerScheduleStatus = 'Sắp chạy' | 'Đang chạy' | 'Hết hạn'

type BroadcastHistory = {
  id: string
  campaign: string
  audience: AudienceGroup
  channel: BroadcastChannel
  sentAt: string
  status: BroadcastStatus
  openRate: number
}

type BannerItem = {
  id: string
  placement: BannerPlacement
  type: BannerType
  content: string
  ctaText: string
  ctaLink: string
  startDate: string
  endDate: string
  enabled: boolean
  ctr: number
}

type NotificationsApiResponse = {
  broadcasts?: BroadcastHistory[]
  banners?: BannerItem[]
  error?: string
}

type AiPreview = {
  qualityScore: number
  riskLevel: 'Thấp' | 'Trung bình' | 'Cao'
  issues: string[]
  suggestions: string[]
  previewTitle: string
  previewBody: string
  previewCta?: string
  previewLink?: string
}

const INITIAL_BROADCAST_HISTORY: BroadcastHistory[] = [
  {
    id: 'bc-1',
    campaign: 'Bảo trì hệ thống tối Chủ nhật',
    audience: 'Tất cả user',
    channel: 'In-app Notification',
    sentAt: '2026-04-24T20:00:00.000Z',
    status: 'Đã gửi',
    openRate: 78.6,
  },
  {
    id: 'bc-2',
    campaign: 'Nhắc gia hạn gói Pro',
    audience: 'User sắp hết hạn gói',
    channel: 'Email',
    sentAt: '2026-04-24T09:15:00.000Z',
    status: 'Đang gửi',
    openRate: 45.2,
  },
  {
    id: 'bc-3',
    campaign: 'Ưu đãi nâng cấp Enterprise 20%',
    audience: 'User trả phí (Pro/Enterprise)',
    channel: 'Push Notification',
    sentAt: '2026-04-23T13:30:00.000Z',
    status: 'Lỗi',
    openRate: 0,
  },
]

const INITIAL_BANNERS: BannerItem[] = [
  {
    id: 'bn-1',
    placement: 'Top bar',
    type: 'Info',
    content: 'Hệ thống sẽ bảo trì từ 22:00 - 23:00 tối nay.',
    ctaText: 'Xem chi tiết',
    ctaLink: '/status',
    startDate: '2026-04-25',
    endDate: '2026-04-26',
    enabled: true,
    ctr: 3.4,
  },
  {
    id: 'bn-2',
    placement: 'Popup giữa màn hình',
    type: 'Khuyến mãi',
    content: 'Nâng cấp gói Pro hôm nay để nhận thêm 30% token bonus.',
    ctaText: 'Nâng cấp ngay',
    ctaLink: '/pricing',
    startDate: '2026-04-20',
    endDate: '2026-04-30',
    enabled: true,
    ctr: 8.9,
  },
  {
    id: 'bn-3',
    placement: 'Cạnh bên',
    type: 'Warning',
    content: 'Bạn còn 5 ngày trước khi gói hiện tại hết hạn.',
    ctaText: 'Gia hạn',
    ctaLink: '/billing',
    startDate: '2026-04-22',
    endDate: '2026-05-02',
    enabled: false,
    ctr: 5.1,
  },
]

const CHANNELS: BroadcastChannel[] = ['Email', 'In-app Notification', 'Push Notification']
const AUDIENCES: AudienceGroup[] = [
  'Tất cả user',
  'User đang hoạt động',
  'User trả phí (Pro/Enterprise)',
  'User sắp hết hạn gói',
]
const BANNER_PLACEMENTS: BannerPlacement[] = ['Top bar', 'Cạnh bên', 'Popup giữa màn hình']
const BANNER_TYPES: BannerType[] = ['Info', 'Warning', 'Khuyến mãi']

function statusBadge(status: BroadcastStatus) {
  if (status === 'Đã gửi') {
    return <Badge className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-700">Đã gửi</Badge>
  }
  if (status === 'Đang gửi') {
    return <Badge className="border border-blue-500/40 bg-blue-500/10 text-blue-700">Đang gửi</Badge>
  }
  return <Badge className="border border-red-500/40 bg-red-500/10 text-red-700">Lỗi</Badge>
}

function bannerTypeBadge(type: BannerType) {
  if (type === 'Info') {
    return <Badge className="border border-cyan-500/40 bg-cyan-500/10 text-cyan-700">Info</Badge>
  }
  if (type === 'Warning') {
    return <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-700">Warning</Badge>
  }
  return <Badge className="border border-violet-500/40 bg-violet-500/10 text-violet-700">Khuyến mãi</Badge>
}

function getBannerScheduleStatus(item: BannerItem): BannerScheduleStatus {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = parseISO(item.startDate)
  const end = parseISO(item.endDate)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  if (today < start) return 'Sắp chạy'
  if (today > end) return 'Hết hạn'
  return 'Đang chạy'
}

function bannerScheduleBadge(status: BannerScheduleStatus) {
  if (status === 'Sắp chạy') {
    return <Badge className="border border-blue-500/40 bg-blue-500/10 text-blue-700">Sắp chạy</Badge>
  }
  if (status === 'Hết hạn') {
    return <Badge className="border border-rose-500/40 bg-rose-500/10 text-rose-700">Hết hạn</Badge>
  }
  return <Badge className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-700">Đang chạy</Badge>
}

export default function AdminNotificationsContentPage() {
  const [channel, setChannel] = useState<BroadcastChannel>('In-app Notification')
  const [audience, setAudience] = useState<AudienceGroup>('Tất cả user')
  const [broadcastTitle, setBroadcastTitle] = useState('Thông báo bảo trì hệ thống')
  const [broadcastBody, setBroadcastBody] = useState(
    'Xin chào {{tên_user}}, hệ thống sẽ bảo trì ngắn lúc 22:00. Cảm ơn bạn đã đồng hành cùng Nexus.'
  )
  const [broadcastRows, setBroadcastRows] = useState<BroadcastHistory[]>(INITIAL_BROADCAST_HISTORY)

  const [placement, setPlacement] = useState<BannerPlacement>('Top bar')
  const [bannerType, setBannerType] = useState<BannerType>('Info')
  const [bannerContent, setBannerContent] = useState('Thông báo lịch bảo trì tối nay từ 22:00 - 23:00.')
  const [bannerCta, setBannerCta] = useState('Xem chi tiết')
  const [bannerLink, setBannerLink] = useState('/status')
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(todayStr)
  const [banners, setBanners] = useState<BannerItem[]>(INITIAL_BANNERS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingBroadcast, setIsSubmittingBroadcast] = useState(false)
  const [isSubmittingBanner, setIsSubmittingBanner] = useState(false)
  const [isTogglingBannerId, setIsTogglingBannerId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isPreviewingBroadcast, setIsPreviewingBroadcast] = useState(false)
  const [isPreviewingBanner, setIsPreviewingBanner] = useState(false)
  const [broadcastPreview, setBroadcastPreview] = useState<AiPreview | null>(null)
  const [bannerPreview, setBannerPreview] = useState<AiPreview | null>(null)
  const [broadcastPreviewSignature, setBroadcastPreviewSignature] = useState('')
  const [bannerPreviewSignature, setBannerPreviewSignature] = useState('')
  const [isBroadcastPreviewOpen, setIsBroadcastPreviewOpen] = useState(false)
  const [isBannerPreviewOpen, setIsBannerPreviewOpen] = useState(false)
  const [broadcastConfirmTitle, setBroadcastConfirmTitle] = useState('')
  const [broadcastConfirmBody, setBroadcastConfirmBody] = useState('')
  const [bannerConfirmContent, setBannerConfirmContent] = useState('')
  const [bannerConfirmCta, setBannerConfirmCta] = useState('')
  const [bannerConfirmLink, setBannerConfirmLink] = useState('')

  function notifyError(message: string) {
    setErrorMessage(message)
    toast.error(message)
  }

  function notifySuccess(message: string) {
    toast.success(message)
  }

  function getBroadcastSignature(title = broadcastTitle.trim(), content = broadcastBody.trim()) {
    return JSON.stringify({
      channel,
      audience,
      title,
      content,
    })
  }

  function getBannerSignature(content = bannerContent.trim(), ctaText = bannerCta.trim(), ctaLink = bannerLink.trim()) {
    return JSON.stringify({
      placement,
      bannerType,
      content,
      ctaText,
      ctaLink,
      startDate,
      endDate,
    })
  }

  function openBroadcastPreviewDialog() {
    setBroadcastConfirmTitle(broadcastTitle)
    setBroadcastConfirmBody(broadcastBody)
    setIsBroadcastPreviewOpen(true)
  }

  function openBannerPreviewDialog() {
    setBannerConfirmContent(bannerContent)
    setBannerConfirmCta(bannerCta)
    setBannerConfirmLink(bannerLink)
    setIsBannerPreviewOpen(true)
  }

  const summary = useMemo(() => {
    const running = banners.filter((b) => b.enabled).length
    const avgCtr =
      banners.length > 0 ? Number((banners.reduce((sum, item) => sum + item.ctr, 0) / banners.length).toFixed(2)) : 0
    const sent = broadcastRows.filter((x) => x.status === 'Đã gửi').length
    return { running, avgCtr, sent }
  }, [banners, broadcastRows])

  useEffect(() => {
    let active = true
    async function loadData(showLoader: boolean) {
      if (showLoader) setIsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/notifications`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = (await res.json()) as NotificationsApiResponse
        if (!res.ok) {
          throw new Error(data.error || 'Không tải được dữ liệu notifications')
        }
        if (!active) return
        setBroadcastRows(data.broadcasts ?? [])
        setBanners(data.banners ?? [])
      } catch (error) {
        if (!active) return
        notifyError(error instanceof Error ? error.message : 'Không tải được dữ liệu')
      } finally {
        if (active && showLoader) setIsLoading(false)
      }
    }
    void loadData(true)
    const timer = window.setInterval(() => {
      void loadData(false)
    }, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  async function submitBroadcast(
    kind: 'now' | 'schedule',
    override?: { title: string; content: string }
  ): Promise<boolean> {
    const finalTitle = (override?.title ?? broadcastTitle).trim()
    const finalContent = (override?.content ?? broadcastBody).trim()
    if (!finalTitle || !finalContent) return false
    if (!broadcastPreview || broadcastPreviewSignature !== getBroadcastSignature(finalTitle, finalContent)) {
      notifyError('Vui lòng bấm "AI Preview (Gemini)" cho nội dung Broadcast hiện tại trước khi gửi.')
      return false
    }
    setErrorMessage('')
    setIsSubmittingBroadcast(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/notifications/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: 'broadcast',
          action: kind === 'now' ? 'send_now' : 'schedule',
          channel,
          audience,
          title: finalTitle,
          content: finalContent,
        }),
      })
      const data = (await res.json()) as { item?: BroadcastHistory; error?: string }
      if (!res.ok || !data.item) {
        throw new Error(data.error || 'Gửi broadcast thất bại')
      }
      setBroadcastRows((prev) => [data.item!, ...prev])
      notifySuccess(kind === 'now' ? 'Đã gửi broadcast thành công' : 'Đã lên lịch broadcast thành công')
      return true
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Gửi broadcast thất bại')
      return false
    } finally {
      setIsSubmittingBroadcast(false)
    }
  }

  async function createBanner(
    override?: { content: string; ctaText: string; ctaLink: string }
  ): Promise<boolean> {
    const finalContent = (override?.content ?? bannerContent).trim()
    const finalCtaText = (override?.ctaText ?? bannerCta).trim()
    const finalCtaLink = (override?.ctaLink ?? bannerLink).trim()
    if (!finalContent || !finalCtaText || !finalCtaLink || !startDate || !endDate) return false
    if (!bannerPreview || bannerPreviewSignature !== getBannerSignature(finalContent, finalCtaText, finalCtaLink)) {
      notifyError('Vui lòng bấm "AI Preview (Gemini)" cho nội dung Banner hiện tại trước khi tạo.')
      return false
    }
    setErrorMessage('')
    setIsSubmittingBanner(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/notifications/banner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: 'banner',
          placement,
          bannerType,
          content: finalContent,
          ctaText: finalCtaText,
          ctaLink: finalCtaLink,
          startDate,
          endDate,
        }),
      })
      const data = (await res.json()) as { item?: BannerItem; error?: string }
      if (!res.ok || !data.item) {
        throw new Error(data.error || 'Tạo banner thất bại')
      }
      setBanners((prev) => [data.item!, ...prev])
      notifySuccess('Tạo banner thành công')
      return true
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Tạo banner thất bại')
      return false
    } finally {
      setIsSubmittingBanner(false)
    }
  }

  async function toggleBanner(id: string, enabled: boolean) {
    setErrorMessage('')
    setIsTogglingBannerId(id)
    const previous = banners
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, enabled } : b)))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/notifications/banner/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ type: 'banner_toggle', id, enabled }),
      })
      const data = (await res.json()) as { item?: BannerItem; ok?: boolean; error?: string }
      if (!res.ok) {
        throw new Error(data.error || 'Cập nhật banner thất bại')
      }
      if (data.item) {
        setBanners((prev) => prev.map((b) => (b.id === data.item!.id ? data.item! : b)))
      }
      notifySuccess(enabled ? 'Đã bật banner' : 'Đã tắt banner')
    } catch (error) {
      setBanners(previous)
      notifyError(error instanceof Error ? error.message : 'Cập nhật banner thất bại')
    } finally {
      setIsTogglingBannerId(null)
    }
  }

  async function generateBroadcastPreview() {
    const finalTitle = broadcastConfirmTitle.trim()
    const finalBody = broadcastConfirmBody.trim()
    if (!finalTitle || !finalBody) {
      notifyError('Nhập đủ tiêu đề và nội dung broadcast trước khi preview.')
      return
    }
    setErrorMessage('')
    setIsPreviewingBroadcast(true)
    try {
      const signature = getBroadcastSignature(finalTitle, finalBody)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/notifications/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: 'broadcast',
          channel,
          audience,
          title: finalTitle,
          content: finalBody,
        }),
      })
      const data = (await res.json()) as { preview?: AiPreview; error?: string }
      if (!res.ok || !data.preview) {
        throw new Error(data.error || 'AI preview broadcast thất bại')
      }
      setBroadcastPreview(data.preview)
      setBroadcastPreviewSignature(signature)
      notifySuccess('AI Preview Broadcast thành công')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'AI preview broadcast thất bại')
    } finally {
      setIsPreviewingBroadcast(false)
    }
  }

  async function generateBannerPreview() {
    const finalContent = bannerConfirmContent.trim()
    const finalCta = bannerConfirmCta.trim()
    const finalLink = bannerConfirmLink.trim()
    if (!finalContent || !finalCta || !finalLink) {
      notifyError('Nhập đủ nội dung banner/CTA/link trước khi preview.')
      return
    }
    setErrorMessage('')
    setIsPreviewingBanner(true)
    try {
      const signature = getBannerSignature(finalContent, finalCta, finalLink)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/notifications/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: 'banner',
          placement,
          bannerType,
          content: finalContent,
          ctaText: finalCta,
          ctaLink: finalLink,
          startDate,
          endDate,
        }),
      })
      const data = (await res.json()) as { preview?: AiPreview; error?: string }
      if (!res.ok || !data.preview) {
        throw new Error(data.error || 'AI preview banner thất bại')
      }
      setBannerPreview(data.preview)
      setBannerPreviewSignature(signature)
      notifySuccess('AI Preview Banner thành công')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'AI preview banner thất bại')
    } finally {
      setIsPreviewingBanner(false)
    }
  }

  async function confirmSendNowFromPopup() {
    const ok = await submitBroadcast('now', {
      title: broadcastConfirmTitle,
      content: broadcastConfirmBody,
    })
    if (ok) {
      setBroadcastTitle(broadcastConfirmTitle)
      setBroadcastBody(broadcastConfirmBody)
      setIsBroadcastPreviewOpen(false)
    }
  }

  async function confirmCreateBannerFromPopup() {
    const ok = await createBanner({
      content: bannerConfirmContent,
      ctaText: bannerConfirmCta,
      ctaLink: bannerConfirmLink,
    })
    if (ok) {
      setBannerContent(bannerConfirmContent)
      setBannerCta(bannerConfirmCta)
      setBannerLink(bannerConfirmLink)
      setIsBannerPreviewOpen(false)
    }
  }

  async function copyText(value: string, successMessage = 'Đã copy vào clipboard') {
    try {
      await navigator.clipboard.writeText(value)
      notifySuccess(successMessage)
    } catch {
      notifyError('Không thể copy. Hãy thử lại.')
    }
  }

  function buildBroadcastReadyText(preview: AiPreview) {
    return `Tiêu đề: ${preview.previewTitle}\n\nNội dung:\n${preview.previewBody}`.trim()
  }

  function buildBannerReadyText(preview: AiPreview) {
    const finalCta = (preview.previewCta ?? bannerConfirmCta ?? bannerCta).trim()
    const finalLink = (preview.previewLink ?? bannerConfirmLink ?? bannerLink).trim()
    return [
      `Tiêu đề Banner/Popup: ${preview.previewTitle}`,
      '',
      'Nội dung:',
      preview.previewBody,
      '',
      `CTA: ${finalCta}`,
      `Link: ${finalLink}`,
    ].join('\n').trim()
  }

  function applyBroadcastFromAi(preview: AiPreview) {
    setBroadcastConfirmTitle(preview.previewTitle)
    setBroadcastConfirmBody(preview.previewBody)
    notifySuccess('Đã áp dụng bản AI dùng ngay cho Broadcast')
  }

  function applyBannerFromAi(preview: AiPreview) {
    setBannerConfirmContent(preview.previewBody)
    setBannerConfirmCta((preview.previewCta ?? bannerConfirmCta ?? bannerCta).trim())
    setBannerConfirmLink((preview.previewLink ?? bannerConfirmLink ?? bannerLink).trim())
    notifySuccess('Đã áp dụng bản AI dùng ngay cho Banner')
  }

  return (
    <div className="relative space-y-8 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/70 to-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.1),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.1),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý Thông báo & Nội dung</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quản trị broadcast marketing, thông báo bảo trì và banner/popup theo chiến dịch.
        </p>
        {isLoading ? <p className="mt-2 text-xs text-blue-600">Đang tải dữ liệu thật từ database...</p> : null}
        {errorMessage ? <p className="mt-2 text-xs text-red-600">{errorMessage}</p> : null}
      </div>

      <div className="relative grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <Send className="h-4 w-4 text-blue-600" />
              Broadcast đã gửi
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-slate-900">{summary.sent}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <LayoutTemplate className="h-4 w-4 text-violet-600" />
              Banner đang bật
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-slate-900">{summary.running}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <MousePointerClick className="h-4 w-4 text-cyan-600" />
              CTR trung bình
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-slate-900">{summary.avgCtr}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="broadcast" className="relative">
        <TabsList className="h-10 rounded-xl bg-slate-100">
          <TabsTrigger value="broadcast" className="rounded-lg px-4">
            <Megaphone className="h-4 w-4" />
            Gửi thông báo (Broadcast)
          </TabsTrigger>
          <TabsTrigger value="banner" className="rounded-lg px-4">
            <Bell className="h-4 w-4" />
            Banner & Popup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="broadcast" className="mt-4 space-y-6">
          <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-slate-900">Tạo thông báo mới</CardTitle>
              <CardDescription className="text-slate-500">
                Điền nhanh chiến dịch gửi Email / In-app / Push đến đúng nhóm người dùng.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Kênh gửi</Label>
                  <Select value={channel} onValueChange={(value) => setChannel(value as BroadcastChannel)}>
                    <SelectTrigger className="w-full border-slate-300 bg-white">
                      <SelectValue placeholder="Chọn kênh gửi" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nhóm mục tiêu</Label>
                  <Select value={audience} onValueChange={(value) => setAudience(value as AudienceGroup)}>
                    <SelectTrigger className="w-full border-slate-300 bg-white">
                      <SelectValue placeholder="Chọn nhóm mục tiêu" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="broadcast-title">Tiêu đề thông báo</Label>
                <Input
                  id="broadcast-title"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="border-slate-300 bg-white"
                  placeholder="Ví dụ: Nhắc gia hạn gói trong 3 ngày"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="broadcast-body">Nội dung</Label>
                  <p className="text-xs text-slate-500">
                    Gợi ý biến cá nhân hóa: <span className="font-medium text-violet-700">{'{{tên_user}}'}</span>
                  </p>
                </div>
                <Textarea
                  id="broadcast-body"
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  className="min-h-36 border-slate-300 bg-white"
                  placeholder="Nhập nội dung thông báo..."
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={openBroadcastPreviewDialog}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={isSubmittingBroadcast}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {isSubmittingBroadcast ? 'Đang gửi...' : 'Gửi ngay'}
                </Button>
                <Button variant="outline" onClick={() => submitBroadcast('schedule')} disabled={isSubmittingBroadcast}>
                  <CalendarClock className="mr-1.5 h-4 w-4" />
                  Lên lịch gửi
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-slate-900">Lịch sử Broadcast</CardTitle>
              <CardDescription className="text-slate-500">
                Theo dõi trạng thái gửi và tỷ lệ mở của từng chiến dịch.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="[&_td]:border-r-0 [&_th]:border-r-0">
                <TableHeader>
                  <TableRow className="border-slate-200 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>Chiến dịch</TableHead>
                    <TableHead>Nhóm nhận</TableHead>
                    <TableHead>Kênh</TableHead>
                    <TableHead>Thời gian gửi</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Open rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {broadcastRows.map((item) => (
                    <TableRow key={item.id} className="border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="font-medium text-slate-800">{item.campaign}</TableCell>
                      <TableCell className="text-sm text-slate-600">{item.audience}</TableCell>
                      <TableCell className="text-sm text-slate-600">{item.channel}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {format(parseISO(item.sentAt), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell>{statusBadge(item.status)}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-slate-700">{item.openRate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banner" className="mt-4 space-y-6">
          <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-slate-900">Thêm Banner mới</CardTitle>
              <CardDescription className="text-slate-500">
                Tạo nhanh thông báo hiển thị theo vị trí và loại cảnh báo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vị trí hiển thị</Label>
                  <Select value={placement} onValueChange={(value) => setPlacement(value as BannerPlacement)}>
                    <SelectTrigger className="w-full border-slate-300 bg-white">
                      <SelectValue placeholder="Chọn vị trí hiển thị" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANNER_PLACEMENTS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Loại thông báo</Label>
                  <Select value={bannerType} onValueChange={(value) => setBannerType(value as BannerType)}>
                    <SelectTrigger className="w-full border-slate-300 bg-white">
                      <SelectValue placeholder="Chọn loại thông báo" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANNER_TYPES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="banner-content">Nội dung Banner</Label>
                <Textarea
                  id="banner-content"
                  value={bannerContent}
                  onChange={(e) => setBannerContent(e.target.value)}
                  className="min-h-24 border-slate-300 bg-white"
                  placeholder="Ví dụ: Ưu đãi nâng cấp gói chỉ trong 48 giờ."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="banner-cta">Nút hành động (CTA)</Label>
                  <Input
                    id="banner-cta"
                    value={bannerCta}
                    onChange={(e) => setBannerCta(e.target.value)}
                    className="border-slate-300 bg-white"
                    placeholder="Nâng cấp ngay"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="banner-link">Link đích</Label>
                  <Input
                    id="banner-link"
                    value={bannerLink}
                    onChange={(e) => setBannerLink(e.target.value)}
                    className="border-slate-300 bg-white"
                    placeholder="/pricing"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="banner-start">Ngày bắt đầu</Label>
                  <Input
                    id="banner-start"
                    type="date"
                    value={startDate}
                    readOnly // Ngăn người dùng sửa, vì mặc định là hôm nay
                    className="border-slate-300 bg-slate-50 cursor-not-allowed" // Thêm style để trông như bị disable
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="banner-end">Ngày kết thúc</Label>
                  <Input
                    id="banner-end"
                    type="date"
                    value={endDate}
                    min={startDate} // <--- QUAN TRỌNG: Không cho chọn ngày trước startDate
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-slate-300 bg-white"
                  />
                </div>
              </div>

              <Button
                onClick={openBannerPreviewDialog}
                className="bg-violet-600 hover:bg-violet-700"
                disabled={isSubmittingBanner}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {isSubmittingBanner ? 'Đang tạo...' : 'Tạo Banner'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-slate-900">Danh sách Banner</CardTitle>
              <CardDescription className="text-slate-500">
                Hiển thị tất cả banner và trạng thái bật/tắt, theo dõi nội dung, loại và CTR.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {banners.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">
                    Chưa có banner trong cơ sở dữ liệu.
                  </div>
                )}
                {banners.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    {(() => {
                      const scheduleStatus = getBannerScheduleStatus(item)
                      const isExpired = scheduleStatus === 'Hết hạn'
                      return (
                        <>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{item.placement}</p>
                        <div className="flex items-center gap-2">
                          {bannerTypeBadge(item.type)}
                          {bannerScheduleBadge(scheduleStatus)}
                          <Badge
                            className={
                              item.enabled
                                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                                : 'border border-slate-400/40 bg-slate-400/10 text-slate-700'
                            }
                          >
                            {item.enabled ? 'Đang bật' : 'Tạm dừng'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-500">Toggle</Label>
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={(checked) => toggleBanner(item.id, checked)}
                          aria-label={`toggle-${item.id}`}
                          disabled={isTogglingBannerId === item.id || isExpired}
                        />
                      </div>
                    </div>
                    <p className="mb-2 text-sm text-slate-700">{item.content}</p>
                    <div className="space-y-1 text-xs text-slate-500">
                      <p>
                        CTA: <span className="font-medium text-slate-700">{item.ctaText}</span> ({item.ctaLink})
                      </p>
                      <p>
                        Thời gian: {item.startDate} → {item.endDate}
                      </p>
                      <p className="font-medium text-slate-700">CTR: {item.ctr}%</p>
                    </div>
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isBroadcastPreviewOpen} onOpenChange={setIsBroadcastPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview Broadcast Trước Khi Gửi</DialogTitle>
            <DialogDescription>
              Bấm AI Preview để kiểm tra nội dung bằng Gemini key riêng, sau đó xác nhận gửi ngay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Kênh: {channel} • Nhóm: {audience}</p>
              <Input
                value={broadcastConfirmTitle}
                onChange={(e) => setBroadcastConfirmTitle(e.target.value)}
                className="mt-2 border-slate-300 bg-white"
                placeholder="Tiêu đề thông báo"
              />
              <Textarea
                value={broadcastConfirmBody}
                onChange={(e) => setBroadcastConfirmBody(e.target.value)}
                className="mt-2 min-h-28 border-slate-300 bg-white"
                placeholder="Nội dung thông báo"
              />
            </div>

            {broadcastPreview && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Kết quả AI Preview</p>
                  <Badge className="border border-blue-500/40 bg-blue-500/10 text-blue-700">
                    {broadcastPreview.qualityScore}/100
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">Mức rủi ro: {broadcastPreview.riskLevel}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{broadcastPreview.previewTitle}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{broadcastPreview.previewBody}</p>
                <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-800">Bản dùng ngay (copy-paste)</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyBroadcastFromAi(broadcastPreview)}
                      >
                        Dùng bản AI
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          copyText(buildBroadcastReadyText(broadcastPreview), 'Đã copy bản dùng ngay Broadcast')
                        }
                      >
                        Copy bản dùng ngay
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    readOnly
                    value={buildBroadcastReadyText(broadcastPreview)}
                    className="min-h-24 border-blue-200 bg-white text-xs"
                  />
                </div>
                {broadcastPreview.issues.length > 0 && (
                  <p className="mt-2 text-xs text-rose-600">Lưu ý: {broadcastPreview.issues.join(' | ')}</p>
                )}
                {broadcastPreview.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-emerald-700">Gợi ý:</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyText(
                            broadcastPreview.suggestions.join('\n'),
                            'Đã copy gợi ý Broadcast'
                          )
                        }
                      >
                        Copy gợi ý
                      </Button>
                    </div>
                    <Textarea
                      readOnly
                      value={broadcastPreview.suggestions.join('\n')}
                      className="min-h-24 border-emerald-200 bg-emerald-50/40 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBroadcastPreviewOpen(false)}>
              Hủy
            </Button>
            <Button variant="secondary" onClick={generateBroadcastPreview} disabled={isPreviewingBroadcast}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {isPreviewingBroadcast ? 'AI đang kiểm tra...' : 'AI Preview'}
            </Button>
            <Button onClick={confirmSendNowFromPopup} disabled={isSubmittingBroadcast}>
              <Send className="mr-1.5 h-4 w-4" />
              {isSubmittingBroadcast ? 'Đang gửi...' : 'Xác nhận gửi ngay'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBannerPreviewOpen} onOpenChange={setIsBannerPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview Banner/Popup Trước Khi Tạo</DialogTitle>
            <DialogDescription>
              Bấm AI Preview để kiểm tra nội dung bằng Gemini key riêng, sau đó xác nhận tạo banner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Vị trí: {placement} • Loại: {bannerType}</p>
              <Textarea
                value={bannerConfirmContent}
                onChange={(e) => setBannerConfirmContent(e.target.value)}
                className="mt-2 min-h-24 border-slate-300 bg-white"
                placeholder="Nội dung banner"
              />
              <Input
                value={bannerConfirmCta}
                onChange={(e) => setBannerConfirmCta(e.target.value)}
                className="mt-2 border-slate-300 bg-white"
                placeholder="CTA"
              />
              <Input
                value={bannerConfirmLink}
                onChange={(e) => setBannerConfirmLink(e.target.value)}
                className="mt-2 border-slate-300 bg-white"
                placeholder="Link đích"
              />
            </div>

            {bannerPreview && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Kết quả AI Preview</p>
                  <Badge className="border border-violet-500/40 bg-violet-500/10 text-violet-700">
                    {bannerPreview.qualityScore}/100
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">Mức rủi ro: {bannerPreview.riskLevel}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{bannerPreview.previewTitle}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{bannerPreview.previewBody}</p>
                <p className="mt-2 text-xs text-slate-600">
                  CTA dùng ngay: <span className="font-medium text-slate-800">{bannerPreview.previewCta || bannerConfirmCta}</span>
                </p>
                <p className="text-xs text-slate-600">
                  Link dùng ngay: <span className="font-medium text-slate-800">{bannerPreview.previewLink || bannerConfirmLink}</span>
                </p>
                <div className="mt-3 space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-violet-800">Bản dùng ngay (copy-paste)</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyBannerFromAi(bannerPreview)}
                      >
                        Dùng bản AI
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          copyText(buildBannerReadyText(bannerPreview), 'Đã copy bản dùng ngay Banner')
                        }
                      >
                        Copy bản dùng ngay
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    readOnly
                    value={buildBannerReadyText(bannerPreview)}
                    className="min-h-24 border-violet-200 bg-white text-xs"
                  />
                </div>
                {bannerPreview.issues.length > 0 && (
                  <p className="mt-2 text-xs text-rose-600">Lưu ý: {bannerPreview.issues.join(' | ')}</p>
                )}
                {bannerPreview.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-emerald-700">Gợi ý:</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyText(
                            bannerPreview.suggestions.join('\n'),
                            'Đã copy gợi ý Banner'
                          )
                        }
                      >
                        Copy gợi ý
                      </Button>
                    </div>
                    <Textarea
                      readOnly
                      value={bannerPreview.suggestions.join('\n')}
                      className="min-h-24 border-emerald-200 bg-emerald-50/40 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBannerPreviewOpen(false)}>
              Hủy
            </Button>
            <Button variant="secondary" onClick={generateBannerPreview} disabled={isPreviewingBanner}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {isPreviewingBanner ? 'AI đang kiểm tra...' : 'AI Preview'}
            </Button>
            <Button onClick={confirmCreateBannerFromPopup} disabled={isSubmittingBanner}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {isSubmittingBanner ? 'Đang tạo...' : 'Xác nhận tạo Banner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(isPreviewingBroadcast || isPreviewingBanner) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            AI đang xử lý preview, vui lòng chờ...
          </div>
        </div>
      )}
    </div>
  )
}
