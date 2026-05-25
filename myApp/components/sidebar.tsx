'use client'

import { FileText, Mic, Video, Youtube, Clock, Sparkles, Plus, ChevronLeft, Menu, MoreVertical, Edit2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UploadedFile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { AccountPanel } from '@/components/account-panel'
import { motion, AnimatePresence } from 'framer-motion'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabaseClient'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useState, useRef, useEffect, useCallback } from 'react'

const fileTypeIcons = {
  pdf: FileText,
  audio: Mic,
  video: Video,
  youtube: Youtube,
}

interface SidebarProps {
  history: UploadedFile[]
  selectedFile: string | null
  onSelectFile: (id: string) => void
  onNewChat: () => void
  isCollapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

export function Sidebar({ 
  history, 
  selectedFile, 
  onSelectFile, 
  onNewChat, 
  isCollapsed, 
  onCollapsedChange 
}: SidebarProps) {
  const { handleRenameFile, handleDeleteFile } = useDocumentProcessing()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const startEditing = (file: UploadedFile) => {
    setEditingId(file.id)
    setEditValue(file.name)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditValue('')
  }

  const submitRename = async (id: string) => {
    const newValue = editValue.trim()
    if (newValue && newValue !== history.find(f => f.id === id)?.name) {
      // Tắt chế độ chỉnh sửa ngay lập tức để tạo cảm giác mượt mà
      setEditingId(null)
      // Gọi API ở phía sau
      await handleRenameFile(id, newValue)
    } else {
      setEditingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(null) // Đóng dialog ngay lập tức
    await handleDeleteFile(id)
  }
  return (
    <motion.aside
      animate={{ width: isCollapsed ? 64 : 280 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex h-full flex-col border-r border-border bg-gradient-to-b from-sidebar to-sidebar/95 overflow-hidden shadow-sm"
    >
      {/* Header with Logo and Toggle */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-4">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2.5 min-w-0 flex-1"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg overflow-hidden shadow-sm">
                <img src="/favicon-32x32.png" alt="Nexus" width={40} height={40} />
              </div>
              <span className="text-lg font-bold text-sidebar-foreground truncate">Nexus</span>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCollapsedChange(!isCollapsed)}
          className="h-10 w-10 sm:h-9 sm:w-9 p-0 shrink-0 hover:bg-sidebar-accent/50"
          title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {isCollapsed ? (
            <Menu className="h-4 w-4 text-sidebar-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-sidebar-foreground" />
          )}
        </Button>
      </div>

      {/* New Chat Button */}
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-b border-border/40 px-3 py-3"
          >
            <Button
              onClick={onNewChat}
              className="w-full gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Cuộc trò chuyện mới
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Files Section */}
      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          {!isCollapsed ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <h3 className="flex items-center gap-2 sm:gap-2.5 px-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                <Clock className="h-3 sm:h-3.5 w-3 sm:w-3.5 shrink-0" />
                Tệp gần đây
              </h3>
              <div className="space-y-1.5">
                {history.length === 0 ? (
                  <p className="py-4 px-2 text-center text-sm text-sidebar-foreground/50">
                    Chưa có tệp nào
                  </p>
                ) : (
                  history.map((file, idx) => {
                    const Icon = fileTypeIcons[file.type] || FileText
                    const isEditing = editingId === file.id
                    const displayDate = file.uploadedAt instanceof Date 
                      ? file.uploadedAt.toLocaleDateString('vi-VN') 
                      : new Date(file.uploadedAt).toLocaleDateString('vi-VN')

                    return (
                      <div key={file.id} className="relative group/item">
                        <motion.div
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={cn(
                            'flex w-full items-center gap-2 sm:gap-3 rounded-lg px-2 sm:px-3 py-2 sm:py-2.5 text-left transition-all duration-200 min-h-[40px]',
                            selectedFile === file.id
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent/40'
                          )}
                        >
                          <div
                            onClick={() => !isEditing && onSelectFile(file.id)}
                            className={cn(
                              'flex h-10 w-10 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg transition-all cursor-pointer',
                              selectedFile === file.id 
                                ? 'bg-primary/20 text-primary' 
                                : 'bg-muted text-muted-foreground group-hover/item:text-primary'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          
                          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => !isEditing && onSelectFile(file.id)} title={file.name}>
                            {isEditing ? (
                              <input
                                ref={editInputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => submitRename(file.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') submitRename(file.id)
                                  if (e.key === 'Escape') cancelEditing()
                                }}
                                className="w-full bg-background border border-primary/30 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <>
                                <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                                <p className="text-[10px] sm:text-xs text-sidebar-foreground/60">
                                  {displayDate}
                                </p>
                              </>
                            )}
                          </div>

                          {!isEditing && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  startEditing(file)
                                }}>
                                  <Edit2 className="mr-2 h-4 w-4" />
                                  <span>Đổi tên</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDeleteConfirmId(file.id)
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span>Xoá</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </motion.div>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-2 pt-2"
            >
              {history.slice(0, 5).map((file, idx) => {
                const Icon = fileTypeIcons[file.type] || FileText
                return (
                  <div key={file.id} className="relative group/item">
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => onSelectFile(file.id)}
                      title={file.name}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg transition-all mx-auto',
                        selectedFile === file.id
                          ? 'bg-primary/20 text-primary shadow-sm'
                          : 'text-sidebar-foreground/60 hover:text-primary hover:bg-sidebar-accent/40'
                      )}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Icon className="h-5 w-5" />
                    </motion.button>
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AlertDialog for Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá tài liệu?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Toàn bộ dữ liệu phân tích (Tóm tắt, Mindmap, Câu hỏi...) và lịch sử chat liên quan sẽ bị xoá vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xoá tài liệu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credit Usage Progress */}
      <CreditProgress isCollapsed={isCollapsed} />

      {/* Account Panel */}
      <AccountPanel isCollapsed={isCollapsed} />
    </motion.aside>
  )
}

function CreditProgress({ isCollapsed }: { isCollapsed: boolean }) {
  const [credits, setCredits] = useState<{ balance: number; total_used: number } | null>(null)
  const supabase = createClient()

  const fetchCredits = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('user_credits')
      .select('balance, total_used')
      .eq('user_id', user.id)
      .maybeSingle()
    
    if (data) {
      setCredits({
        balance: Number(data.balance),
        total_used: Number(data.total_used)
      })
    } else {
      setCredits({ balance: 50, total_used: 0 })
    }
  }, [supabase])

  useEffect(() => {
    let channel: any;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await fetchCredits()

      const channelName = `sidebar-credits-${user.id}`
      console.log(`[SIDEBAR-REALTIME] Subscribing to ${channelName}`)

      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`
        }, (payload: any) => {
          console.log('[SIDEBAR-REALTIME] Received update:', payload)
          fetchCredits()
        })
        .subscribe((status: string) => {
          console.log(`[SIDEBAR-REALTIME] Status for ${channelName}:`, status)
        })
    }

    setupRealtime()

    return () => {
      if (channel) {
        console.log('[SIDEBAR-REALTIME] Unsubscribing...')
        supabase.removeChannel(channel)
      }
    }
  }, [supabase, fetchCredits])

  if (!credits) return null

  const total = credits.balance + credits.total_used
  const percentage = total > 0 ? Math.round((credits.total_used / total) * 100) : 0
  
  if (isCollapsed) {
    return (
      <div className="px-2 py-4 border-t border-border/40">
        <div className="h-12 w-2 bg-muted rounded-full mx-auto overflow-hidden relative shadow-inner">
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: `${percentage}%` }}
            className={cn(
              "absolute bottom-0 left-0 right-0 transition-all duration-700",
              percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-orange-500" : "bg-blue-500"
            )}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 border-t border-border/40 space-y-3 bg-sidebar/30">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/70">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary animate-pulse" />
          <span>Hạn mức sử dụng</span>
        </div>
        <span className={cn(
          percentage > 90 ? "text-red-500" : percentage > 70 ? "text-orange-500" : "text-blue-500"
        )}>
          {percentage}%
        </span>
      </div>
      
      <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden border border-border/20 shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-all duration-700",
            percentage > 90 
              ? "from-red-600 via-red-500 to-red-400" 
              : percentage > 70
              ? "from-orange-500 via-orange-500 to-orange-400"
              : "from-blue-600 via-blue-500 to-cyan-400"
          )}
        />
      </div>
      
      <div className="flex items-center justify-between text-[10px] text-sidebar-foreground/50 font-bold">
        <span>{credits.total_used.toLocaleString()} đã dùng</span>
        <span>{credits.balance.toLocaleString()} còn lại</span>
      </div>
    </div>
  )
}
