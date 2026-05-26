'use client'

import dynamic from 'next/dynamic'
const Sidebar = dynamic(() => import('@/components/sidebar').then(mod => mod.Sidebar), { ssr: false })
import { motion, AnimatePresence } from 'framer-motion'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
import { UserAdBanners } from '@/components/user-ad-banners'
import { UserNotificationBell } from '@/components/user-notification-bell'
import { ReactNode } from 'react'

export function MainLayout({ children }: { children: ReactNode }) {
  const {
    history,
    selectedFile,
    handleSelectFile,
    handleNewChat,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isDesktopSidebarCollapsed,
    setIsDesktopSidebarCollapsed,
  } = useDocumentProcessing()

  const isMobile = useIsMobile()

  return (
    <div className="flex h-screen bg-background">
      {!isMobile && (
        <Sidebar
          history={history}
          selectedFile={selectedFile}
          onSelectFile={(id) => handleSelectFile(id, false)}
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
                onSelectFile={(id) => handleSelectFile(id, false)}
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
          {children}
        </div>
      </main>
    </div>
  )
}
