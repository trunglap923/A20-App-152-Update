'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, RefreshCw, Minus, Plus, CheckCircle2, XCircle, HelpCircle, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QuizQuestion, QuizVersion } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
import { MarkdownContent } from '@/components/ui/markdown-content'

interface QuizTabProps {
  questions: QuizQuestion[]
  quizVersions?: QuizVersion[]
}

export function QuizTab({ questions, quizVersions }: QuizTabProps) {
  const { handleRegenerate } = useDocumentProcessing()!
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null)
  
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [showAnswers, setShowAnswers] = useState<Record<string, boolean>>({})
  const [isMounted, setIsMounted] = useState(false)

  // Khôi phục state từ localStorage khi component mount (để tránh Hydration Mismatch và Flash UI)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedSelected = localStorage.getItem('quiz_selectedAnswers')
        if (savedSelected) setSelectedAnswers(JSON.parse(savedSelected))
        
        const savedShow = localStorage.getItem('quiz_showAnswers')
        if (savedShow) setShowAnswers(JSON.parse(savedShow))
      } catch (e) {
        console.error('Failed to parse quiz local storage', e)
      }
      setIsMounted(true)
    }
  }, [])

  // Set default active version & Auto-switch to newest when added
  const [prevCount, setPrevCount] = useState(0)
  useEffect(() => {
    if (quizVersions && quizVersions.length > 0) {
      if (quizVersions.length > prevCount) {
        setActiveVersionId(quizVersions[0].version_id)
      }
      setPrevCount(quizVersions.length)
    }
  }, [quizVersions, prevCount])

  // Lưu progress vào localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quiz_selectedAnswers', JSON.stringify(selectedAnswers))
      localStorage.setItem('quiz_showAnswers', JSON.stringify(showAnswers))
    }
  }, [selectedAnswers, showAnswers])

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answer }))
    setShowAnswers((prev) => ({ ...prev, [questionId]: true }))
  }

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'true_false':
        return 'Đúng / Sai'
      case 'short_answer':
        return 'Trả lời ngắn'
      case 'mcq':
      case 'single_choice':
      case 'multiple_choice':
      default:
        return 'Trắc nghiệm'
    }
  }

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'true_false':
        return XCircle
      case 'short_answer':
        return HelpCircle
      case 'mcq':
      case 'single_choice':
      case 'multiple_choice':
      default:
        return CheckCircle2
    }
  }

  const activeQuestions = quizVersions && activeVersionId
    ? quizVersions.find(v => v.version_id === activeVersionId)?.questions || []
    : questions

  const answeredCount = activeQuestions.filter(q => showAnswers[q.id]).length
  const correctCount = activeQuestions.reduce((acc, q) => acc + (selectedAnswers[q.id] === q.answer ? 1 : 0), 0)

  // Ngăn chặn flash UI: hiển thị bộ khung loading mượt mà cho đến khi dữ liệu từ localStorage được đắp vào
  if (!isMounted) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border bg-card text-muted-foreground p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-medium">Đang tải lịch sử làm bài...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => handleRegenerate('quiz', { difficulty: 'beginner' })}
          >
            <Minus className="h-3 w-3" />
            Đơn giản hơn
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => handleRegenerate('quiz', { difficulty: 'expert' })}
          >
            <Plus className="h-3 w-3" />
            Khó hơn
          </Button>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Đã trả lời {answeredCount}/{activeQuestions.length}
        </p>
      </div>

      {/* Version Selector — Chip style */}
      {quizVersions && quizVersions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Phiên bản:</span>
          {quizVersions.map(v => (
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


      {/* Scoreboard */}
      {answeredCount > 0 && answeredCount === activeQuestions.length && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center shadow-sm"
        >
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Trophy className="h-8 w-8" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">Hoàn thành bài kiểm tra!</h3>
          <div className="text-4xl font-extrabold text-primary mb-3">
            {correctCount} <span className="text-2xl text-muted-foreground">/ {activeQuestions.length}</span>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            {correctCount === activeQuestions.length ? 'Tuyệt vời! Bạn đã nắm vững toàn bộ kiến thức. 🌟' : 
             correctCount >= activeQuestions.length * 0.7 ? 'Khá lắm! Bạn hiểu bài rất tốt. 👍' : 
             'Cố gắng lên! Hãy xem lại giải thích ở các câu sai nhé. 💪'}
          </p>
        </motion.div>
      )}

      <div className="space-y-4">
        {activeQuestions.map((question, index) => {
          const Icon = getQuestionTypeIcon(question.type)
          const isCorrect = selectedAnswers[question.id] === question.answer
          const hasAnswered = showAnswers[question.id]

          return (
            <motion.div
              key={question.id || `q-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card transition-colors duration-300",
                hasAnswered 
                  ? (isCorrect ? "border-green-500/30" : "border-red-500/30") 
                  : "border-border"
              )}
            >
              <div className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        Câu {index + 1}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {getQuestionTypeLabel(question.type)}
                      </p>
                    </div>
                  </div>
                  {hasAnswered && (
                    <span
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium',
                        isCorrect
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      )}
                    >
                      {isCorrect ? 'Đúng' : 'Sai'}
                    </span>
                  )}
                </div>

                <MarkdownContent content={question.question} className="mb-4 text-base font-medium" />

                {(question.type === 'mcq' || question.type === 'single_choice') && question.options && (
                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <button
                        key={optionIndex}
                        onClick={() => handleAnswerSelect(question.id, option)}
                        disabled={hasAnswered}
                        className={cn(
                          'w-full rounded-xl border px-4 py-3 text-left text-sm transition-all',
                          selectedAnswers[question.id] === option
                            ? isCorrect
                              ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                              : 'border-red-500 bg-red-50 text-red-700 font-medium'
                            : hasAnswered && option === question.answer
                            ? 'border-green-500 bg-green-50 text-green-700 font-medium ring-2 ring-green-500/20'
                            : 'border-border bg-background text-foreground hover:bg-accent'
                        )}
                      >
                        <MarkdownContent content={option} noMargin />
                      </button>
                    ))}
                  </div>
                )}

                {question.type === 'true_false' && (
                  <div className="flex gap-3">
                    {['Đúng', 'Sai'].map((option) => (
                      <button
                        key={option}
                        onClick={() => handleAnswerSelect(question.id, option)}
                        disabled={hasAnswered}
                        className={cn(
                          'flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                          selectedAnswers[question.id] === option
                            ? isCorrect
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-red-500 bg-red-50 text-red-700'
                            : hasAnswered && option === question.answer
                            ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-500/20'
                            : 'border-border bg-background text-foreground hover:bg-accent'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {question.type === 'short_answer' && (
                  <div className="rounded-xl border border-border bg-accent/50 p-4">
                    <p className="text-sm font-medium text-muted-foreground">Đáp án mong đợi:</p>
                    <p className="text-sm text-foreground">{question.answer}</p>
                  </div>
                )}

                {hasAnswered && (
                  <button
                    onClick={() =>
                      setExpandedQuestion(expandedQuestion === question.id ? null : question.id)
                    }
                    className="mt-5 flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    Xem giải thích chi tiết
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        expandedQuestion === question.id && 'rotate-180'
                      )}
                    />
                  </button>
                )}
              </div>

              <AnimatePresence>
                {expandedQuestion === question.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden border-t border-border bg-muted/50"
                  >
                    <div className="p-6">
                      <MarkdownContent content={question.explanation} className="text-sm leading-relaxed" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      <div className="flex justify-center pt-4">
        <Button 
          variant="outline" 
          onClick={() => handleRegenerate('quiz', { difficulty: 'intermediate' })} 
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Tạo lại bộ câu hỏi mới
        </Button>
      </div>
    </div>
  )
}
