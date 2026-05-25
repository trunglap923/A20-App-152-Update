/**
 * Types cho hệ thống AI Provider do người dùng cấu hình.
 * Tách biệt 3 loại tác vụ: văn bản, video, audio-to-text.
 */

// ── 4 providers được hỗ trợ ──────────────────────────────────────────────────
export type ProviderId = 'openai' | 'gemini' | 'anthropic' | 'grok'

export interface ModelVersionOption {
  id: string
  label: string
}

export interface AiProviderDefinition {
  id: ProviderId
  label: string
  /** Icon emoji dùng hiển thị nhanh */
  icon: string
  /** Model versions hỗ trợ cho xử lý văn bản/JSON */
  textModels: ModelVersionOption[]
  /** Model versions hỗ trợ cho vision (video frames + text). Nếu rỗng = không hỗ trợ */
  visionModels: ModelVersionOption[]
  /** Hỗ trợ audio-to-text (STT)? */
  supportsStt: boolean
  /** STT model versions (nếu hỗ trợ) */
  sttModels: ModelVersionOption[]
  /** Placeholder cho API key */
  keyPlaceholder: string
}

export const AI_PROVIDER_DEFINITIONS: AiProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '⚡',
    textModels: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o4-mini', label: 'o4-mini' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
    visionModels: [
      { id: 'gpt-4o', label: 'GPT-4o (Vision)' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (Vision)' },
    ],
    supportsStt: true,
    sttModels: [
      { id: 'whisper-1', label: 'Whisper-1' },
      { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
      { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini Transcribe' },
    ],
    keyPlaceholder: 'sk-…',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    icon: '✨',
    textModels: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
    visionModels: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Vision)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Vision)' },
    ],
    supportsStt: false,
    sttModels: [],
    keyPlaceholder: 'AIza…',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    icon: '🧠',
    textModels: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    ],
    visionModels: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Vision)' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Vision)' },
    ],
    supportsStt: false,
    sttModels: [],
    keyPlaceholder: 'sk-ant-…',
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    icon: '🚀',
    textModels: [
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-3-mini', label: 'Grok 3 mini' },
      { id: 'grok-2', label: 'Grok 2' },
    ],
    visionModels: [
      { id: 'grok-2-vision', label: 'Grok 2 Vision' },
    ],
    supportsStt: false,
    sttModels: [],
    keyPlaceholder: 'xai-…',
  },
]

export function getProviderDefinition(id: ProviderId): AiProviderDefinition | undefined {
  return AI_PROVIDER_DEFINITIONS.find((p) => p.id === id)
}

// ── 3 loại tác vụ AI ──────────────────────────────────────────────────────────
export type AiTaskType = 'text' | 'vision' | 'stt'

export const AI_TASK_DEFINITIONS: {
  id: AiTaskType
  label: string
  description: string
  icon: string
  lockToOpenAI?: boolean // STT bắt buộc dùng OpenAI
}[] = [
  {
    id: 'text',
    label: 'Xử lý văn bản',
    description: 'Phân tích tài liệu PDF, YouTube, sinh tóm tắt, bài học, câu hỏi trắc nghiệm.',
    icon: '📝',
  },
  {
    id: 'vision',
    label: 'Xử lý Video',
    description: 'Phân tích video — trích xuất frames, kết hợp hình ảnh và văn bản để tạo bài học.',
    icon: '🎬',
  },
  {
    id: 'stt',
    label: 'Audio to Text',
    description: 'Chuyển âm thanh (ghi âm trực tiếp, file audio) thành văn bản có dấu thời gian.',
    icon: '🎙️',
    lockToOpenAI: true,
  },
]

// ── Cấu hình cho từng loại tác vụ ────────────────────────────────────────────
export interface TaskAiConfig {
  providerId: ProviderId
  modelId: string
  /** API key riêng của user cho provider này (có thể rỗng = dùng hệ thống) */
  apiKey: string
}

/** Cấu hình đầy đủ 3 loại tác vụ */
export interface UserAiSettings {
  text: TaskAiConfig
  vision: TaskAiConfig
  stt: TaskAiConfig
}

export const DEFAULT_AI_SETTINGS: UserAiSettings = {
  text: { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: '' },
  vision: { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: '' },
  stt: { providerId: 'openai', modelId: 'whisper-1', apiKey: '' },
}

// ── Legacy types (giữ để tương thích ngược) ────────────────────────────────
export interface StoredUserApiKey {
  id: string
  providerId: ProviderId
  version: string
  secret: string
  createdAt: number
}

export interface UserApiKeysState {
  keys: StoredUserApiKey[]
  activeKeyId: string | null
}
