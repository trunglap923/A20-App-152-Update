import type { UserAiSettings, UserApiKeysState, StoredUserApiKey } from '@/lib/custom-api-keys-types'
import { DEFAULT_AI_SETTINGS } from '@/lib/custom-api-keys-types'

// Storage keys
const SETTINGS_KEY = 'nexus:user-ai-settings-v2'
// Legacy key (v1) — chỉ đọc để migrate
const LEGACY_KEY = 'nexus:user-api-keys-v1'

// ── New: Per-task settings ────────────────────────────────────────────────────

export function loadUserAiSettings(): UserAiSettings {
  if (typeof window === 'undefined') return DEFAULT_AI_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_AI_SETTINGS
    const parsed = JSON.parse(raw) as Partial<UserAiSettings>
    return {
      text: { ...DEFAULT_AI_SETTINGS.text, ...(parsed.text ?? {}) },
      vision: { ...DEFAULT_AI_SETTINGS.vision, ...(parsed.vision ?? {}) },
      stt: { ...DEFAULT_AI_SETTINGS.stt, ...(parsed.stt ?? {}) },
    }
  } catch {
    return DEFAULT_AI_SETTINGS
  }
}

export function saveUserAiSettings(settings: UserAiSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('[ai-settings] Không thể lưu cài đặt AI:', e)
  }
}

// ── Legacy: Dùng cho backward compat với api.ts cũ ───────────────────────────

const emptyState: UserApiKeysState = { keys: [], activeKeyId: null }

export function loadUserApiKeysState(): UserApiKeysState {
  if (typeof window === 'undefined') return emptyState
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return emptyState
    const keys = Array.isArray((parsed as UserApiKeysState).keys)
      ? (parsed as UserApiKeysState).keys.filter(
          (k) =>
            k &&
            typeof k.id === 'string' &&
            typeof k.providerId === 'string' &&
            typeof k.version === 'string' &&
            typeof k.secret === 'string'
        )
      : []
    const activeKeyId =
      typeof (parsed as UserApiKeysState).activeKeyId === 'string' ||
      (parsed as UserApiKeysState).activeKeyId === null
        ? (parsed as UserApiKeysState).activeKeyId
        : null
    const validActive =
      activeKeyId && keys.some((k) => k.id === activeKeyId) ? activeKeyId : null
    return { keys, activeKeyId: validActive }
  } catch {
    return emptyState
  }
}

export function saveUserApiKeysState(state: UserApiKeysState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('[custom-api-keys] Không thể lưu API keys:', e)
  }
}

export function maskSecret(secret: string): string {
  const t = secret.trim()
  if (t.length <= 8) return '••••••••'
  return `${t.slice(0, 4)}…${t.slice(-4)}`
}

/** @deprecated Dùng loadUserAiSettings() thay thế */
export function readActiveUserApiKeyFromStorage(): StoredUserApiKey | null {
  const { keys, activeKeyId } = loadUserApiKeysState()
  if (!activeKeyId) return null
  return keys.find((k) => k.id === activeKeyId) ?? null
}
