export type AuthAuditEvent = 'login' | 'register' | 'logout' | 'password_reset'

type LogAuthEventInput = {
  event: AuthAuditEvent
  email?: string
  success: boolean
  errorCode?: string
  device?: string
}

async function getDetailedDeviceInfo(): Promise<string> {
  if (typeof window === 'undefined') return 'Unknown Device'
  
  const ua = navigator.userAgent
  const uaData = (navigator as any).userAgentData
  
  let os = 'Unknown OS'
  let browser = 'Unknown Browser'
  let model = ''

  // 1. Browser Detection (Chặt chẽ hơn)
  if (/Edg\/([0-9.]+)/i.test(ua)) browser = `Edge ${ua.match(/Edg\/([0-9.]+)/i)?.[1].split('.')[0]}`
  else if (/Chrome\/([0-9.]+)/i.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([0-9.]+)/i)?.[1].split('.')[0]}`
  else if (/Firefox\/([0-9.]+)/i.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([0-9.]+)/i)?.[1].split('.')[0]}`
  else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
    const ver = ua.match(/Version\/([0-9.]+)/i)?.[1]?.split('.')[0] || ''
    browser = `Safari ${ver}`
  }

  // 2. OS & Model Detection (Sử dụng Client Hints nếu có cho Win 11)
  if (uaData?.getHighEntropyValues) {
    try {
      const hints = await uaData.getHighEntropyValues(['platformVersion', 'platform', 'model'])
      if (hints.platform === 'Windows') {
        const major = parseInt(hints.platformVersion.split('.')[0], 10)
        os = major >= 13 ? 'Windows 11' : 'Windows 10'
      } else {
        os = hints.platform || os
      }
      if (hints.model) model = hints.model
    } catch (e) {}
  }

  // Fallback OS detection if Client Hints not available or not Windows
  if (os === 'Unknown OS') {
    if (/iPhone OS ([0-9_]+)/i.test(ua)) {
      os = `iOS ${ua.match(/iPhone OS ([0-9_]+)/i)?.[1].replace(/_/g, '.')}`
      model = 'iPhone'
    } else if (/Android ([0-9.]+)/i.test(ua)) {
      os = `Android ${ua.match(/Android ([0-9.]+)/i)?.[1]}`
      const modelMatch = ua.match(/; ([^;]+) Build\//)
      if (modelMatch) model = modelMatch[1]
    } else if (/Mac OS X ([0-9_]+)/i.test(ua)) {
      os = `macOS ${ua.match(/Mac OS X ([0-9_]+)/i)?.[1].replace(/_/g, '.')}`
      model = 'Mac'
    } else if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10'
    else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7'
    else if (/Linux/i.test(ua)) os = 'Linux'
  }

  // 3. Kết hợp chuỗi chuẩn nhất
  const components = [os, browser]
  if (model && !os.includes(model)) components.unshift(model)
  
  return components.filter(Boolean).join(' • ')
}

export async function logAuthEvent(input: LogAuthEventInput) {
  try {
    const deviceDetail = await getDetailedDeviceInfo()
    const payload = { ...input, device: input.device || deviceDetail }
    
    // Get token for auth (using the browser's supabase client)
    const { createClient } = await import('@/lib/supabaseClient')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/audit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    // Do not block authentication flow when logging fails.
  }
}
