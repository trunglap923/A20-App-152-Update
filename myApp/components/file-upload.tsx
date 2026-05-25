'use client'

import { useState, useCallback } from 'react'
import { Upload, FileText, Mic, Link2, X, AlertCircle, Square, Radio, CloudUpload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useDocumentProcessing } from '@/contexts/document-processing-context'

function formatTime(seconds: number) {
  const hrs = Math.floor(seconds / 3600)
  const min = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60
  if (hrs > 0) {
    return `${hrs}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function FileUpload() {
  const {
    handleUpload,
    processingStep,
    isRecording,
    recordingSeconds,
    audioURL,
    recordingError,
    toggleRecording,
    submitRecordedAudio,
    clearRecordingError,
    liveTranscript,
    chunksSent,
    isFinishingRecording,
  } = useDocumentProcessing()

  const isProcessing = processingStep !== null && processingStep !== 'complete'

  const [isDragging, setIsDragging] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube' | 'record'>('upload')

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const MAX_PDF_SIZE = 15 * 1024 * 1024 // 15MB
  const MAX_AUDIO_SIZE = 100 * 1024 * 1024 // 100MB (~1.5 tiếng)
  const MAX_VIDEO_SIZE = 500 * 1024 * 1024 // 500MB (~1 tiếng)

  const processFile = useCallback(
    (file: File) => {
      setError(null)
      
      if (file.type === 'application/pdf') {
        if (file.size > MAX_PDF_SIZE) {
          setError(`File PDF quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn file dưới 15MB.`)
          return
        }
        void handleUpload({ name: file.name, type: 'pdf', file })
      } else if (file.type.startsWith('audio/')) {
        if (file.size > MAX_AUDIO_SIZE) {
          setError(`File âm thanh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn file dưới 100MB.`)
          return
        }
        void handleUpload({ name: file.name, type: 'audio', file })
      } else if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_SIZE) {
          setError(`File video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn file dưới 500MB.`)
          return
        }
        void handleUpload({ name: file.name, type: 'video', file })
      } else {
        setError('Chỉ hỗ trợ file PDF, âm thanh hoặc video.')
      }
    },
    [handleUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )


  const handleYoutubeSubmit = useCallback(() => {
    setError(null)
    if (!youtubeUrl.trim()) {
      setError('Vui lòng nhập URL YouTube')
      return
    }
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
    if (!youtubeRegex.test(youtubeUrl)) {
      setError('URL YouTube không hợp lệ')
      return
    }
    void handleUpload({ name: 'YouTube Video', type: 'youtube', url: youtubeUrl })
    setYoutubeUrl('')
  }, [youtubeUrl, handleUpload])

  const tabs = [
    { id: 'upload' as const, label: 'Tải lên', icon: Upload },
    { id: 'youtube' as const, label: 'YouTube', icon: Link2 },
    { id: 'record' as const, label: 'Ghi âm', icon: Mic },
  ]

  const displayError = error || recordingError

  return (
    <div className="w-full">
      <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              setError(null)
              clearRecordingError()
            }}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all',
                isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50',
                isProcessing && 'pointer-events-none opacity-50'
              )}
            >
              <input
                type="file"
                accept=".pdf,audio/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isProcessing}
              />
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <p className="mb-1 text-sm font-medium">Kéo & thả hoặc nhấp để chọn file</p>
              <p className="text-xs text-muted-foreground">Hỗ trợ PDF, file âm thanh hoặc video (.mp4, .mkv...)</p>
            </label>
          </motion.div>
        )}

        {activeTab === 'youtube' && (
          <motion.div
            key="youtube"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Link2 className="h-7 w-7 text-primary" />
            </div>
            <p className="mb-4 text-sm text-muted-foreground">Dán URL video YouTube</p>
            <form
              className="flex gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleYoutubeSubmit()
              }}
            >
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={isProcessing}
              />
              <Button type="submit" disabled={isProcessing || !youtubeUrl.trim()}>
                Xử lý
              </Button>
            </form>
          </motion.div>
        )}

        {activeTab === 'record' && (
          <motion.div
            key="record"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center rounded-2xl border border-border bg-card p-8"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Mic className="h-7 w-7 text-primary" />
            </div>

            <p className="mb-6 max-w-xs text-center text-sm text-muted-foreground">
              Ghi âm trực tiếp — hệ thống tự động gửi từng đoạn 3 phút lên server
            </p>

            {isRecording && (
              <div className="mb-4 w-full max-w-md space-y-3">
                {/* Trạng thái ghi âm */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-red-500">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                    <span className="font-medium">Đang ghi âm...</span>
                    <span className="font-mono tabular-nums">{formatTime(recordingSeconds)}</span>
                  </div>
                  {chunksSent > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
                      <CloudUpload className="h-3 w-3" />
                      <span>{chunksSent} đoạn đã gửi</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Transcript Whisper — hiển thị cả lúc ghi âm lẫn sau khi dừng */}
            {liveTranscript && (
              <div className="mb-4 w-full max-w-md rounded-xl border border-border bg-muted/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {isRecording ? (
                    <>
                      <Radio className="h-3 w-3 animate-pulse text-red-400" />
                      <span>Nội dung đang nói (bản nháp)</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="h-3 w-3 text-green-500" />
                      <span>Nội dung đã ghi nhận (Whisper)</span>
                    </>
                  )}
                </div>
                <p className="max-h-48 overflow-y-auto text-sm leading-relaxed text-foreground/80">
                  {liveTranscript}
                </p>
              </div>
            )}

            <Button
              type="button"
              onClick={() => toggleRecording()}
              disabled={isProcessing || isFinishingRecording}
              size="lg"
              className={`min-w-[200px] gap-2 ${isRecording ? 'bg-red-500 hover:bg-red-600' : ''} ${isFinishingRecording ? 'opacity-80' : ''}`}
            >
              {isRecording ? (
                <>
                  <Square className="h-4 w-4" />
                  Dừng & xử lý
                </>
              ) : isFinishingRecording ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Đang xử lý bản ghi...
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Bắt đầu ghi âm
                </>
              )}
            </Button>

            {audioURL && (
              <div className="mt-8 w-full max-w-md">
                <audio controls src={audioURL} className="w-full" />
                <Button type="button" onClick={() => submitRecordedAudio()} className="mt-4 w-full" size="lg">
                  Sử dụng bản ghi này
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {displayError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            <span>{displayError}</span>
            <button
              type="button"
              onClick={() => {
                setError(null)
                clearRecordingError()
              }}
              className="ml-auto"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
