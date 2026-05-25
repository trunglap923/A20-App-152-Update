'use client'

import * as React from 'react'

type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  theme: ThemeMode
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemeMode) => void
}

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: ThemeMode
  attribute?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

function applyThemeClass(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export function ThemeProvider({ children, defaultTheme = 'system' }: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<ThemeMode>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    resolveTheme(defaultTheme)
  )

  const setTheme = React.useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme', nextTheme)
    }
    const nextResolved = resolveTheme(nextTheme)
    setResolvedTheme(nextResolved)
    applyThemeClass(nextResolved)
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const stored = window.localStorage.getItem('theme') as ThemeMode | null
    const initial = stored ?? defaultTheme
    setThemeState(initial)
    const initialResolved = resolveTheme(initial)
    setResolvedTheme(initialResolved)
    applyThemeClass(initialResolved)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const currentTheme = (window.localStorage.getItem('theme') as ThemeMode | null) ?? theme
      if (currentTheme === 'system') {
        const systemResolved = getSystemTheme()
        setResolvedTheme(systemResolved)
        applyThemeClass(systemResolved)
      }
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [defaultTheme, theme])

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
