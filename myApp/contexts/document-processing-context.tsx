'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { 
  uploadDocument, 
  checkItemStatus, 
  fetchItemsList, 
  uploadAudioChunk, 
  finishAudioSession, 
  renameItem, 
  deleteItem,
  regenerateSummary,
  regenerateMindmap,
  regenerateLessons,
  regenerateQuiz
} from '@/lib/api'
import { uploadActivityRef, recordingActivityRef } from '@/lib/upload-activity'
import { createClient } from '@/lib/supabaseClient'
import { API_BASE_URL } from '@/lib/env'
import { toast } from 'react-toastify'
// import { mockHistory, mockContent } from '@/lib/mock-data'
import { mockContent } from '@/lib/mock-data'
import type { UploadedFile, ProcessingStep, ProcessedContent } from '@/lib/types'

const CHUNK_INTERVAL_MS = 3 * 60 * 1000 // 3 phút

type DocumentProcessingContextValue = {
  history: UploadedFile[]
  selectedFile: string | null
  processingStep: ProcessingStep | null
  detailedStage: string | null
  content: ProcessedContent | null
  activeUploadFileName: string | null
  handleUpload: (fileInfo: {
    name: string
    type: 'pdf' | 'audio' | 'video' | 'youtube'
    file?: File
    url?: string
  }) => Promise<void>
  handleSelectFile: (id: string, preventNavigation?: boolean) => void
  handleRenameFile: (id: string, newName: string) => Promise<void>
  handleDeleteFile: (id: string) => Promise<void>
  handleRegenerate: (type: 'summary' | 'mindmap' | 'lessons' | 'quiz', options?: { difficulty?: string }) => Promise<void>
  handleExampleClick: (type: 'pdf' | 'youtube' | 'audio') => void

  handleNewChat: () => void
  setActiveTab: (tab: string) => void
  activeTab: string
  isMobileSidebarOpen: boolean
  setIsMobileSidebarOpen: (open: boolean) => void
  isDesktopSidebarCollapsed: boolean
  setIsDesktopSidebarCollapsed: (collapsed: boolean) => void
  /** Ghi âm (state toàn cục — giữ khi chuyển trang) */
  isRecording: boolean
  recordingSeconds: number
  audioURL: string | null
  audioBlob: Blob | null
  recordingError: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  toggleRecording: () => void
  submitRecordedAudio: () => void
  clearRecordingError: () => void
  /** Live Recording mới */
  liveTranscript: string
  chunksSent: number
  isFinishingRecording: boolean
}

const DocumentProcessingContext = createContext<DocumentProcessingContextValue | null>(null)

export function DocumentProcessingProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [history, setHistory] = useState<UploadedFile[]>([])
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set())
  const pendingDeletesRef = useRef(pendingDeletes)

  // Đồng bộ ref với state để loadHistory luôn đọc được bản mới nhất mà không bị loop
  useEffect(() => {
    pendingDeletesRef.current = pendingDeletes
  }, [pendingDeletes])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null)
  const [detailedStage, setDetailedStage] = useState<string | null>(null)
  const [content, setContent] = useState<ProcessedContent | null>(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false)
  const [activeUploadFileName, setActiveUploadFileName] = useState<string | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordingError, setRecordingError] = useState<string | null>(null)

  // Live Recording state
  const [liveTranscript, setLiveTranscript] = useState('')
  const [chunksSent, setChunksSent] = useState(0)
  const [isFinishingRecording, setIsFinishingRecording] = useState(false)

  const processingStepRef = useRef<ProcessingStep | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const activePollingIdRef = useRef<string | null>(null)
  const activeJobFileIdRef = useRef<string | null>(null)
  const isInitialLoadedRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Live Recording refs
  const sessionIdRef = useRef<string | null>(null)
  const chunkIndexRef = useRef(0)
  const chunkCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isStoppingRef = useRef(false)
  const allSessionChunksRef = useRef<Blob[]>([]) // Lưu tất cả chunks của toàn bộ session
  const speechRecognitionRef = useRef<any>(null)

  const clearPolling = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
    activePollingIdRef.current = null
  }, [])

  const resetRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (chunkCycleTimerRef.current) {
      clearInterval(chunkCycleTimerRef.current)
      chunkCycleTimerRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop() } catch { /* ignore */ }
      speechRecognitionRef.current = null
    }
    mediaRecorderRef.current = null
    audioChunksRef.current = []
    allSessionChunksRef.current = [] // Clear session chunks
    sessionIdRef.current = null
    chunkIndexRef.current = 0
    isStoppingRef.current = false
    setAudioURL((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setAudioBlob(null)
    setIsRecording(false)
    setRecordingSeconds(0)
    setRecordingError(null)
    setLiveTranscript('')
    setChunksSent(0)
  }, [])

  // ===== HÀM TRUNG TÂM: Bắt đầu một chu kỳ MediaRecorder mới =====
  const startRecorderCycle = useCallback((stream: MediaStream) => {
    audioChunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data)
      }
    }

    recorder.onstop = async () => {
      // Gom blob từ chu kỳ này
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      audioChunksRef.current = []

      if (blob.size < 1000) return // Bỏ qua chunk quá ngắn

      const currentIndex = chunkIndexRef.current
      chunkIndexRef.current += 1
      const sid = sessionIdRef.current

      if (!sid) return

      // Upload chunk ngầm
      try {
        console.log(`[LIVE-REC] Đang gửi chunk ${currentIndex}...`)
        const chunkResult = await uploadAudioChunk(sid, currentIndex, blob)
        setChunksSent(prev => prev + 1)
        
        if (chunkResult?.text) {
          setLiveTranscript(prev => {
            const cleaned = prev.replace(/\[.*?\]$/, '').trimEnd()
            return (cleaned ? cleaned + ' ' : '') + chunkResult.text
          })
        }
        console.log(`[LIVE-REC] Chunk ${currentIndex} đã gửi thành công ✅`)
      } catch (err) {
        console.error(`[LIVE-REC] Lỗi gửi chunk ${currentIndex}:`, err)
      }

      // Khi user bấm Stop, gọi finish. Backend sẽ tự ghép chunks và upload lên Supabase
      if (isStoppingRef.current) {
        try {
          console.log(`[LIVE-REC] Đang chốt sổ session ${sid} (Backend sẽ xử lý audio)...`)
          const result = await finishAudioSession(sid, 'Bản ghi âm trực tiếp')
          
          if (result?.item_id) {
            const realId = result.item_id
            const newFile: UploadedFile = {
              id: realId,
              name: `Ghi âm trực tiếp (${new Date().toLocaleTimeString('vi-VN')})`,
              type: 'audio',
              uploadedAt: new Date(),
              status: 'running',
            }
            setHistory(prev => [newFile, ...prev])
            setSelectedFile(realId)
            activeJobFileIdRef.current = realId
            setProcessingStep('upload')
            setActiveUploadFileName(newFile.name)
            startPolling(realId)
          }
        } catch (err) {
          console.error('[LIVE-REC] Lỗi finish:', err)
          setRecordingError('Lỗi khi kết thúc phiên ghi âm.')
        }

        // Reset state
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop())
          mediaStreamRef.current = null
        }
        setIsRecording(false)
        setIsFinishingRecording(false)
        setRecordingSeconds(0)
        setLiveTranscript('')
        setChunksSent(0)
        sessionIdRef.current = null
        chunkIndexRef.current = 0
        isStoppingRef.current = false
      }
    }

    recorder.start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopRecording = useCallback(() => {
    // Cập nhật UI ngay lập tức để người dùng biết đã dừng
    setIsRecording(false)
    setIsFinishingRecording(true)
    // Giữ lại liveTranscript để hiển thị bản nháp cho người dùng xem
    // Dừng timer đếm giây
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    // Dừng chu kỳ 3 phút
    if (chunkCycleTimerRef.current) {
      clearInterval(chunkCycleTimerRef.current)
      chunkCycleTimerRef.current = null
    }
    // Dừng Speech Recognition
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop() } catch { /* ignore */ }
      speechRecognitionRef.current = null
    }
    // Đánh dấu đang dừng → khi onstop handler chạy, nó sẽ gọi finish
    isStoppingRef.current = true
    // Dừng recorder hiện tại (trigger onstop handler)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const startRecording = useCallback(async () => {
    setRecordingError(null)
    setAudioURL((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setAudioBlob(null)
    setLiveTranscript('')
    setChunksSent(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      // Tạo Session ID duy nhất cho phiên ghi âm này
      const sid = crypto.randomUUID()
      sessionIdRef.current = sid
      chunkIndexRef.current = 0
      allSessionChunksRef.current = [] // Clear any old data
      isStoppingRef.current = false

      // Khởi động chu kỳ ghi âm (với cơ chế timeslice đã set ở trên)
      startRecorderCycle(stream)
      
      setIsRecording(true)
      setRecordingSeconds(0)

      // Timer đếm giây
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)

      // Chu kỳ 3 phút: Stop recorder hiện tại → onstop sẽ upload chunk → start recorder mới
      chunkCycleTimerRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording' && !isStoppingRef.current) {
          const currentStream = mediaStreamRef.current
          mediaRecorderRef.current.stop() // Trigger onstop → upload chunk
          // Bắt đầu chu kỳ mới ngay lập tức
          if (currentStream && currentStream.active) {
            setTimeout(() => {
              if (!isStoppingRef.current && currentStream.active) {
                startRecorderCycle(currentStream)
              }
            }, 50)
          }
        }
      }, CHUNK_INTERVAL_MS)

      // ===== LIVE TRANSCRIPT (Web Speech API) =====
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'vi-VN'
        let speechRetries = 0
        const MAX_SPEECH_RETRIES = 3

        recognition.onresult = (event: any) => {
          speechRetries = 0 // Reset khi nhận được kết quả thành công
          let interim = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              setLiveTranscript(prev => prev + transcript + ' ')
            } else {
              interim = transcript
            }
          }
          if (interim) {
            setLiveTranscript(prev => {
              const base = prev.replace(/\[.*?\]$/, '').trimEnd()
              return base + ' [' + interim + ']'
            })
          }
        }

        recognition.onerror = (event: any) => {
          console.warn('[SpeechRecognition] Error:', event.error)
          // Không restart khi lỗi nghiêm trọng hoặc mạng (tránh spam vô hạn)
          if (event.error === 'aborted' || event.error === 'not-allowed' || event.error === 'network') {
            return
          }
          // Retry có giới hạn
          if (speechRetries < MAX_SPEECH_RETRIES) {
            speechRetries++
            setTimeout(() => {
              try { recognition.start() } catch { /* ignore */ }
            }, 1000 * speechRetries) // Backoff: 1s, 2s, 3s
          }
        }

        recognition.onend = () => {
          // Auto-restart nếu vẫn đang ghi âm (Chrome hay tự tắt sau vài phút)
          if (!isStoppingRef.current && mediaRecorderRef.current && speechRetries < MAX_SPEECH_RETRIES) {
            setTimeout(() => {
              try { recognition.start() } catch { /* ignore */ }
            }, 500)
          }
        }

        try {
          recognition.start()
          speechRecognitionRef.current = recognition
        } catch {
          console.warn('[SpeechRecognition] Không thể khởi động — chữ live preview sẽ không hiển thị')
        }
      }

    } catch (err) {
      console.error(err)
      setRecordingError('Không thể truy cập microphone. Vui lòng cho phép quyền ghi âm.')
    }
  }, [startRecorderCycle])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      void startRecording()
    }
  }, [isRecording, stopRecording, startRecording])

  const clearRecordingError = useCallback(() => setRecordingError(null), [])

  processingStepRef.current = processingStep

  recordingActivityRef.current = isRecording || audioBlob !== null
  uploadActivityRef.current =
    processingStep !== null || recordingActivityRef.current

  useEffect(() => {
    if (processingStep === null) return

    const preventNavDefault = (e: Event) => {
      e.preventDefault()
    }

    window.addEventListener('dragover', preventNavDefault)
    window.addEventListener('drop', preventNavDefault)

    return () => {
      window.removeEventListener('dragover', preventNavDefault)
      window.removeEventListener('drop', preventNavDefault)
    }
  }, [processingStep])

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchItemsList()
      const currentPending = pendingDeletesRef.current

      // Cập nhật pendingDeletes: Nếu file đã biến mất khỏi server, gỡ khỏi danh sách chờ
      setPendingDeletes(prev => {
        const serverIds = new Set(data.map((item: any) => item.id))
        const next = new Set([...prev].filter(id => serverIds.has(id)))
        return next.size !== prev.size ? next : prev
      })

      setHistory(data
        .filter((item: any) => !currentPending.has(item.id))
        .map((item: any) => ({
          ...item,
          name: item.title,
          type: item.source_type,
          uploadedAt: new Date(item.created_at || item.uploadedAt)
        }))
      )
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!uploadActivityRef.current) return
      e.preventDefault()
      e.returnValue = 'reload'
    }
    window.addEventListener('beforeunload', handleBeforeUnload, { capture: true })

    const supabase = createClient()
    
    // Tải dữ liệu ban đầu
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session && !isInitialLoadedRef.current) {
        isInitialLoadedRef.current = true
        loadHistory()
      }
    })

    // Lắng nghe Auth thay đổi
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (session) {
        if (event === 'SIGNED_IN' || !isInitialLoadedRef.current) {
          isInitialLoadedRef.current = true
          loadHistory()
        }
      } else {
        isInitialLoadedRef.current = false
        setHistory([])
      }
    })

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, { capture: true })
      subscription.unsubscribe()
    }
  }, [loadHistory])

  const startPolling = useCallback(
    (itemId: string) => {
      if (activePollingIdRef.current === itemId) return
      clearPolling()
      activePollingIdRef.current = itemId

      // Lấy token và tạo SSE — Backend sẽ PUSH kết quả, không cần Frontend hỏi liên tục
      createClient().auth.getSession().then(({ data: { session } }: any) => {
          const token = session?.access_token
          if (!token) {
            console.warn('[SSE] Không có token, fallback polling...')
            pollingFallback(itemId)
            return
          }

          // API_BASE_URL = "http://localhost:8000/api" nên bỏ suffix /api để tránh lặp
          const baseWithoutApi = API_BASE_URL.replace(/\/api\/?$/, '')
          const url = `${baseWithoutApi}/api/items/${itemId}/stream?token=${token}`
          console.log('[SSE] Kết nối:', url.replace(token, '***'))

          const sse = new EventSource(url)
          sseRef.current = sse

          sse.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)

              if (data.closed) {
                sse.close()
                return
              }

              // Item đã bị xóa (ví dụ: hết credit → backend xóa)
              if (data.error === 'Item deleted') {
                toast.error('❌ TÀI KHOẢN KHÔNG ĐỦ CREDIT. Vui lòng nạp thêm để tiếp tục.', { autoClose: 8000 })
                setHistory(prev => prev.filter(f => f.id !== itemId && f.id !== activeJobFileIdRef.current))
                setProcessingStep(null)
                setContent(null)
                setSelectedFile(null)
                activeJobFileIdRef.current = null
                activePollingIdRef.current = null
                sse.close()
                return
              }

              if (data.error) {
                sse.close()
                return
              }

              // Cập nhật giai đoạn xử lý
              if (data.processing_stage) {
                setProcessingStep('understanding')
                setDetailedStage(data.processing_stage)
              }

              // Cập nhật Title mới từ AI (Auto-titling)
              if (data.title) {
                setHistory(prev => prev.map(f => 
                  (f.id === itemId || f.id === activeJobFileIdRef.current) 
                    ? { ...f, name: data.title } : f
                ))
                // Cập nhật tên hiển thị trong quá trình xử lý
                if (itemId === activePollingIdRef.current) {
                  setActiveUploadFileName(data.title)
                }
              }

              // Merge dữ liệu từng phase vào content state ngay khi nhận được
              const hasPartialData = data.summary || data.mindmap || data.lessons || data.quiz || data.source_url
              if (hasPartialData) {
                setContent(prev => ({
                  id: prev?.id || itemId,
                  source_type: data.source_type || prev?.source_type,
                  source_url: data.source_url || prev?.source_url,
                  // Phase 2: Summary + Mindmap
                  summary: data.summary || prev?.summary || null,
                  mindmap: data.mindmap || prev?.mindmap || null,
                  summary_versions: data.summary_versions || prev?.summary_versions || undefined,
                  mindmap_versions: data.mindmap_versions || prev?.mindmap_versions || undefined,
                  // Phase 3: Lessons
                  lessons: data.lessons || prev?.lessons || [],
                  lesson_versions: data.lesson_versions || prev?.lesson_versions || undefined,
                  // Phase 4: Quiz
                  quiz: data.quiz || prev?.quiz || [],
                  quiz_versions: data.quiz_versions || prev?.quiz_versions || undefined,
                }))
              }

              if (data.status === 'done') {
                // Hoàn tất — finalise state
                setProcessingStep('complete')
                setTimeout(() => {
                  setProcessingStep(null)
                  setDetailedStage(null)
                  setActiveUploadFileName(null)
                  setHistory(prev => prev.map(f =>
                    (f.id === itemId || f.id === activeJobFileIdRef.current)
                      ? { ...f, status: 'done' as const } : f
                  ))
                  activeJobFileIdRef.current = null
                  activePollingIdRef.current = null
                }, 500)
                sse.close()
              } else if (data.status === 'failed') {
                toast.error('Có lỗi xảy ra trong quá trình xử lý tài liệu.')
                setProcessingStep(null)
                activePollingIdRef.current = null
                sse.close()
              }
            } catch (e) {
              console.error('[SSE] Parse error:', e)
            }
          }

          sse.onerror = () => {
            console.warn('[SSE] Connection lost, falling back to polling...')
            sse.close()
            // Fallback: nếu SSE bị lỗi (VD: proxy cắt kết nối), dùng polling thường
            pollingFallback(itemId)
          }
        })
    },
    [clearPolling]
  )

  // Fallback dùng khi SSE bị lỗi (VD: mạng proxy không hỗ trợ streaming)
  const pollingFallback = useCallback((itemId: string) => {
    const poll = async () => {
      if (activePollingIdRef.current !== itemId) return
      try {
        const itemData = await checkItemStatus(itemId)
        // Item đã bị xóa (ví dụ: hết credit → backend xóa)
        if (!itemData) {
          toast.error('❌ TÀI KHOẢN KHÔNG ĐỦ CREDIT. Vui lòng nạp thêm để tiếp tục.', { autoClose: 8000 })
          setHistory(prev => prev.filter(f => f.id !== itemId && f.id !== activeJobFileIdRef.current))
          setProcessingStep(null)
          setContent(null)
          setSelectedFile(null)
          activeJobFileIdRef.current = null
          activePollingIdRef.current = null
          return
        }
        if (itemData?.status === 'done') {
          setContent({
            id: itemData.id, 
            summary: itemData.summary,
            summary_versions: itemData.summary_versions,
            lessons: itemData.lessons || [], 
            lesson_versions: itemData.lesson_versions,
            quiz: itemData.quiz || [], 
            quiz_versions: itemData.quiz_versions,
            mindmap: itemData.mindmap || { id: 'root', label: itemData.title || 'Mindmap', children: [] },
            mindmap_versions: itemData.mindmap_versions,
            source_type: itemData.source_type, 
            source_url: itemData.source_url
          })
          setProcessingStep('complete')
          setTimeout(() => {
            setProcessingStep(null); setDetailedStage(null); setActiveUploadFileName(null)
            setHistory(prev => prev.map(f =>
              (f.id === itemId || f.id === activeJobFileIdRef.current) ? { ...f, status: 'done' as const } : f
            ))
            activeJobFileIdRef.current = null; activePollingIdRef.current = null
          }, 500)
          return
        }
        if (itemData?.status === 'failed') { 
          toast.error('Có lỗi xảy ra trong quá trình xử lý tài liệu.')
          setProcessingStep(null); return 
        }
        if (itemData?.processing_stage) setDetailedStage(itemData.processing_stage)
      } catch (e) { console.error('[Fallback Poll]', e) }
      sseRef.current = { close: () => {} } as any // mark as active
      setTimeout(poll, 8000) // Hỏi mỗi 8s khi ở chế độ fallback
    }
    poll()
  }, [])

  const handleUpload = useCallback(
    async (fileInfo: {
      name: string
      type: 'pdf' | 'audio' | 'video' | 'youtube'
      file?: File
      url?: string
    }) => {
      resetRecording()

      // Bật ngay (trước re-render) để beforeunload/F5 không bỏ sót khoảng trống sau khi gọi upload.
      uploadActivityRef.current = true

      const newFile: UploadedFile = {
        id: Date.now().toString(),
        name: fileInfo.name,
        type: fileInfo.type,
        uploadedAt: new Date(),
        status: 'running',
      }

      setHistory((prev) => [newFile, ...prev])
      setSelectedFile(newFile.id)
      activeJobFileIdRef.current = newFile.id
      setIsMobileSidebarOpen(false)
      setProcessingStep('upload')
      setDetailedStage('ingestion')
      setActiveUploadFileName(fileInfo.name)

      try {
        const result = await uploadDocument(fileInfo.file || null, fileInfo.url || '', fileInfo.type)
        if (result && result.item_id) {
          const realId = result.item_id
          // Cập nhật ID thật vào history và chọn file đó ngay lập tức
          setHistory(prev => prev.map(item => 
            item.id === newFile.id ? { ...item, id: realId, type: fileInfo.type } : item
          ));
          setSelectedFile(realId)
          activeJobFileIdRef.current = realId
          startPolling(realId)
          router.push(`/workspace/${realId}/summary`)
        } else {
          setProcessingStep(null)
          setActiveUploadFileName(null)
          activeJobFileIdRef.current = null
          setHistory((prev) => prev.filter((f) => f.id !== newFile.id))
          console.error('Backend không trả về item_id hợp lệ', result)
        }
      } catch (e: any) {
        console.error('Lỗi upload:', e)
        const errorMessage = e instanceof Error ? e.message : 'Upload file không thành công, hãy thử lại';
        toast.error(errorMessage)
        setProcessingStep(null)
        setActiveUploadFileName(null)
        activeJobFileIdRef.current = null
        setHistory((prev) => prev.filter((f) => f.id !== newFile.id))
      }
    },
    [startPolling, resetRecording]
  )

  const submitRecordedAudio = useCallback(() => {
    if (!audioBlob) return
    const file = new File([audioBlob], `voice-recording-${Date.now()}.webm`, {
      type: 'audio/webm',
    })
    setAudioURL((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setAudioBlob(null)
    setRecordingSeconds(0)
    void handleUpload({ name: file.name, type: 'audio', file })
  }, [audioBlob, handleUpload])

  const handleNewChat = useCallback(() => {
    resetRecording()
    clearPolling()
    setSelectedFile(null)
    setContent(null)
    setProcessingStep(null)
    setActiveUploadFileName(null)
    activeJobFileIdRef.current = null
    setActiveTab('summary')
    setIsMobileSidebarOpen(false)
    router.push('/')
  }, [clearPolling, resetRecording, router])

  const handleSelectFile = useCallback(
    async (id: string, preventNavigation = false) => {
      if (selectedFile === id) return
      resetRecording()
      clearPolling()
      setSelectedFile(id)
      
      if (!preventNavigation) {
        router.push(`/workspace/${id}/summary`)
      }
      
      // Clear content cũ ngay lập tức để người dùng thấy đang chuyển sang bài mới
      setContent(null)
      setProcessingStep('fetching') // Sử dụng 'fetching' để hiển thị spinner thay vì thanh tiến trình
      
      try {
        const itemData = await checkItemStatus(id)
        if (itemData) {
          setContent({
            id: itemData.id,
            summary: itemData.summary,
            summary_versions: itemData.summary_versions,
            lessons: itemData.lessons || [],
            lesson_versions: itemData.lesson_versions,
            quiz: itemData.quiz || [],
            quiz_versions: itemData.quiz_versions,
            mindmap: itemData.mindmap || { id: 'root', label: itemData.title, children: [] },
            mindmap_versions: itemData.mindmap_versions,
            source_type: itemData.source_type,
            source_url: itemData.source_url
          })
          
          if (itemData.status !== 'done' && itemData.status !== 'failed') {
             // Nếu bài học chưa xong hẳn, tiếp tục polling
             startPolling(id)
          } else {
             setProcessingStep(null)
          }
        }
      } catch (err) {
        console.error('Lỗi khi fetch item detail', err)
        const message = err instanceof Error ? err.message : 'Không thể tải chi tiết tài liệu'
        toast.error(message)
        setContent(null)
        setProcessingStep(null)
      }

      setActiveUploadFileName(null)
      activeJobFileIdRef.current = null
      setIsMobileSidebarOpen(false)
    },
    [selectedFile, clearPolling, resetRecording, startPolling]
  )

  const handleRenameFile = useCallback(
    async (id: string, newName: string) => {
      // 1. Lưu lại tên cũ của file cụ thể này để khôi phục nếu lỗi
      const oldFile = history.find((f) => f.id === id)
      const oldName = oldFile?.name || ''
      
      try {
        // 2. Cập nhật giao diện và hiện thông báo NGAY LẬP TỨC (Optimistic Update)
        setHistory((prev) =>
          prev.map((item) => (item.id === id ? { ...item, name: newName } : item))
        )
        toast.success('Đã đổi tên tài liệu')
        
        // 3. Gọi API đổi tên ngầm ở phía sau
        const updated = await renameItem(id, newName)
        
        // Cập nhật lại với dữ liệu thật từ server để đồng bộ
        setHistory((prev) =>
          prev.map((item) => (item.id === id ? { ...item, name: updated.title } : item))
        )
        
        if (selectedFile === id && content) {
          setContent({ ...content, summary: content.summary })
        }
      } catch (err) {
        console.error('Lỗi khi đổi tên file', err)
        toast.error('Không thể lưu tên mới vào hệ thống')
        // 4. CHỈ khôi phục lại tên cũ của đúng file bị lỗi, tránh ghi đè làm mất thay đổi của file khác
        setHistory((prev) =>
          prev.map((item) => (item.id === id ? { ...item, name: oldName } : item))
        )
      }
    },
    [selectedFile, content, history]
  )

  const handleDeleteFile = useCallback(
    async (id: string) => {
      try {
        // 1. Đưa vào danh sách chờ xoá để chặn "ghost item"
        setPendingDeletes((prev) => new Set(prev).add(id))

        // 2. Cập nhật giao diện ngay lập tức (Optimistic Update)
        setHistory((prev) => prev.filter((item) => item.id !== id))
        
        if (selectedFile === id) {
          handleNewChat()
        } else if (pathname.includes(`/workspace/${id}`)) {
          router.push('/')
        }

        // 3. Gọi API dọn dẹp ở phía sau
        await deleteItem(id)
        toast.success('Đã xoá tài liệu')
      } catch (err) {
        console.error('Lỗi khi xoá file', err)
        toast.error('Không thể xoá tài liệu')
        // Nếu lỗi thật sự, gỡ khỏi pendingDeletes để file hiện lại
        setPendingDeletes((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        loadHistory() // Tải lại để đồng bộ
      }
    },
    [selectedFile, handleNewChat]
  )

  const handleRegenerate = useCallback(
    async (type: 'summary' | 'mindmap' | 'lessons' | 'quiz', options?: { difficulty?: string }) => {
      if (!selectedFile) return

      // Bật trạng thái processing
      setProcessingStep('understanding')
      const label = type === 'summary' ? 'Tóm tắt' : type === 'mindmap' ? 'Sơ đồ tư duy' : type === 'lessons' ? 'Bài học' : 'Câu hỏi'
      setDetailedStage(`Đang tạo lại ${label}...`)

      try {
        let result
        if (type === 'summary') {
          result = await regenerateSummary(selectedFile)
        } else if (type === 'mindmap') {
          result = await regenerateMindmap(selectedFile)
        } else if (type === 'lessons') {
          result = await regenerateLessons(selectedFile)
        } else if (type === 'quiz') {
          result = await regenerateQuiz(selectedFile, options?.difficulty || 'intermediate')
        }

        if (result) {
          toast.info('Yêu cầu tạo lại đã được gửi')
          startPolling(selectedFile)
        }
      } catch (err) {
        console.error(`Lỗi khi tạo lại ${type}:`, err)
        toast.error(`Không thể tạo lại ${type}`)
        setProcessingStep(null)
      }
    },
    [selectedFile, startPolling]
  )

  const handleExampleClick = useCallback(
    (type: 'pdf' | 'youtube' | 'audio') => {
      const names = {
        pdf: 'Báo cáo Nghiên cứu Mẫu.pdf',
        youtube: 'Video Hướng dẫn YouTube',
        audio: 'Bài giảng Ghi âm.mp3',
      }
      void handleUpload({ name: names[type], type })
    },
    [handleUpload]
  )

  const value: DocumentProcessingContextValue = {
    history,
    selectedFile,
    processingStep,
    detailedStage,
    content,
    activeUploadFileName,
    handleUpload,
    handleSelectFile,
    handleRenameFile,
    handleDeleteFile,
    handleRegenerate,
    handleExampleClick,
    handleNewChat,
    setActiveTab: (tab: string) => {
      setActiveTab(tab)
      if (selectedFile) {
        router.push(`/workspace/${selectedFile}/${tab}`)
      }
    },
    activeTab,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isDesktopSidebarCollapsed,
    setIsDesktopSidebarCollapsed,
    isRecording,
    recordingSeconds,
    audioURL,
    audioBlob,
    recordingError,
    startRecording,
    stopRecording,
    toggleRecording,
    submitRecordedAudio,
    clearRecordingError,
    liveTranscript,
    chunksSent,
    isFinishingRecording,
  }

  return (
    <DocumentProcessingContext.Provider value={value}>{children}</DocumentProcessingContext.Provider>
  )
}

export function useDocumentProcessing() {
  const ctx = useContext(DocumentProcessingContext)
  if (!ctx) {
    throw new Error('useDocumentProcessing must be used within DocumentProcessingProvider')
  }
  return ctx
}
