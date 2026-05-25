'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
import type { ProcessingStep } from '@/lib/types'
import { cn } from '@/lib/utils'

function statusLabel(step: ProcessingStep): string {
  switch (step) {
    case 'upload':
      return 'Đang tải lên'
    case 'fetching':
      return 'Đang lấy dữ liệu'
    case 'processing':
      return 'Đang xử lý'
    case 'understanding':
      return 'Đang phân tích'
    case 'generating':
      return 'Đang tạo kết quả'
    case 'complete':
      return 'Hoàn tất'
    default:
      return 'Đang xử lý'
  }
}

const FILE_NAME_MAX_LEN = 10

function truncateFileName(name: string, maxLen = FILE_NAME_MAX_LEN): string {
  if (name.length <= maxLen) return name
  return `${name.slice(0, maxLen)}...`
}

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

/** Ba trạng thái chính: tải lên (vàng) · phân tích (cyan) · tạo kết quả (tím) — mỗi bước một màu riêng. */
function statusDotClass(step: ProcessingStep): string {
  switch (step) {
    case 'complete':
      return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]'
    case 'fetching':
      return 'bg-blue-400 animate-pulse'
    case 'generating':
      return 'bg-violet-600 animate-pulse shadow-[0_0_8px_rgba(124,58,237,0.55)]'
    case 'understanding':
      return 'bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.5)]'
    case 'upload':
      return 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]'
    case 'processing':
      return 'bg-cyan-600 animate-pulse shadow-[0_0_6px_rgba(8,145,178,0.45)]'
    default:
      return 'bg-slate-500 animate-pulse'
  }
}

const RECORDING_TITLE = 'Ghi âm'

export function UploadStatusPill() {
  const pathname = usePathname()
  const {
    processingStep,
    activeUploadFileName,
    isRecording,
    recordingSeconds,
    audioBlob,
  } = useDocumentProcessing()

  const showProcessingPill =
    pathname !== '/' &&
    Boolean(activeUploadFileName) &&
    processingStep !== null

  const showRecordingPill =
    pathname !== '/' &&
    processingStep === null &&
    (isRecording || audioBlob !== null)

  return (
    <AnimatePresence>
      {showProcessingPill && activeUploadFileName && processingStep && (
        <motion.div
          key="processing"
          role="status"
          aria-live="polite"
          aria-label={`${activeUploadFileName}, ${statusLabel(processingStep)}`}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={cn(
            'pointer-events-none fixed left-4 top-4 z-[100] flex max-w-[min(100vw-2rem,24rem)] items-center gap-2.5',
            'rounded-full border border-border/60 bg-card/95 py-2 pl-3 pr-4 shadow-lg backdrop-blur-md',
            'dark:border-white/10 dark:bg-zinc-950/95'
          )}
          title={`${activeUploadFileName} — ${statusLabel(processingStep)}`}
        >
          <span
            className={cn(
              'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
              statusDotClass(processingStep)
            )}
            aria-hidden
          />
          <p className="min-w-0 truncate text-sm leading-none text-foreground">
            <span className="font-medium">{truncateFileName(activeUploadFileName)}</span>
            <span className="text-muted-foreground"> · {statusLabel(processingStep)}</span>
          </p>
        </motion.div>
      )}

      {showRecordingPill && (
        <motion.div
          key="recording"
          role="status"
          aria-live="polite"
          aria-label={
            isRecording
              ? `${RECORDING_TITLE}, Đang ghi âm ${formatTime(recordingSeconds)}`
              : `${RECORDING_TITLE}, Chờ gửi bản ghi`
          }
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={cn(
            'pointer-events-none fixed left-4 top-4 z-[100] flex max-w-[min(100vw-2rem,24rem)] items-center gap-2.5',
            'rounded-full border border-border/60 bg-card/95 py-2 pl-3 pr-4 shadow-lg backdrop-blur-md',
            'dark:border-white/10 dark:bg-zinc-950/95'
          )}
          title={
            isRecording
              ? `${RECORDING_TITLE} — Đang ghi âm · ${formatTime(recordingSeconds)}`
              : `${RECORDING_TITLE} — Đã ghi, chờ gửi`
          }
        >
          <span
            className={cn(
              'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
              isRecording
                ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.55)]'
                : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.45)]'
            )}
            aria-hidden
          />
          <p className="min-w-0 truncate text-sm leading-none text-foreground">
            <span className="font-medium">{truncateFileName(RECORDING_TITLE)}</span>
            <span className="text-muted-foreground">
              {' '}
              ·{' '}
              {isRecording
                ? `Đang ghi âm · ${formatTime(recordingSeconds)}`
                : 'Chờ gửi bản ghi'}
            </span>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
