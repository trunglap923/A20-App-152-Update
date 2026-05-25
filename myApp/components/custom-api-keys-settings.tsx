'use client'

import { useState } from 'react'
import {
  KeyRound,
  FileText,
  Video,
  Mic,
  ChevronDown,
  RotateCcw,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  AI_PROVIDER_DEFINITIONS,
  AI_TASK_DEFINITIONS,
  DEFAULT_AI_SETTINGS,
  type AiTaskType,
  type ProviderId,
  type TaskAiConfig,
} from '@/lib/custom-api-keys-types'
import { maskSecret } from '@/lib/custom-api-keys-storage'
import { useUserAiSettings } from '@/contexts/custom-api-keys-context'

// ── Icons cho từng task ───────────────────────────────────────────────────────
const TASK_ICONS: Record<AiTaskType, React.ReactNode> = {
  text: <FileText className="h-4 w-4" />,
  vision: <Video className="h-4 w-4" />,
  stt: <Mic className="h-4 w-4" />,
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskConfigCard({
  taskId,
  config,
  onChange,
}: {
  taskId: AiTaskType
  config: TaskAiConfig
  onChange: (patch: Partial<TaskAiConfig>) => void
}) {
  const taskDef = AI_TASK_DEFINITIONS.find((t) => t.id === taskId)!
  const providerDef = AI_PROVIDER_DEFINITIONS.find((p) => p.id === config.providerId)
  const [showKey, setShowKey] = useState(false)

  // Xác định danh sách model phù hợp với task
  const modelList =
    taskId === 'text'
      ? providerDef?.textModels ?? []
      : taskId === 'vision'
      ? providerDef?.visionModels ?? []
      : providerDef?.sttModels ?? []

  const isLocked = taskDef.lockToOpenAI === true

  // Lọc providers phù hợp theo task
  const availableProviders = AI_PROVIDER_DEFINITIONS.filter((p) => {
    if (taskId === 'vision') return (p.visionModels?.length ?? 0) > 0
    if (taskId === 'stt') return p.supportsStt
    return p.textModels.length > 0
  })

  const handleProviderChange = (providerId: ProviderId) => {
    const newProvider = AI_PROVIDER_DEFINITIONS.find((p) => p.id === providerId)
    if (!newProvider) return
    const models =
      taskId === 'text'
        ? newProvider.textModels
        : taskId === 'vision'
        ? newProvider.visionModels
        : newProvider.sttModels
    const defaultModel = models[0]?.id ?? ''
    onChange({ providerId, modelId: defaultModel })
  }

  const isDefault =
    config.providerId === DEFAULT_AI_SETTINGS[taskId].providerId &&
    config.modelId === DEFAULT_AI_SETTINGS[taskId].modelId &&
    config.apiKey === ''

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
        <div
          className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center text-sm',
            taskId === 'text' && 'bg-blue-500/10 text-blue-600',
            taskId === 'vision' && 'bg-purple-500/10 text-purple-600',
            taskId === 'stt' && 'bg-emerald-500/10 text-emerald-600'
          )}
        >
          {TASK_ICONS[taskId]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{taskDef.label}</h3>
            {isLocked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                <Lock className="h-2.5 w-2.5" />
                Bắt buộc OpenAI
              </span>
            )}
            {!isDefault && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Đã cấu hình
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{taskDef.description}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nhà cung cấp (Provider)
            </Label>
            <Select
              value={config.providerId}
              onValueChange={(v) => handleProviderChange(v as ProviderId)}
              disabled={isLocked}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLocked && (
              <p className="text-[11px] text-muted-foreground">
                STT chỉ hỗ trợ OpenAI Whisper / GPT Transcribe.
              </p>
            )}
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Phiên bản model
            </Label>
            <Select
              value={config.modelId}
              onValueChange={(v) => onChange({ modelId: v })}
              disabled={modelList.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={modelList.length === 0 ? 'Không hỗ trợ' : 'Chọn model'} />
              </SelectTrigger>
              <SelectContent>
                {modelList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              API Key (tùy chọn)
            </Label>
            {config.apiKey.trim() && (
              <span className="text-[11px] text-muted-foreground">
                {maskSecret(config.apiKey)}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              placeholder={
                providerDef?.keyPlaceholder ?? 'Nhập API key của bạn (để trống = dùng hệ thống)'
              }
              value={config.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Để trống → dùng API key hệ thống mặc định. Key chỉ lưu trên trình duyệt này.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CustomApiKeysSettings() {
  const { settings, hydrated, updateTaskConfig, resetSettings } = useUserAiSettings()
  const [savedFeedback, setSavedFeedback] = useState(false)

  const handleSave = () => {
    // Settings auto-save via context/useEffect, chỉ cần show feedback
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 2000)
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground animate-pulse">
        Đang tải cài đặt AI…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">Cấu hình AI của bạn</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Chọn model và API key riêng cho từng loại tác vụ AI. Dữ liệu chỉ lưu trên{' '}
              <span className="font-medium text-foreground">trình duyệt này</span> — không gửi lên
              server.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ API key lưu dạng văn bản trong localStorage. Không sử dụng trên máy tính công cộng.
          Bạn có thể xóa bằng cách để trống ô API key và lưu lại.
        </div>
      </div>

      {/* 3 Task Cards */}
      {AI_TASK_DEFINITIONS.map((taskDef) => (
        <TaskConfigCard
          key={taskDef.id}
          taskId={taskDef.id}
          config={settings[taskDef.id]}
          onChange={(patch) => updateTaskConfig(taskDef.id, patch)}
        />
      ))}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={handleSave}
          className={cn(
            'gap-2 transition-all',
            savedFeedback && 'bg-emerald-600 hover:bg-emerald-600'
          )}
        >
          {savedFeedback ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Đã lưu!
            </>
          ) : (
            'Lưu cài đặt'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={resetSettings}
          className="gap-2 text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          Đặt lại mặc định
        </Button>
      </div>

      {/* Summary of current config */}
      <div className="rounded-2xl border border-border bg-muted/20 p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tóm tắt cấu hình hiện tại
        </p>
        {AI_TASK_DEFINITIONS.map((taskDef) => {
          const cfg = settings[taskDef.id]
          const providerDef = AI_PROVIDER_DEFINITIONS.find((p) => p.id === cfg.providerId)
          const hasCustomKey = cfg.apiKey.trim().length > 0
          return (
            <div key={taskDef.id} className="flex items-center gap-3 text-sm">
              <span className="text-base">{taskDef.icon}</span>
              <span className="text-muted-foreground w-28 shrink-0">{taskDef.label}</span>
              <span className="font-medium text-foreground">
                {providerDef?.icon} {providerDef?.label}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">
                {(() => {
                  const models =
                    taskDef.id === 'text'
                      ? providerDef?.textModels
                      : taskDef.id === 'vision'
                      ? providerDef?.visionModels
                      : providerDef?.sttModels
                  return models?.find((m) => m.id === cfg.modelId)?.label ?? cfg.modelId
                })()}
              </span>
              {hasCustomKey ? (
                <span className="ml-auto text-[11px] text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  🔑 Key riêng
                </span>
              ) : (
                <span className="ml-auto text-[11px] text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                  🏢 Hệ thống
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
