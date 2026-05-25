'use client'

import { Sparkles, FileText, Youtube, Mic, ListChecks, Clock3, Lightbulb } from 'lucide-react'
import { motion } from 'framer-motion'

export function EmptyState({
  onExampleClick,
}: {
  onExampleClick?: (type: 'audio' | 'pdf' | 'youtube') => void
}) {
  const useCases = [
    {
      icon: FileText,
      title: 'Tài liệu & Báo cáo',
      description: 'Phân tích PDF dài, sách giáo khoa hoặc báo cáo nghiên cứu chuyên sâu.',
    },
    {
      icon: Youtube,
      title: 'Video & Podcast',
      description: 'Trích xuất kiến thức từ các bài giảng, hội thảo trên YouTube.',
    },
    {
      icon: Mic,
      title: 'Ghi âm trực tiếp',
      description: 'Chuyển đổi các cuộc họp, bài giảng trực tiếp thành sơ đồ tư duy.',
    },
  ]

  return (
    <div className="flex flex-1 flex-col items-center justify-start px-4 py-8 sm:px-8 sm:py-14 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-5xl"
      >
        <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-7">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 sm:h-14 sm:w-14">
              <Sparkles className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground sm:text-2xl">
                Khám phá không gian làm việc
              </h2>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                Tải lên một tài liệu ở khu vực phía trên để hệ thống bắt đầu quy trình phân tích và chuyển hóa kiến thức.
              </p>
            </div>
          </div>

          {/* Gợi ý Use Cases thay vì Nút bấm */}
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {useCases.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
                className="flex flex-col items-start rounded-xl border border-border/50 bg-background/50 p-4 text-left"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="mb-1 text-sm font-semibold text-foreground sm:text-base">
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {item.description}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Các thông tin pipeline */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <ListChecks className="h-4 w-4 text-primary" />
                Quy trình tự động
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Hệ thống sẽ chạy tuần tự: Trích xuất (Ingestion) → Tóm tắt (Summary) → Bài học (Lessons) → Câu hỏi (Quiz) → Sơ đồ (Mindmap).
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock3 className="h-4 w-4 text-primary" />
                Xử lý Realtime
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Bạn có thể theo dõi trực tiếp tiến trình AI xử lý dữ liệu thông qua thanh trạng thái pipeline xuất hiện sau khi upload.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-primary" />
                Mẹo tối ưu
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nên sử dụng tài liệu PDF có cấu trúc Heading rõ ràng hoặc video có audio chất lượng tốt để AI trích xuất chính xác nhất.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}