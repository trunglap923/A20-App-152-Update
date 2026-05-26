'use client'

import { FileUpload } from '@/components/file-upload'
import { EmptyState } from '@/components/empty-state'
import { motion, AnimatePresence } from 'framer-motion'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
// MainLayout is now provided by (main)/layout.tsx

export default function Home() {
  const {
    processingStep,
    content,
    handleExampleClick,
  } = useDocumentProcessing()

  const isProcessing = processingStep !== null && processingStep !== 'complete'
  const hasPartialContent = content !== null && (
    content.summary !== null || 
    content.mindmap !== null || 
    content.source_url !== null
  )
  const showContent = hasPartialContent

  return (
    <>
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
          {!isProcessing && !showContent && (
            <motion.div>
              <EmptyState onExampleClick={handleExampleClick} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}