function normalize(value?: string): string {
  return (value || '').trim().replace(/\/+$/, '')
}

function ensureApiSuffix(url: string): string {
  if (!url) return ''
  return /\/api$/i.test(url) ? url : `${url}/api`
}

function inferAppBaseUrl(): string {
  const fromEnv = normalize(process.env.NEXT_PUBLIC_APP_URL)
  if (fromEnv) return fromEnv

  const fromVercel = normalize(process.env.VERCEL_URL)
  if (fromVercel) return fromVercel.startsWith('http') ? fromVercel : `https://${fromVercel}`

  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  return ''
}

export const API_PROXY_BASE = '/api/backend'
export const APP_BASE_URL = inferAppBaseUrl()
export const API_BASE_URL = ensureApiSuffix(normalize(process.env.NEXT_PUBLIC_API_URL))
