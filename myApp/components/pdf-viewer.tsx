'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { FileText, ExternalLink, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// Initialize the PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
  searchQuery?: { keyword: string, quote: string, page?: number | null } | null
}

export function PdfViewer({ url, searchQuery }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [searchText, setSearchText] = useState<{ keyword: string, quote: string, page?: number | null } | null>(searchQuery || null)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)

  // Update container width for responsive PDF
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Trừ đi padding (p-4 = 1rem * 2 = 32px) và một chút biên an toàn để tránh thanh trượt ngang
        const width = containerRef.current.clientWidth - 48;
        setContainerWidth(Math.max(width, 300));
      }
    }
    
    updateWidth()
    // Thêm một chút delay để đảm bảo layout đã ổn định trước khi tính toán
    const timer = setTimeout(updateWidth, 100);
    
    window.addEventListener('resize', updateWidth)
    return () => {
      window.removeEventListener('resize', updateWidth)
      clearTimeout(timer)
    }
  }, [])

  // Update internal search state if prop changes
  useEffect(() => {
    setSearchText(searchQuery || null)
  }, [searchQuery])

  // Reset to page 1 whenever a different PDF file is loaded
  useEffect(() => {
    setPageNumber(1)
    setSearchText(null)
    setPdfDocument(null)
  }, [url])

  function onDocumentLoadSuccess(pdf: any) {
    setNumPages(pdf.numPages)
    setPdfDocument(pdf)
  }

  // Search across pages when searchText changes
  useEffect(() => {
    if (!searchText || !pdfDocument) return;

    // Ưu tiên nhảy đến trang nếu có page được cung cấp
    if (searchText.page) {
      const targetPage = Math.max(1, Math.min(searchText.page, pdfDocument.numPages));
      setPageNumber(targetPage);
      return;
    }

    if (!searchText.quote) return;

    const findPageWithText = async () => {
      try {
        // Extract significant words from quote to do fuzzy matching
        const quoteWords = searchText.quote.toLowerCase()
          .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g," ")
          .split(/\s+/)
          .filter(w => w.length > 2);
          
        const normalizedKeyword = searchText.keyword.replace(/\s+/g, '').toLowerCase();

        let maxOverlapScore = 0;
        let bestPage = -1;
        let fallbackPage = -1;

        for (let i = 1; i <= pdfDocument.numPages; i++) {
          const page = await pdfDocument.getPage(i);
          const textContent = await page.getTextContent();
          
          const rawTextItems = textContent.items.map((item: any) => item.str).join(' ');
          const lowerPageText = rawTextItems.toLowerCase();
          const noSpacePageText = rawTextItems.replace(/\s+/g, '').toLowerCase();
          
          // Calculate overlap score for this page
          let score = 0;
          for (const word of quoteWords) {
            if (lowerPageText.includes(word)) {
              score++;
            }
          }
          
          // Massive bonus if the exact keyword appears on the page (Title match)
          if (lowerPageText.includes(searchText.keyword.toLowerCase())) {
            score += 10;
          }
          
          if (score > maxOverlapScore) {
            maxOverlapScore = score;
            bestPage = i;
          }
          
          // Save the first occurrence of the keyword as fallback
          if (fallbackPage === -1 && noSpacePageText.includes(normalizedKeyword)) {
            fallbackPage = i;
          }
        }
        
        // Require at least 40% of significant words to match, or at least 2 words
        const requiredScore = Math.max(2, Math.floor(quoteWords.length * 0.4));
        
        if (maxOverlapScore >= requiredScore) {
          setPageNumber(bestPage);
        } else if (fallbackPage !== -1) {
          setPageNumber(fallbackPage);
        }
      } catch (e) {
        console.error("Error searching PDF", e)
      }
    };
    
    findPageWithText();
  }, [searchText, pdfDocument]);

  const textRenderer = useCallback((textItem: any) => {
    if (!searchText || !searchText.keyword) return textItem.str;
    
    const lowerText = textItem.str.toLowerCase();
    const lowerSearch = searchText.keyword.toLowerCase();
    const index = lowerText.indexOf(lowerSearch);
    
    if (index >= 0) {
      const before = textItem.str.substring(0, index);
      const match = textItem.str.substring(index, index + searchText.keyword.length);
      const after = textItem.str.substring(index + searchText.keyword.length);
      
      return (
        <>
          {before}
          <mark className="bg-yellow-300 text-black px-0.5 rounded shadow-sm">{match}</mark>
          {after}
        </>
      );
    }
    return textItem.str;
  }, [searchText]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/30 px-4 py-3 gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Tài liệu gốc</h3>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center rounded-md border border-border bg-background">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.min(3, s + 0.2))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Pagination controls */}
          <div className="flex items-center rounded-md border border-border bg-background">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium px-2">
              {pageNumber} / {numPages || '-'}
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 text-xs hidden sm:flex">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Mở tab mới
            </a>
          </Button>
        </div>
      </div>
      
      {/* PDF Document Container */}
      <div 
        ref={containerRef} 
        className="relative w-full overflow-y-auto overflow-x-hidden bg-muted/20 flex justify-center p-4 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent" 
        style={{ height: 'min(800px, 80vh)' }}
      >
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Đang tải tài liệu PDF...</p>
            </div>
          }
          error={
            <div className="text-destructive p-4 border border-destructive/20 rounded bg-destructive/10">
              Lỗi không thể tải được file PDF. Có thể do CORS hoặc URL bị hỏng.
            </div>
          }
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            width={containerWidth || undefined}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            customTextRenderer={textRenderer}
            className="shadow-md rounded overflow-hidden"
          />
        </Document>
      </div>
    </motion.div>
  )
}
