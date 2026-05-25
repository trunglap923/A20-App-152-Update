'use client'

import dynamic from 'next/dynamic'
const Sidebar = dynamic(() => import('@/components/sidebar').then(mod => mod.Sidebar), { ssr: false })
import { FileUpload } from '@/components/file-upload'
import { ProcessingPipeline } from '@/components/processing-pipeline'
import { EmptyState } from '@/components/empty-state'
import { LoadingSkeleton } from '@/components/loading-skeleton'

// Dynamic imports for heavy components to reduce startup lag
const SummaryTab = dynamic(() => import('@/components/tabs/summary-tab').then(mod => mod.SummaryTab), { ssr: false })
const LessonsTab = dynamic(() => import('@/components/tabs/lessons-tab').then(mod => mod.LessonsTab), { ssr: false })
const QuizTab = dynamic(() => import('@/components/tabs/quiz-tab').then(mod => mod.QuizTab), { ssr: false })
const MindmapTab = dynamic(() => import('@/components/tabs/mindmap-tab').then(mod => mod.MindmapTab), { ssr: false })
const SlidesTab = dynamic(() => import('@/components/tabs/slides-tab').then(mod => mod.SlidesTab), { ssr: false })
const ChatTab = dynamic(() => import('@/components/tabs/chat-tab').then(mod => mod.ChatTab), { ssr: false })

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, BookOpen, HelpCircle, GitBranch, Menu, MessageCircle, Loader2, Presentation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
import { UserAdBanners } from '@/components/user-ad-banners'
import { UserNotificationBell } from '@/components/user-notification-bell'

export default function Home() {
  const {
    history,
    selectedFile,
    processingStep,
    detailedStage,
    content,
    handleSelectFile,
    handleExampleClick,
    handleNewChat,
    setActiveTab,
    activeTab,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isDesktopSidebarCollapsed,
    setIsDesktopSidebarCollapsed,
  } = useDocumentProcessing()

  const isMobile = useIsMobile()


  const isProcessing = processingStep !== null && processingStep !== 'complete'
  // Hiển thị nội dung nếu đã có dữ liệu (Summary, Mindmap hoặc chỉ cần có URL file để xem trước)
  const hasPartialContent = content !== null && (
    content.summary !== null || 
    content.mindmap !== null || 
    content.source_url !== null
  )
  const showContent = hasPartialContent

  const tabs = [
    { id: 'summary', label: 'Tóm tắt', icon: FileText },
    { id: 'lessons', label: 'Bài học', icon: BookOpen },
    { id: 'quiz', label: 'Câu hỏi', icon: HelpCircle },
    { id: 'mindmap', label: 'Sơ đồ tư duy', icon: GitBranch },
    { id: 'slides', label: 'Slide', icon: Presentation },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
  ]

  return (
    <div className="flex h-screen bg-background">
      {!isMobile && (
        <Sidebar
          history={history}
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          onNewChat={handleNewChat}
          isCollapsed={isDesktopSidebarCollapsed}
          onCollapsedChange={setIsDesktopSidebarCollapsed}
        />
      )}

      <AnimatePresence>
        {isMobile && isMobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />

            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-xs"
            >
              <Sidebar
                history={history}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
                onNewChat={handleNewChat}
                isCollapsed={false}
                onCollapsedChange={() => setIsMobileSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex flex-1 flex-col overflow-hidden">
        <UserAdBanners />
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            {isMobile ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="h-10 w-10 p-0"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <img src="/favicon-32x32.png" alt="Nexus" width={32} height={32} className="rounded" />
                <span className="text-lg font-bold">Nexus</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Trang làm việc</span>
            )}
          </div>
          <UserNotificationBell />
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <AnimatePresence>
            {!isProcessing && !showContent && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-b bg-card px-4 py-4 sm:px-6"
              >
                <FileUpload />
              </motion.div>
            )}
          </AnimatePresence>

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

              {showContent && (
                <motion.div className="space-y-6">
                  {/* Nếu vẫn đang xử lý bài học, hiện thanh pipeline nhỏ phía trên */}
                  {isProcessing && (
                    <div className="mb-4">
                      <ProcessingPipeline currentStep={processingStep!} detailedStage={detailedStage} />
                    </div>
                  )}
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="mb-6 flex justify-center">
                      <TabsList
                        className="
          flex gap-1 rounded-2xl border border-border/50
          bg-white/80 p-1 shadow-sm backdrop-blur-md
          dark:border-white/10 dark:bg-zinc-900/80
        "
                      >
                        {tabs.map((tab) => (
                          <TabsTrigger
                            key={tab.id}
                            value={tab.id}
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
                            <tab.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span className="hidden sm:inline">{tab.label}</span>
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
                        isActive={activeTab === 'slides'}
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

              {!isProcessing && !showContent && (
                <motion.div>
                  <EmptyState onExampleClick={handleExampleClick} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  )
}