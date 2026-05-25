'use client'

import { Trash2, BookOpen, Lightbulb, RefreshCw, ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Lesson, LessonVersion } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { MarkdownContent } from '@/components/ui/markdown-content'
import { useState, useEffect } from 'react'
import { useDocumentProcessing } from '@/contexts/document-processing-context'

interface LessonsTabProps {
  lessons: Lesson[]
  lessonVersions?: LessonVersion[]
}

/**
 * Hàm loại bỏ các ký hiệu Markdown để hiển thị text thuần
 */
function stripMarkdown(text: string): string {
  if (!text) return ''
  return text
    .replace(/[#*`_~]/g, '')             // Loại bỏ #, *, `, _, ~
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // Giữ lại text trong link [text](url) -> text
    .replace(/!\[.*?\]\(.*?\)/g, '')     // Loại bỏ ảnh
    .trim()
}

export function LessonsTab({ lessons, lessonVersions }: LessonsTabProps) {
  const { handleRegenerate } = useDocumentProcessing()!
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)

  // Set default active version & Auto-switch to newest when added
  const [prevCount, setPrevCount] = useState(0)
  useEffect(() => {
    if (lessonVersions && lessonVersions.length > 0) {
      if (lessonVersions.length > prevCount) {
        setActiveVersionId(lessonVersions[0].version_id)
      }
      setPrevCount(lessonVersions.length)
    }
  }, [lessonVersions, prevCount])

  const activeLessons = lessonVersions && activeVersionId
    ? lessonVersions.find(v => v.version_id === activeVersionId)?.lessons || lessons
    : lessons

  const selectedLesson = activeLessons.find(l => l.id === selectedLessonId)

  // ================= DETAIL VIEW =================
  if (selectedLesson) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 sm:space-y-6"
      >
        {/* Back */}
        <button
          onClick={() => setSelectedLessonId(null)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>

        {/* Header */}
        <div className="rounded-xl sm:rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-4 sm:p-6 lg:p-8">
          <div className="mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>

          <h1 className="mb-3 text-xl sm:text-2xl lg:text-3xl font-bold">
            {selectedLesson.title}
          </h1>

          <div className="space-y-4 sm:space-y-6">
            {/* Key Concept */}
            <div className="rounded-lg sm:rounded-xl border bg-card p-4 sm:p-6">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <h2 className="text-base sm:text-lg font-semibold">Ý chính</h2>
              </div>

              <MarkdownContent content={selectedLesson.keyConcept} />
            </div>

            {/* Example */}
            <div className="rounded-lg sm:rounded-xl border bg-card p-4 sm:p-6">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Lightbulb className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <h2 className="text-base sm:text-lg font-semibold">Ví dụ</h2>
              </div>

              <MarkdownContent content={selectedLesson.example} />
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => handleRegenerate('lessons')}
            className="gap-2 text-sm sm:text-base px-4 sm:px-5"
          >
            <RefreshCw className="h-4 w-4" />
            Tạo lại
          </Button>
        </div>
      </motion.div>
    )
  }

  // ================= LIST VIEW =================
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Version Selector — Chip style */}
      {lessonVersions && lessonVersions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Phiên bản:</span>
          {lessonVersions.map(v => (
            <button
              key={v.version_id}
              onClick={() => setActiveVersionId(v.version_id)}
              style={{
                borderRadius: '9999px',
                padding: '4px 14px',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s',
                border: activeVersionId === v.version_id ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: activeVersionId === v.version_id ? 'var(--primary)' : 'transparent',
                color: activeVersionId === v.version_id ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}


      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {activeLessons.map((lesson, index) => (
            <motion.button
              key={lesson.id || `lesson-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedLessonId(lesson.id)}
              className="group rounded-xl sm:rounded-2xl border bg-card p-4 sm:p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-md text-left"
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>

                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] sm:text-xs">
                  Bài {index + 1}
                </span>
              </div>

              {/* Title */}
              <h3 className="mb-2 text-sm sm:text-base font-semibold line-clamp-2">
                {stripMarkdown(lesson.title)}
              </h3>

              {/* Key concept */}
              <div className="mb-3">
                <h4 className="mb-1 text-[10px] sm:text-xs uppercase text-muted-foreground">
                  Ý chính
                </h4>
                <p className="line-clamp-2 text-xs sm:text-sm">
                  {stripMarkdown(lesson.keyConcept)}
                </p>
              </div>

              {/* Example */}
              <div className="rounded-lg bg-accent/50 p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                  <h4 className="text-[10px] sm:text-xs uppercase text-muted-foreground">
                    Ví dụ
                  </h4>
                </div>
                <p className="line-clamp-2 text-xs sm:text-sm">
                  {stripMarkdown(lesson.example)}
                </p>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {/* Action */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => handleRegenerate('lessons')}
          className="gap-2 text-sm sm:text-base px-4 sm:px-5"
        >
          <RefreshCw className="h-4 w-4" />
          Tạo lại
        </Button>
      </div>
    </div>
  )
}