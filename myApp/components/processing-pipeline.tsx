'use client'

import { Check, Upload, Cpu, Brain, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProcessingStep } from '@/lib/types'
import { motion } from 'framer-motion'

interface ProcessingPipelineProps {
  currentStep: ProcessingStep
  detailedStage?: string | null
}

const steps = [
  { id: 'upload' as const, label: 'Tải lên', icon: Upload },
  { id: 'understanding' as const, label: 'Đang phân tích', icon: Brain },
  { id: 'generating' as const, label: 'Tạo kết quả', icon: Sparkles },
] as const

const STAGE_LABELS: Record<string, string> = {
  ingestion: "Đang trích xuất nội dung...",
  enrichment: "Đang phân tích và chia đoạn...",
  summarization: "Đang tổng hợp thông tin & tạo sơ đồ...",
  quiz: "Đang sinh câu hỏi trắc nghiệm...",
  done: "Đang hoàn thiện..."
}

export function ProcessingPipeline({ currentStep, detailedStage }: ProcessingPipelineProps) {
  const stepOrder: ProcessingStep[] = ['upload', 'understanding', 'generating', 'complete']
  const currentIndex = stepOrder.indexOf(currentStep)

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isComplete = currentIndex > index || currentStep === 'complete'
          const isCurrent = stepOrder[currentIndex] === step.id
          const Icon = step.icon

          return (
            <div key={step.id} className="relative flex flex-1 flex-col items-center">

              {/* LINE (absolute, nằm giữa) */}
              {index < steps.length - 1 && (
                <div className="absolute top-6 left-1/2 w-full h-0.5">
                  <div className="relative w-full h-full">

                    {/* background line */}
                    <div className="absolute inset-0 bg-muted rounded-full" />

                    {/* progress line */}
                    <motion.div
                      className="absolute inset-0 bg-primary rounded-full"
                      initial={{ scaleX: 0 }}
                      animate={{
                        scaleX:
                          currentIndex > index || currentStep === 'complete' ? 1 : 0,
                      }}
                      style={{ transformOrigin: 'left' }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
              )}

              {/* ICON */}
              <motion.div
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor:
                    isComplete || isCurrent
                      ? 'var(--primary)'
                      : 'var(--muted)',
                }}
                className={cn(
                  'relative z-10 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl',
                  isComplete || isCurrent
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </motion.div>

              {/* LABEL */}
              <span
                className={cn(
                  'mt-2 text-[10px] sm:text-xs text-center',
                  isComplete || isCurrent
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
      
      {/* DETAILED STAGE */}
      {detailedStage && currentStep !== 'complete' && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-center text-sm font-medium text-primary animate-pulse"
        >
          {STAGE_LABELS[detailedStage] || detailedStage}
        </motion.div>
      )}
    </div>
  )
}
