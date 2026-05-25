import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

type AuditEvent = 'login' | 'register' | 'logout' | 'password_reset'

const ALLOWED_EVENTS: AuditEvent[] = ['login', 'register', 'logout', 'password_reset']
const CREATE_AT_MISSING_COLUMN_REGEX = /column .*create_at.* does not exist/i
const CREATED_AT_MISSING_COLUMN_REGEX = /column .*created_at.* does not exist/i
const INET_TYPE_ERROR_REGEX = /type inet|invalid input syntax for type inet/i

type AuditPayload = {
  event?: string
  email?: string
  success?: boolean
  errorCode?: string
  device?: string
}

type AuditInsertRow = {
  user_id: string | null
  email: string | null
  event: AuditEvent
  success: boolean
  ip: string | null
  user_agent: string | null
  device: string | null
  error_code: string | null
}

type AuditSelectRow = {
  id: string | number
  created_at?: string | null
  create_at?: string | null
  email: string | null
  event: string
  ip: string | null
  user_agent: string | null
  device: string | null
  success: boolean | null
}

type AdminServerClient = Awaited<ReturnType<typeof createServerClient>>
type LooseSupabaseClient = SupabaseClient<any, 'public', any>

function isAuditSelectRow(value: unknown): value is AuditSelectRow {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    ('id' in v) &&
    ('email' in v) &&
    ('event' in v) &&
    ('ip' in v) &&
    ('user_agent' in v) &&
    ('success' in v)
  )
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

async function isAdminByProfile(authClient: AdminServerClient, userId: string): Promise<boolean> {
  const { data, error } = await authClient
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) return false
  return data?.role?.toLowerCase() === 'admin'
}

function isFunctionNotFoundError(message: string): boolean {
  return /Could not find the function/i.test(message)
}

function normalizeIp(raw: string | null): string | null {
  if (!raw) return null
  const candidate = raw.split(',')[0]?.trim() ?? ''
  if (!candidate || candidate.toLowerCase() === 'unknown') return null

  const bracketIpv6 = candidate.match(/^\[([^[\]]+)\](?::\d+)?$/)
  if (bracketIpv6?.[1]) return bracketIpv6[1]

  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/)
  if (ipv4WithPort?.[1]) return ipv4WithPort[1]

  const mappedIpv4 = candidate.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (mappedIpv4?.[1]) return mappedIpv4[1]

  return candidate.replace(/%.+$/, '')
}

function getClientIp(req: NextRequest): string | null {
  const headerCandidates = [
    req.headers.get('x-forwarded-for'),
    req.headers.get('x-real-ip'),
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-client-ip'),
    req.headers.get('true-client-ip'),
    req.headers.get('fly-client-ip'),
    req.headers.get('x-vercel-forwarded-for'),
  ]

  for (const value of headerCandidates) {
    const ip = normalizeIp(value)
    if (ip) return ip
  }

  const reqWithIp = req as NextRequest & { ip?: string }
  return normalizeIp(reqWithIp.ip ?? null)
}

function parseDevice(userAgent: string): string {
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

function mapAuditRow(r: AuditSelectRow) {
  const at = r.create_at ?? r.created_at ?? new Date(0).toISOString()
  return {
    id: String(r.id),
    at,
    createdAt: at,
    email: r.email ?? '-',
    event: r.event,
    ip: r.ip ?? '-',
    userAgent: r.user_agent ?? '-',
    device: r.device ?? null,
    success: Boolean(r.success),
  }
}

async function insertAuditRow(
  db: LooseSupabaseClient,
  row: AuditInsertRow,
  nowIso: string
) {
  const withBothTimestamps = { ...row, create_at: nowIso, created_at: nowIso }
  let insertResult = await db.from('auth_audit_logs').insert(withBothTimestamps)

  if (insertResult.error && CREATE_AT_MISSING_COLUMN_REGEX.test(insertResult.error.message)) {
    insertResult = await db.from('auth_audit_logs').insert({ ...row, created_at: nowIso })
  }
  if (insertResult.error && CREATED_AT_MISSING_COLUMN_REGEX.test(insertResult.error.message)) {
    insertResult = await db.from('auth_audit_logs').insert(row)
  }
  if (insertResult.error && row.ip && INET_TYPE_ERROR_REGEX.test(insertResult.error.message)) {
    const rowWithoutIp = { ...row, ip: null }
    let retryResult = await db.from('auth_audit_logs').insert({ ...rowWithoutIp, create_at: nowIso, created_at: nowIso })
    if (retryResult.error && CREATE_AT_MISSING_COLUMN_REGEX.test(retryResult.error.message)) {
      retryResult = await db.from('auth_audit_logs').insert({ ...rowWithoutIp, created_at: nowIso })
    }
    if (retryResult.error && CREATED_AT_MISSING_COLUMN_REGEX.test(retryResult.error.message)) {
      retryResult = await db.from('auth_audit_logs').insert(rowWithoutIp)
    }
    insertResult = retryResult
  }

  return insertResult
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const event = url.searchParams.get('event')
  const result = url.searchParams.get('result')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 1), 1000)

  try {
    const authClient = await createServerClient()
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser()

    const allowed =
      !!user &&
      (isAdminEmail(user.email) || (await isAdminByProfile(authClient, user.id)))

    if (userError || !allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const queryClient =
      serviceRoleKey && supabaseUrl
        ? createSupabaseClient(supabaseUrl, serviceRoleKey)
        : authClient

    const runAuditQuery = (includeCreateAt: boolean) => {
      let query = queryClient
        .from('auth_audit_logs')
        .select(
          includeCreateAt
            ? 'id,created_at,create_at,email,event,ip,user_agent,device,success'
            : 'id,created_at,email,event,ip,user_agent,device,success'
        )
        .order(includeCreateAt ? 'create_at' : 'created_at', { ascending: false })
        .limit(limit)

      if (event && ALLOWED_EVENTS.includes(event as AuditEvent)) {
        query = query.eq('event', event)
      }
      if (result === 'success') query = query.eq('success', true)
      if (result === 'failed') query = query.eq('success', false)
      return query
    }

    let { data, error } = (await runAuditQuery(true)) as any
    if (error && /column .*create_at.* does not exist/i.test(error.message)) {
      ;({ data, error } = (await runAuditQuery(false)) as any)
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rowsSource: AuditSelectRow[] = Array.isArray(data) ? data.filter(isAuditSelectRow) : []
    const rows = rowsSource.map((row) => mapAuditRow(row))

    return NextResponse.json({ rows })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as AuditPayload
    const event = payload?.event
    if (!event || !ALLOWED_EVENTS.includes(event as AuditEvent)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    }

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_KEY ??
      process.env.SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 })
    }
    const dbKey = serviceRoleKey || anonKey
    if (!dbKey) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)' },
        { status: 500 }
      )
    }

    const authClient = await createServerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    const {
      data: { session },
    } = await authClient.auth.getSession()

    const db = createSupabaseClient(supabaseUrl, dbKey) as unknown as LooseSupabaseClient
    const nowIso = new Date().toISOString()
    const userAgent = req.headers.get('user-agent') ?? ''
    
    // Ưu tiên sử dụng device name chính xác từ Client nếu có
    const clientDevice = payload?.device
    const fallbackDevice = parseDevice(userAgent)
    const finalDevice = clientDevice 
      ? (clientDevice.startsWith('Windows') && fallbackDevice.includes('•') 
          ? `${clientDevice} • ${fallbackDevice.split('•')[1].trim()}` 
          : clientDevice)
      : fallbackDevice

    const row: AuditInsertRow = {
      user_id: user?.id ?? null,
      email: payload?.email?.trim()?.toLowerCase() || user?.email || null,
      event: event as AuditEvent,
      success: Boolean(payload?.success),
      ip: getClientIp(req),
      user_agent: userAgent,
      device: finalDevice || 'Unknown Device',
      error_code: payload?.errorCode || null,
    }

    console.log('[audit-auth] Attempting to insert row:', {
      event: row.event,
      email: row.email,
      success: row.success,
      device: row.device
    })

    let { error } = await insertAuditRow(db, row, nowIso)

    if (error) {
      console.error('[audit-auth] Initial insert failed:', error.message)
    }

    if (error && /row-level security policy/i.test(error.message)) {
      console.log('[audit-auth] RLS policy hit, trying fallbacks...')
      const accessToken = session?.access_token
      if (accessToken && anonKey) {
        const userDb = createSupabaseClient(supabaseUrl, anonKey, {
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        }) as unknown as LooseSupabaseClient
        const userInsert = await insertAuditRow(userDb, row, nowIso)
        if (!userInsert.error) {
          return NextResponse.json({ ok: true, mode: 'user_jwt' })
        }
      }

      const rpcPayloads = [
        {
          p_email: row.email ?? '',
          p_error_code: row.error_code ?? '',
          p_event: row.event,
          p_ip: row.ip ?? '',
          p_success: row.success,
          p_user_agent: row.user_agent ?? '',
          p_device: row.device ?? '',
          p_user_id: row.user_id ?? '',
        },
        ...(row.user_id
          ? [
              {
                p_user_id: row.user_id,
                p_email: row.email ?? '',
                p_event: row.event,
                p_success: row.success,
                p_ip: row.ip ?? '',
                p_user_agent: row.user_agent ?? '',
                p_device: row.device ?? '',
                p_error_code: row.error_code ?? '',
              },
            ]
          : []),
      ] as const

      let rpcErrorMessage: string | null = null
      for (const rpcPayload of rpcPayloads) {
        console.log(`[audit-auth] Trying RPC with payload:`, rpcPayload)
        const rpc = await db.rpc('insert_auth_audit_log', rpcPayload)
        if (!rpc.error) {
          console.log('[audit-auth] RPC insert successful')
          return NextResponse.json({ ok: true, mode: 'rpc' })
        }
        console.warn(`[audit-auth] RPC attempt failed:`, rpc.error.message)
        rpcErrorMessage = rpc.error.message
        if (!isFunctionNotFoundError(rpc.error.message)) break
      }

      console.error('[audit-auth] rpc fallback failed:', rpcErrorMessage)
      console.error('[audit-auth] insert failed:', error.message)
      return NextResponse.json(
        {
          ok: false,
          logged: false,
          error: rpcErrorMessage,
          hint: "Run SQL to allow insert / create RPC, then run: notify pgrst, 'reload schema'.",
        },
        { status: 200 }
      )
    }

    if (error) {
      console.error('[audit-auth] final insert failed:', error.message)
      return NextResponse.json({ ok: false, logged: false, error: error.message }, { status: 200 })
    }

    console.log('[audit-auth] Insert successful')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[audit-auth] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
