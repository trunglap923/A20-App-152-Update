'use client'

import { FileUpload } from '@/components/file-upload'
import { EmptyState } from '@/components/empty-state'

import { useDocumentProcessing } from '@/contexts/document-processing-context'
// MainLayout is now provided by (main)/layout.tsx

// Trang chủ (/) = màn hình "New Chat" → LUÔN hiển thị FileUpload và EmptyState.
// Không dựa vào content/processingStep vì khi điều hướng về '/', state từ
// trang workspace trước chưa kịp clear (async batch), gây ra màn hình trắng.
export default function Home() {
  const { handleExampleClick } = useDocumentProcessing()

  return (
    <>
      <div className="border-b bg-card px-4 py-4 sm:px-6">
        <FileUpload />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        <EmptyState onExampleClick={handleExampleClick} />
      </div>
    </>
  )
}