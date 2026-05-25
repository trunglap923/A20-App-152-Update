'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Info, Sparkles, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabaseClient'

type BannerPlacement = 'Top bar' | 'Cạnh bên' | 'Popup giữa màn hình'
type BannerType = 'Info' | 'Warning' | 'Khuyến mãi'

type UserBanner = {
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

type BannerApiResponse = {
  banners?: UserBanner[]
  error?: string
}

const supabase = createClient()

function storageKey(scope: string, slot: 'top' | 'side' | 'popup') {
  return `user-banner-dismissed:${scope}:${slot}`
}

function readSetFromStorage(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed)
  } catch {
    return new Set<string>()
  }
}

function writeSetToStorage(key: string, value: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(value)))
  } catch {
    // ignore storage write errors in private mode / restricted environments
  }
}

function bannerTypeBadge(type: BannerType) {
  if (type === 'Warning') {
    return <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-700">Warning</Badge>
  }
  if (type === 'Khuyến mãi') {
    return <Badge className="border border-violet-500/40 bg-violet-500/10 text-violet-700">Khuyến mãi</Badge>
  }
  return <Badge className="border border-sky-500/40 bg-sky-500/10 text-sky-700">Info</Badge>
}

function bannerTheme(type: BannerType) {
  if (type === 'Warning') {
    return {
      shell: 'border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50',
      title: 'text-amber-900',
      text: 'text-amber-800/90',
      cta: 'text-amber-700 hover:text-amber-800',
      icon: <TriangleAlert className="h-4 w-4 text-amber-600" />,
      button: 'bg-amber-600 hover:bg-amber-700',
    }
  }
  if (type === 'Khuyến mãi') {
    return {
      shell: 'border-violet-200/80 bg-gradient-to-r from-violet-50 to-fuchsia-50',
      title: 'text-violet-900',
      text: 'text-violet-800/90',
      cta: 'text-violet-700 hover:text-violet-800',
      icon: <Sparkles className="h-4 w-4 text-violet-600" />,
      button: 'bg-violet-600 hover:bg-violet-700',
    }
  }
  return {
    shell: 'border-sky-200/80 bg-gradient-to-r from-sky-50 to-cyan-50',
    title: 'text-sky-900',
    text: 'text-sky-800/90',
    cta: 'text-sky-700 hover:text-sky-800',
    icon: <Info className="h-4 w-4 text-sky-600" />,
    button: 'bg-sky-600 hover:bg-sky-700',
  }
}

function getTodayInVietnam(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  return `${year}-${month}-${day}`
}

function isBannerVisibleToday(item: UserBanner, today: string): boolean {
  return item.enabled && item.startDate <= today && item.endDate >= today
}

export function UserAdBanners() {
  const [banners, setBanners] = useState<UserBanner[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [storageScope, setStorageScope] = useState<string>('anon')
  const [hasHydratedDismissedState, setHasHydratedDismissedState] = useState(false)
  const [dismissedTopIds, setDismissedTopIds] = useState<Set<string>>(new Set())
  const [dismissedSideIds, setDismissedSideIds] = useState<Set<string>>(new Set())
  const [closedPopupIds, setClosedPopupIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    async function loadScope() {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setStorageScope(data.user?.id ?? 'anon')
    }
    void loadScope()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setDismissedTopIds(readSetFromStorage(storageKey(storageScope, 'top')))
    setDismissedSideIds(readSetFromStorage(storageKey(storageScope, 'side')))
    setClosedPopupIds(readSetFromStorage(storageKey(storageScope, 'popup')))
    setHasHydratedDismissedState(true)
  }, [storageScope])

  useEffect(() => {
    if (!hasHydratedDismissedState) return
    writeSetToStorage(storageKey(storageScope, 'top'), dismissedTopIds)
  }, [dismissedTopIds, hasHydratedDismissedState, storageScope])

  useEffect(() => {
    if (!hasHydratedDismissedState) return
    writeSetToStorage(storageKey(storageScope, 'side'), dismissedSideIds)
  }, [dismissedSideIds, hasHydratedDismissedState, storageScope])

  useEffect(() => {
    if (!hasHydratedDismissedState) return
    writeSetToStorage(storageKey(storageScope, 'popup'), closedPopupIds)
  }, [closedPopupIds, hasHydratedDismissedState, storageScope])

  useEffect(() => {
    let active = true
    async function loadBanners() {
      setErrorMessage('')
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/banners`, { cache: 'no-store' })
        const data = (await res.json()) as BannerApiResponse
        if (!res.ok) {
          throw new Error(data.error || 'Không tải được quảng cáo')
        }
        if (!active) return
        setBanners(data.banners ?? [])
      } catch (error) {
        if (!active) return
        setErrorMessage(error instanceof Error ? error.message : 'Không tải được quảng cáo')
      }
    }
    void loadBanners()
    return () => {
      active = false
    }
  }, [])

  const todayInVn = getTodayInVietnam()
  const visibleBanners = useMemo(
    () => banners.filter((b) => isBannerVisibleToday(b, todayInVn)),
    [banners, todayInVn]
  )
  const topBanners = useMemo(
    () => visibleBanners.filter((b) => b.placement === 'Top bar' && !dismissedTopIds.has(b.id)),
    [visibleBanners, dismissedTopIds]
  )
  const sideBanners = useMemo(
    () => visibleBanners.filter((b) => b.placement === 'Cạnh bên' && !dismissedSideIds.has(b.id)),
    [visibleBanners, dismissedSideIds]
  )
  const popupBanner = useMemo(
    () => visibleBanners.find((b) => b.placement === 'Popup giữa màn hình' && !closedPopupIds.has(b.id)) ?? null,
    [visibleBanners, closedPopupIds]
  )

  if (errorMessage) {
    return null
  }

  return (
    <>
      {topBanners.length > 0 && (
        <div className="space-y-2 border-b bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          {topBanners.map((item) => (
            <div
              key={item.id}
              className={`group flex items-start justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm transition hover:shadow-md ${bannerTheme(item.type).shell}`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {bannerTheme(item.type).icon}
                  {bannerTypeBadge(item.type)}
                  <span className={`text-xs font-medium ${bannerTheme(item.type).title}`}>Tài trợ</span>
                </div>
                <p className={`text-sm font-medium ${bannerTheme(item.type).text}`}>{item.content}</p>
                <Link href={item.ctaLink} className={`text-xs font-semibold underline-offset-2 hover:underline ${bannerTheme(item.type).cta}`}>
                  {item.ctaText} {'\u2192'}
                </Link>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-slate-500 hover:bg-white/70"
                onClick={() => setDismissedTopIds((prev) => new Set(prev).add(item.id))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {sideBanners.length > 0 && (
        <div className="fixed bottom-5 right-5 z-40 hidden w-[300px] space-y-3 lg:block">
          {sideBanners.slice(0, 2).map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 shadow-xl transition hover:-translate-y-0.5 ${bannerTheme(item.type).shell}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {bannerTheme(item.type).icon}
                  {bannerTypeBadge(item.type)}
                </div>
                <button
                  className="rounded-full p-1 text-slate-500 hover:bg-white/70"
                  onClick={() => setDismissedSideIds((prev) => new Set(prev).add(item.id))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className={`mb-3 text-sm ${bannerTheme(item.type).text}`}>{item.content}</p>
              <Button asChild className={`h-9 rounded-lg px-3 text-xs font-semibold ${bannerTheme(item.type).button}`}>
                <Link href={item.ctaLink}>{item.ctaText}</Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {popupBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
          <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${bannerTheme(popupBanner.type).shell}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {bannerTheme(popupBanner.type).icon}
                {bannerTypeBadge(popupBanner.type)}
              </div>
              <button
                className="rounded-full p-1 text-slate-500 hover:bg-white/70"
                onClick={() => setClosedPopupIds((prev) => new Set(prev).add(popupBanner.id))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className={`mb-2 text-lg font-bold ${bannerTheme(popupBanner.type).title}`}>Ưu đãi dành cho bạn</h3>
            <p className={`mb-4 text-sm ${bannerTheme(popupBanner.type).text}`}>{popupBanner.content}</p>
            <div className="flex items-center gap-2">
              <Button asChild className={`rounded-lg px-4 ${bannerTheme(popupBanner.type).button}`}>
                <Link href={popupBanner.ctaLink}>{popupBanner.ctaText}</Link>
              </Button>
              <Button
                variant="outline"
                className="rounded-lg border-white/70 bg-white/70 hover:bg-white"
                onClick={() => setClosedPopupIds((prev) => new Set(prev).add(popupBanner.id))}
              >
                Để sau
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
