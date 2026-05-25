'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { UserAiSettings, AiTaskType, TaskAiConfig } from '@/lib/custom-api-keys-types'
import { DEFAULT_AI_SETTINGS } from '@/lib/custom-api-keys-types'
import { loadUserAiSettings, saveUserAiSettings } from '@/lib/custom-api-keys-storage'

// ── Context value ─────────────────────────────────────────────────────────────
type UserAiSettingsContextValue = {
  settings: UserAiSettings
  hydrated: boolean
  /** Cập nhật cấu hình cho 1 loại tác vụ */
  updateTaskConfig: (task: AiTaskType, patch: Partial<TaskAiConfig>) => void
  /** Reset về mặc định hệ thống */
  resetSettings: () => void
  /** Lấy cấu hình để gửi API (trả về object cho backend) */
  getApiPayload: (task: AiTaskType) => { provider: string; model: string; api_key?: string }
}

const UserAiSettingsContext = createContext<UserAiSettingsContextValue | null>(null)

export function CustomApiKeysProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserAiSettings>(DEFAULT_AI_SETTINGS)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate từ localStorage
  useEffect(() => {
    setSettings(loadUserAiSettings())
    setHydrated(true)
  }, [])

  // Persist khi thay đổi
  useEffect(() => {
    if (!hydrated) return
    saveUserAiSettings(settings)
  }, [settings, hydrated])

  const updateTaskConfig = useCallback((task: AiTaskType, patch: Partial<TaskAiConfig>) => {
    setSettings((prev) => ({
      ...prev,
      [task]: { ...prev[task], ...patch },
    }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_AI_SETTINGS)
  }, [])

  const getApiPayload = useCallback(
    (task: AiTaskType) => {
      const cfg = settings[task]
      return {
        provider: cfg.providerId,
        model: cfg.modelId,
        ...(cfg.apiKey.trim() ? { api_key: cfg.apiKey.trim() } : {}),
      }
    },
    [settings]
  )

  const value = useMemo<UserAiSettingsContextValue>(
    () => ({ settings, hydrated, updateTaskConfig, resetSettings, getApiPayload }),
    [settings, hydrated, updateTaskConfig, resetSettings, getApiPayload]
  )

  return (
    <UserAiSettingsContext.Provider value={value}>{children}</UserAiSettingsContext.Provider>
  )
}

export function useUserAiSettings() {
  const ctx = useContext(UserAiSettingsContext)
  if (!ctx) throw new Error('useUserAiSettings must be used within CustomApiKeysProvider')
  return ctx
}

// Backward compat alias
export { useUserAiSettings as useCustomApiKeys }
