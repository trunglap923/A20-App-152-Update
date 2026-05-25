export function getResetPasswordRedirectUrl() {
  if (typeof window !== 'undefined') {
    const configuredUrl = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL
    if (configuredUrl) {
      return `${configuredUrl.replace(/\/$/, '')}/reset-password`
    }

    return `${window.location.origin}/reset-password`
  }

  const configuredUrl = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL
  if (configuredUrl) {
    return `${configuredUrl.replace(/\/$/, '')}/reset-password`
  }

  return '/reset-password'
}
