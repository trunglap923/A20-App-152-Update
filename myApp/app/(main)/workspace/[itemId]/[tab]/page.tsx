'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, BookOpen, HelpCircle, GitBranch, MessageCircle, Loader2, Presentation } from 'lucide-react'

// MainLayout is now provided by (main)/layout.tsx
import { ProcessingPipeline } from '@/components/processing-pipeline'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocumentProcessing } from '@/contexts/document-processing-context'

const SummaryTab = dynamic(() => import('@/components/tabs/summary-tab').then(mod => mod.SummaryTab), { ssr: false })
const LessonsTab = dynamic(() => import('@/components/tabs/lessons-tab').then(mod => mod.LessonsTab), { ssr: false })
const QuizTab = dynamic(() => import('@/components/tabs/quiz-tab').then(mod => mod.QuizTab), { ssr: false })
const MindmapTab = dynamic(() => import('@/components/tabs/mindmap-tab').then(mod => mod.MindmapTab), { ssr: false })
const SlidesTab = dynamic(() => import('@/components/tabs/slides-tab').then(mod => mod.SlidesTab), { ssr: false })
const ChatTab = dynamic(() => import('@/components/tabs/chat-tab').then(mod => mod.ChatTab), { ssr: false })

const tabsList = [
  { id: 'summary', label: 'Tóm tắt', icon: FileText },
  { id: 'lessons', label: 'Bài học', icon: BookOpen },
  { id: 'quiz', label: 'Câu hỏi', icon: HelpCircle },
  { id: 'mindmap', label: 'Sơ đồ tư duy', icon: GitBranch },
  { id: 'slides', label: 'Slide', icon: Presentation },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
]

export default function WorkspaceTabPage() {
  const params = useParams()
  const router = useRouter()
  const itemId = params.itemId as string
  const tab = params.tab as string

  const {
    history,
    selectedFile,
    processingStep,
    detailedStage,
    content,
    handleSelectFile,
    activeTab,
    setActiveTab,
  } = useDocumentProcessing()

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 1. Sync file selection based on URL itemId
  useEffect(() => {
    if (itemId && selectedFile !== itemId) {
      // Prevent navigation because we are already on the URL
      handleSelectFile(itemId, true)
    }
  }, [itemId, selectedFile, handleSelectFile])

  // 2. Sync context's activeTab based on URL tab param
  useEffect(() => {
    if (tab && activeTab !== tab && tabsList.some(t => t.id === tab)) {
      setActiveTab(tab)
    }
  }, [tab, activeTab, setActiveTab])

  const isProcessing = processingStep !== null && processingStep !== 'complete'
  const hasPartialContent = content !== null && (
    content.summary !== null || 
    content.mindmap !== null || 
    content.source_url !== null
  )
  const showContent = hasPartialContent

  // Redirect to home if content fetch fails or file doesn't exist
  useEffect(() => {
    if (!isProcessing && !showContent && mounted && !processingStep) {
      router.push('/')
    }
  }, [isProcessing, showContent, mounted, processingStep, router])

  // Navigate to different tab by changing URL
  const handleTabChange = (newTab: string) => {
    router.push(`/workspace/${itemId}/${newTab}`)
  }

  if (!mounted) return null

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {processingStep === 'fetching' ? (
            <motion.div
              key="fetching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
              <p className="mt-4 text-sm text-muted-foreground font-medium">Đang tải dữ liệu tài liệu...</p>
            </motion.div>
          ) : isProcessing && !showContent ? (
            <motion.div key="processing" className="space-y-6 sm:space-y-8">
              <ProcessingPipeline currentStep={processingStep!} detailedStage={detailedStage} />
              <LoadingSkeleton />
            </motion.div>
          ) : null}

          {showContent && content && (
            <motion.div className="space-y-6">
              {isProcessing && (
                <div className="mb-4">
                  <ProcessingPipeline currentStep={processingStep!} detailedStage={detailedStage} />
                </div>
              )}
              <Tabs value={tab} onValueChange={handleTabChange}>
                <div className="mb-6 flex justify-center">
                  <TabsList
                    className="
                      flex gap-1 rounded-2xl border border-border/50
                      bg-white/80 p-1 shadow-sm backdrop-blur-md
                      dark:border-white/10 dark:bg-zinc-900/80
                    "
                  >
                    {tabsList.map((t) => (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="
                          flex items-center gap-2 rounded-xl px-3 py-2
                          text-xs font-medium text-muted-foreground
                          transition-all duration-200
                          hover:bg-muted/60 hover:text-foreground
                          data-[state=active]:bg-primary
                          data-[state=active]:text-primary-foreground
                          data-[state=active]:shadow-sm
                          dark:hover:bg-zinc-800/80
                          dark:data-[state=active]:bg-zinc-100
                          dark:data-[state=active]:text-zinc-900
                          sm:text-sm
                        "
                      >
                        <t.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span className="hidden sm:inline">{t.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <TabsContent
                  value="summary"
                  className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/60"
                >
                  <SummaryTab 
                    summary={content.summary} 
                    summaryVersions={content.summary_versions}
                    sourceType={content.source_type}
                    sourceUrl={content.source_url}
                  />
                </TabsContent>

                <TabsContent
                  value="lessons"
                  className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/60"
                >
                  <LessonsTab lessons={content.lessons} lessonVersions={content.lesson_versions} />
                </TabsContent>

                <TabsContent
                  value="quiz"
                  className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/60"
                >
                  <QuizTab questions={content.quiz} quizVersions={content.quiz_versions} />
                </TabsContent>

                <TabsContent
                  value="mindmap"
                  forceMount
                  className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/60 data-[state=inactive]:hidden"
                >
                  <MindmapTab 
                    mindmap={content.mindmap} 
                    mindmapVersions={content.mindmap_versions}
                    itemId={content.id} 
                  />
                </TabsContent>

                <TabsContent
                  value="slides"
                  forceMount
                  className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/60"
                >
                  <SlidesTab 
                    slideshow={content.slides} 
                    itemId={content.id}
                    selectedFile={history.find(f => f.id === selectedFile)}
                    quiz={content.quiz}
                    mindmap={content.mindmap}
                    isActive={tab === 'slides'}
                  />
                </TabsContent>

                <TabsContent
                  value="chat"
                  className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/60"
                >
                  <ChatTab itemId={content.id} />
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
