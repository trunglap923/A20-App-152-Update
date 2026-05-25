import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabaseServer'

type BroadcastChannel = 'Email' | 'In-app Notification' | 'Push Notification'
type AudienceGroup =
  | 'Tất cả user'
  | 'User đang hoạt động'
  | 'User trả phí (Pro/Enterprise)'
  | 'User sắp hết hạn gói'
type BannerPlacement = 'Top bar' | 'Cạnh bên' | 'Popup giữa màn hình'
type BannerType = 'Info' | 'Warning' | 'Khuyến mãi'

type BroadcastPreviewPayload = {
  type: 'broadcast'
  channel: BroadcastChannel
  audience: AudienceGroup
  title: string
  content: string
}

type BannerPreviewPayload = {
  type: 'banner'
  placement: BannerPlacement
  bannerType: BannerType
  content: string
  ctaText: string
  ctaLink: string
  startDate: string
  endDate: string
}

type GeminiPreviewResult = {
  qualityScore: number
  riskLevel: 'Thấp' | 'Trung bình' | 'Cao'
  issues: string[]
  suggestions: string[]
  previewTitle: string
  previewBody: string
  previewCta?: string
  previewLink?: string
}

function getAdminEmailList(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return getAdminEmailList().includes(email.trim().toLowerCase())
}

async function isAdminByProfile(reqClient: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data, error } = await reqClient.from('user_profiles').select('role').eq('id', userId).maybeSingle()
  if (error) return false
  return data?.role?.toLowerCase() === 'admin'
}

async function ensureAdmin(reqClient: Awaited<ReturnType<typeof createServerClient>>) {
  const {
    data: { user },
    error,
  } = await reqClient.auth.getUser()
  if (error || !user) return { ok: false as const, status: 401 }
  const allowed = isAdminEmail(user.email) || (await isAdminByProfile(reqClient, user.id))
  if (!allowed) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

function parseGeminiJson(raw: string): GeminiPreviewResult | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as Partial<GeminiPreviewResult>
    return {
      qualityScore: Math.max(0, Math.min(100, Number(parsed.qualityScore ?? 60))),
      riskLevel:
        parsed.riskLevel === 'Cao' || parsed.riskLevel === 'Thấp' || parsed.riskLevel === 'Trung bình'
          ? parsed.riskLevel
          : 'Trung bình',
      issues: Array.isArray(parsed.issues) ? parsed.issues.map((x) => String(x)).slice(0, 6) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map((x) => String(x)).slice(0, 6) : [],
      previewTitle: String(parsed.previewTitle ?? ''),
      previewBody: String(parsed.previewBody ?? ''),
      previewCta: parsed.previewCta ? String(parsed.previewCta) : undefined,
      previewLink: parsed.previewLink ? String(parsed.previewLink) : undefined,
    }
  } catch {
    return null
  }
}

async function askGemini(prompt: string): Promise<GeminiPreviewResult> {
  const key =
    process.env.GEMINI_PREVIEW_API_KEY ??
    process.env.NEXT_PUBLIC_GEMINI_PREVIEW_API_KEY ??
    process.env.GEMINI_API_KEY
  const normalizedKey = key?.trim().replace(/^['"]|['"]$/g, '')
  if (!normalizedKey) {
    throw new Error(
      'Thiếu key Gemini preview. Hãy đặt GEMINI_PREVIEW_API_KEY trong myApp/.env.local rồi restart Next.js.'
    )
  }

  const configuredModel = process.env.GEMINI_PREVIEW_MODEL?.trim()
  const models = [
    configuredModel,
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
  ].filter((x): x is string => Boolean(x))

  let lastError = 'Gemini preview failed'
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(normalizedKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    const text = await response.text()
    if (!response.ok) {
      lastError = `model=${model}, HTTP ${response.status}`
      // 404 thường là model không tồn tại với account/key hiện tại => thử model khác
      if (response.status === 404) continue
      throw new Error(`Gemini preview API lỗi: ${lastError}`)
    }

    let output = ''
    try {
      const parsed = JSON.parse(text) as any
      output = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    } catch {
      output = text
    }

    const result = parseGeminiJson(output)
    if (result) return result
    lastError = `model=${model}, không parse được JSON`
  }

  throw new Error(`Gemini preview API lỗi: ${lastError}`)
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createServerClient()
    const admin = await ensureAdmin(authClient)
    if (!admin.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: admin.status })
    }

    const payload = (await req.json()) as BroadcastPreviewPayload | BannerPreviewPayload
    if (payload.type === 'broadcast') {
      if (!payload.title?.trim() || !payload.content?.trim()) {
        return NextResponse.json({ error: 'Thiếu title/content cho broadcast preview' }, { status: 400 })
      }
      const prompt = `
Bạn là QA reviewer cho nội dung thông báo sản phẩm.
Hãy đánh giá payload sau và trả về JSON hợp lệ theo schema:
{
  "qualityScore": number(0-100),
  "riskLevel": "Thấp" | "Trung bình" | "Cao",
  "issues": string[],
  "suggestions": string[],
  "previewTitle": string,
  "previewBody": string
}
Yêu cầu:
- Viết tiếng Việt, ngắn gọn, thực dụng.
- previewTitle/previewBody là bản hoàn chỉnh có thể dùng ngay để gửi thật (production-ready).
- Nếu có biến {{tên_user}} thì giữ nguyên.
- Tránh văn phong chung chung, phải có thông tin hành động rõ ràng.

Payload:
${JSON.stringify(payload, null, 2)}
`.trim()

      const result = await askGemini(prompt)
      return NextResponse.json({ preview: result })
    }

    if (payload.type === 'banner') {
      if (!payload.content?.trim() || !payload.ctaText?.trim() || !payload.ctaLink?.trim()) {
        return NextResponse.json({ error: 'Thiếu content/cta cho banner preview' }, { status: 400 })
      }
      const prompt = `
Bạn là QA reviewer cho banner/popup trong ứng dụng.
Hãy đánh giá payload sau và trả về JSON hợp lệ theo schema:
{
  "qualityScore": number(0-100),
  "riskLevel": "Thấp" | "Trung bình" | "Cao",
  "issues": string[],
  "suggestions": string[],
  "previewTitle": string,
  "previewBody": string,
  "previewCta": string,
  "previewLink": string
}
Yêu cầu:
- Viết tiếng Việt.
- previewTitle là tiêu đề popup/banner, previewBody là nội dung hiển thị hoàn chỉnh có thể dùng ngay.
- previewCta và previewLink phải dùng ngay được khi tạo banner (không cần chỉnh sửa).
- previewLink phải là link nội bộ bắt đầu bằng "/" (ví dụ: /pricing, /billing, /status).
- Đảm bảo CTA rõ hành động và không gây hiểu nhầm.
- Ưu tiên thông điệp ngắn, rõ lợi ích, dễ click.

Payload:
${JSON.stringify(payload, null, 2)}
`.trim()

      const result = await askGemini(prompt)
      const normalizedPreview = {
        ...result,
        previewCta: (result.previewCta ?? payload.ctaText).trim() || payload.ctaText,
        previewLink: (result.previewLink ?? payload.ctaLink).trim() || payload.ctaLink,
      }
      return NextResponse.json({ preview: normalizedPreview })
    }

    return NextResponse.json({ error: 'Loại preview không hợp lệ' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview AI thất bại'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
