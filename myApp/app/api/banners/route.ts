import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabaseServer'

type BannerPlacement = 'Top bar' | 'Cạnh bên' | 'Popup giữa màn hình'
type BannerType = 'Info' | 'Warning' | 'Khuyến mãi'

type BannerRow = {
  id: string
  placement: BannerPlacement
  type: BannerType
  content: string
  cta_text: string
  cta_link: string
  start_date: string
  end_date: string
  enabled: boolean
  ctr: number | null
}

function getServiceDb() {
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) return null
  return createSupabaseClient(supabaseUrl, serviceRoleKey)
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

function mapBannerRow(row: BannerRow) {
  return {
    id: row.id,
    placement: row.placement,
    type: row.type,
    content: row.content,
    ctaText: row.cta_text,
    ctaLink: row.cta_link,
    startDate: row.start_date,
    endDate: row.end_date,
    enabled: row.enabled,
    ctr: Number(row.ctr ?? 0),
  }
}

async function autoDisableOutOfDateBanners(dbAny: any, today: string) {
  try {
    await dbAny
      .from('admin_banners')
      .update({ enabled: false })
      .eq('enabled', true)
      .or(`start_date.gt.${today},end_date.lt.${today}`)
  } catch {
    // Ignore sync errors for public endpoint.
  }
}

export async function GET() {
  try {
    const today = getTodayInVietnam()
    const serviceDb = getServiceDb()

    if (serviceDb) {
      await autoDisableOutOfDateBanners(serviceDb as any, today)
      const { data, error } = await serviceDb
        .from('admin_banners')
        .select('id, placement, type, content, cta_text, cta_link, start_date, end_date, enabled, ctr')
        .eq('enabled', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        return NextResponse.json({ error: error.message, banners: [] }, { status: 500 })
      }

      return NextResponse.json({ banners: ((data ?? []) as BannerRow[]).map(mapBannerRow) })
    }

    const requestDb = await createServerClient()
    await autoDisableOutOfDateBanners(requestDb as any, today)
    const rpc = await (requestDb as any).rpc('list_admin_banners')
    if (rpc.error) {
      return NextResponse.json({ error: rpc.error.message, banners: [] }, { status: 500 })
    }
    const filtered = ((rpc.data ?? []) as BannerRow[]).filter(
      (row) => row.enabled && row.start_date <= today && row.end_date >= today
    )
    return NextResponse.json({ banners: filtered.map(mapBannerRow) })
  } catch {
    return NextResponse.json({ error: 'Internal server error', banners: [] }, { status: 500 })
  }
}
