'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Copy, Check, RefreshCw, Sparkles, ChevronDown, Zap, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/ui/markdown-content'
import type { Summary, SummaryVersion, HighlightItem } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { VideoPlayer } from '@/components/video-player'
import dynamic from 'next/dynamic'
import { useDocumentProcessing } from '@/contexts/document-processing-context'

const PdfViewer = dynamic(() => import('@/components/pdf-viewer').then(mod => mod.PdfViewer), {
  ssr: false,
})

interface SummaryTabProps {
  summary: Summary
  summaryVersions?: SummaryVersion[]
  sourceType?: 'pdf' | 'audio' | 'video' | 'youtube'
  sourceUrl?: string
}

export function SummaryTab({ summary, summaryVersions, sourceType, sourceUrl }: SummaryTabProps) {
  const { handleRegenerate } = useDocumentProcessing()!
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [isDetailedExpanded, setIsDetailedExpanded] = useState(false)
  const [copiedSection, setCopiedSection] = useState<string | null>(null)
  const [activeQuote, setActiveQuote] = useState<{ keyword: string, quote: string, media_timestamp?: string | null, page?: number | null } | null>(null)

  const [prevCount, setPrevCount] = useState(0)

  // Reset states when switching files (identified by summary change)
  useEffect(() => {
    setActiveVersionId(null)
    setActiveQuote(null)
    setPrevCount(0)
  }, [summary])

  // Set default active version & Auto-switch to newest when added
  useEffect(() => {
    if (summaryVersions && summaryVersions.length > 0) {
      if (summaryVersions.length > prevCount) {
        setActiveVersionId(summaryVersions[0].version_id)
      }
      setPrevCount(summaryVersions.length)
    }
  }, [summaryVersions, prevCount])

  const activeSummary = summaryVersions && activeVersionId
    ? summaryVersions.find(v => v.version_id === activeVersionId)?.summary || summary
    : summary

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedSection(section)
    setTimeout(() => setCopiedSection(null), 2000)
  }

  const currentSummary = activeSummary || summary;
  const hasMedia = sourceType && sourceUrl && (sourceType === 'video' || sourceType === 'youtube' || sourceType === 'audio')
  const hasPdf = sourceType === 'pdf' && sourceUrl

  // Sắp xếp và Lọc Highlights theo thời gian (Frontend fail-safe)
  const sortedHighlights = useMemo(() => {
    if (!currentSummary?.highlights) return []
    
    // Đối với Video/Audio: Chỉ giữ lại các ý chính có timestamp
    let filtered = [...currentSummary.highlights]
    if (sourceType !== 'pdf') {
      filtered = filtered.filter(h => h.media_timestamp && h.media_timestamp.trim() !== "")
    }

    return filtered.sort((a: any, b: any) => {
      if (sourceType === 'pdf') {
        return (a.page_number || 0) - (b.page_number || 0)
      }
      
      const parse = (ts: string | null | undefined) => {
        if (!ts) return 0
        // Xử lý chuỗi timestamp MM:SS hoặc HH:MM:SS
        const parts = ts.replace(/[^0-9:]/g, '').split(':').map(Number)
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if (parts.length === 2) return parts[0] * 60 + parts[1]
        return parts[0] || 0
      }
      return parse(a.media_timestamp) - parse(b.media_timestamp)
    })
  }, [currentSummary?.highlights, sourceType])

  // Đo chiều cao cột trái (Media/PDF) để panel Highlights khớp chính xác
  const mediaColRef = useRef<HTMLDivElement>(null)
  const [mediaColHeight, setMediaColHeight] = useState<number>(0)

  useEffect(() => {
    const el = mediaColRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setMediaColHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasMedia, hasPdf])

  if (!currentSummary) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">Đang tải dữ liệu tóm tắt...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Version Selector — Chip-style */}
      {summaryVersions && summaryVersions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Phiên bản:</span>
          {summaryVersions.map(v => (
            <button
              key={v.version_id}
              onClick={() => setActiveVersionId(v.version_id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 border",
                activeVersionId === v.version_id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-accent hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {!currentSummary || !currentSummary.tldr ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[200px]">
          <RefreshCw className="h-8 w-8 animate-spin mb-4 text-primary/50" />
          <p>Hệ thống đang trích xuất và tạo tóm tắt, vui lòng chờ giây lát...</p>
        </div>
      ) : (
        <>
          {/* ============================================================
              LAYOUT AUDIO: Dọc — player trên, highlights chips dưới
              Audio player rất thấp nên không phù hợp layout 2 cột
          ============================================================ */}
          {sourceType === 'audio' && hasMedia && currentSummary.highlights && currentSummary.highlights.length > 0 ? (

            <div className="space-y-4">
              <VideoPlayer type="audio" url={sourceUrl!} activeQuote={activeQuote} />
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">Ý chính nổi bật</h3>
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> Click để nhảy
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sortedHighlights.map((highlight, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15 + index * 0.04 }}
                      onClick={() => setActiveQuote({
                        keyword: highlight.keyword,
                        quote: highlight.source_quote,
                        media_timestamp: highlight.media_timestamp,
                        page: (highlight as any).page_number
                      })}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 border flex items-center gap-1.5",
                        activeQuote?.keyword === highlight.keyword
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/50 text-foreground border-border hover:bg-accent hover:border-primary/30"
                      )}
                    >
                      {highlight.keyword}
                      {highlight.media_timestamp && (
                        <span className={cn(
                          "text-[10px] font-mono rounded px-1 border",
                          activeQuote?.keyword === highlight.keyword
                            ? "bg-white/20 border-white/30"
                            : "bg-muted text-muted-foreground border-border"
                        )}>
                          {highlight.media_timestamp}
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (hasMedia || hasPdf) && currentSummary.highlights && currentSummary.highlights.length > 0 ? (
            // ============================================================
            // LAYOUT 2 CỘT: Video/PDF bên trái + Highlights panel bên phải
            // ============================================================
            <div className="flex flex-col lg:flex-row lg:items-start gap-4 overflow-hidden">
              {/* Cột trái: Media Player — đo chiều cao bằng ref */}
              <div ref={mediaColRef} className="flex-1 min-w-0">
                {hasMedia && (
                  <div className="-mb-6">
                    <VideoPlayer type={sourceType as any} url={sourceUrl!} activeQuote={activeQuote} />
                  </div>
                )}
                {hasPdf && (
                  <PdfViewer url={sourceUrl!} searchQuery={activeQuote} />
                )}
              </div>

              {/* Cột phải: Panel Ý chính nổi bật */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full lg:w-[300px] flex-shrink-0 rounded-2xl border border-border bg-card flex flex-col overflow-hidden"
                style={mediaColHeight > 0 ? { height: mediaColHeight } : {}}
              >
                {/* Header Panel */}
                <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">Ý chính nổi bật</h3>
                  {sourceType !== 'pdf' && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> Click để nhảy
                    </span>
                  )}
                </div>

                {/* Danh sách Highlights — scroll khi thiếu chỗ */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
                  {(sortedHighlights as any[]).map((highlight, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + index * 0.04 }}
                      onClick={() => setActiveQuote({
                        keyword: highlight.keyword,
                        quote: highlight.source_quote,
                        media_timestamp: highlight.media_timestamp,
                        page: highlight.page_number
                      })}
                      className={cn(
                        "w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 border group",
                        activeQuote?.keyword === highlight.keyword
                          ? "bg-primary/10 border-primary/40 shadow-sm"
                          : "bg-background border-border/50 hover:bg-accent hover:border-primary/20"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          "text-xs font-semibold leading-tight line-clamp-2",
                          activeQuote?.keyword === highlight.keyword ? "text-primary" : "text-foreground"
                        )}>
                          {highlight.keyword}
                        </span>
                        
                        {/* Timestamp for Video/Audio */}
                        {highlight.media_timestamp && sourceType !== 'pdf' && (
                          <span className={cn(
                            "flex-shrink-0 text-[10px] font-mono rounded-md px-1.5 py-0.5 border",
                            activeQuote?.keyword === highlight.keyword
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border"
                          )}>
                            {highlight.media_timestamp}
                          </span>
                        )}

                        {/* Page Number for PDF */}
                        {highlight.page_number && sourceType === 'pdf' && (
                          <span className={cn(
                            "flex-shrink-0 text-[10px] font-mono rounded-md px-1.5 py-0.5 border",
                            activeQuote?.keyword === highlight.keyword
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border"
                          )}>
                            Trang {highlight.page_number}
                          </span>
                        )}
                      </div>
                      {highlight.source_quote && (
                        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                          "{highlight.source_quote}"
                        </p>
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            /* Không có highlights hoặc không có media → full-width */
            <>
              {hasMedia && (
                <VideoPlayer type={sourceType as any} url={sourceUrl!} activeQuote={activeQuote} />
              )}
              {hasPdf && (
                <PdfViewer url={sourceUrl!} searchQuery={activeQuote} />
              )}
            </>
          )}

          {/* TL;DR Section */}


          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Tóm tắt nhanh</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(currentSummary.tldr.join('\n'), 'tldr')}
                className="gap-2"
              >
                {copiedSection === 'tldr' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Sao chép
              </Button>
            </div>
            <ul className="space-y-3">
              {currentSummary.tldr.map((point, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-sm leading-relaxed text-foreground">{point}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Detailed Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            <div
              onClick={() => setIsDetailedExpanded(!isDetailedExpanded)}
              className="flex w-full items-center justify-between p-6 cursor-pointer hover:bg-muted/50 transition-colors"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsDetailedExpanded(!isDetailedExpanded)
                }
              }}
            >
              <h3 className="text-lg font-semibold text-foreground">Tóm tắt chi tiết</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    copyToClipboard(currentSummary.detailed, 'detailed')
                  }}
                  className="h-8 px-2 gap-1"
                >
                  {copiedSection === 'detailed' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="text-sm">Sao chép</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsDetailedExpanded(!isDetailedExpanded)
                  }}
                  className="h-8 w-8"
                >
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 transition-transform duration-300',
                      isDetailedExpanded && 'rotate-180'
                    )}
                  />
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {isDetailedExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border px-6 pb-6 pt-4">
                    <MarkdownContent content={currentSummary.detailed} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Key Highlights — Chip layout (khi KHÔNG có media) */}
          {!(hasMedia || hasPdf) && currentSummary.highlights && currentSummary.highlights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <h3 className="mb-4 text-lg font-semibold text-foreground">Ý chính nổi bật</h3>
              <div className="flex flex-wrap gap-2">
                {sortedHighlights.map((highlight, index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                    onClick={() => setActiveQuote({ 
                      keyword: highlight.keyword, 
                      quote: highlight.source_quote, 
                      media_timestamp: highlight.media_timestamp,
                      page: (highlight as any).page_number
                    })}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium cursor-pointer transition-all shadow-sm flex items-center gap-2",
                      activeQuote?.keyword === highlight.keyword
                        ? "bg-primary text-primary-foreground scale-105"
                        : "bg-accent text-accent-foreground hover:bg-primary/20 hover:scale-105"
                    )}
                    title={highlight.source_quote}
                  >
                    {highlight.keyword}
                    {highlight.media_timestamp && (
                      <span className="ml-1.5 opacity-70 text-[10px] font-mono border-l pl-1.5 border-current">
                        {highlight.media_timestamp}
                      </span>
                    )}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}

          {/* Regenerate Button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => handleRegenerate('summary')}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Tạo lại tóm tắt
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
