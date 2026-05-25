'use client'

import { useEffect, useState } from 'react'
import { MessageSquarePlus, Bug, Lightbulb, Star, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'react-toastify'
import { motion, AnimatePresence } from 'framer-motion'

type FeedbackType = 'bug' | 'feature' | 'general'

export function FeedbackButton() {
  const [session, setSession] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(false)
  
  // Form state
  const [type, setType] = useState<FeedbackType>('general')
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [message, setMessage] = useState('')
  
  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [supabase.auth])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setType('general')
      setRating(0)
      setMessage('')
      setIsSuccess(false)
    }
  }, [isOpen])

  if (!session) return null

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error('Vui lòng nhập nội dung phản hồi')
      return
    }

    if (type === 'general' && rating === 0) {
      toast.error('Vui lòng chọn số sao đánh giá')
      return
    }

    setIsSubmitting(true)

    try {
      const { error } = await supabase.from('user_feedback').insert({
        user_id: session.user.id,
        type,
        rating: type === 'general' ? rating : null,
        message: message.trim(),
        status: 'new'
      })

      if (error) {
        console.error('Feedback submission error:', error)
        toast.error('Có lỗi xảy ra khi gửi phản hồi. Vui lòng thử lại.')
        setIsSubmitting(false)
        return
      }

      setIsSuccess(true)
      setTimeout(() => {
        setIsOpen(false)
      }, 2000)
    } catch (err) {
      console.error(err)
      toast.error('Lỗi kết nối. Vui lòng thử lại.')
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-xl hover:shadow-2xl hover:scale-110 active:scale-95 transition-all duration-200 group"
          title="Gửi Feedback"
        >
          <MessageSquarePlus className="w-6 h-6 group-hover:rotate-12 transition-transform duration-200" />
          <span className="absolute right-full mr-4 bg-popover text-popover-foreground text-sm px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-border">
            Gửi Feedback
          </span>
        </button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md rounded-2xl overflow-hidden">
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4 py-2"
            >
              <DialogHeader>
                <DialogTitle className="text-xl">Gửi Góp ý & Báo lỗi</DialogTitle>
                <DialogDescription>
                  Ý kiến của bạn giúp Nexus ngày càng hoàn thiện hơn.
                </DialogDescription>
              </DialogHeader>

              {/* Type Selection */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setType('general')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    type === 'general' 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-border hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Star className="w-5 h-5" />
                  <span className="text-xs font-medium">Đánh giá</span>
                </button>
                <button
                  onClick={() => setType('feature')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    type === 'feature' 
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                      : 'border-border hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Lightbulb className="w-5 h-5" />
                  <span className="text-xs font-medium">Góp ý</span>
                </button>
                <button
                  onClick={() => setType('bug')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    type === 'bug' 
                      ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                      : 'border-border hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Bug className="w-5 h-5" />
                  <span className="text-xs font-medium">Báo lỗi</span>
                </button>
              </div>

              {/* Star Rating (only for general) */}
              <AnimatePresence>
                {type === 'general' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex flex-col items-center justify-center py-2 overflow-hidden"
                  >
                    <p className="text-sm text-muted-foreground mb-2">Trải nghiệm của bạn thế nào?</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className="p-1 transition-transform hover:scale-110 active:scale-95"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                        >
                          <Star 
                            className={`w-8 h-8 ${
                              star <= (hoverRating || rating) 
                                ? 'fill-yellow-400 text-yellow-400' 
                                : 'text-muted-foreground/30'
                            } transition-colors`} 
                          />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message Input */}
              <div className="space-y-2">
                <Textarea
                  placeholder={
                    type === 'bug' ? "Mô tả chi tiết lỗi bạn gặp phải (ví dụ: đang làm gì thì bị lỗi, màn hình hiển thị gì...)" :
                    type === 'feature' ? "Bạn muốn Nexus có thêm tính năng gì?" :
                    "Chia sẻ thêm về trải nghiệm của bạn..."
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[120px] resize-none focus-visible:ring-primary"
                />
              </div>

              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting} 
                className="w-full h-11 text-base font-medium rounded-xl"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  'Gửi Phản Hồi'
                )}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-10 space-y-4"
            >
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-center">Cảm ơn bạn!</h3>
              <p className="text-muted-foreground text-center px-4">
                Phản hồi của bạn đã được ghi nhận và sẽ giúp Nexus ngày một tuyệt vời hơn.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
