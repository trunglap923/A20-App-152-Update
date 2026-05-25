'use client'
import React from 'react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'

interface MarkdownContentProps {
  content: string
  className?: string
  noMargin?: boolean
}

export function MarkdownContent({ content, className, noMargin = false }: MarkdownContentProps) {
  // Tiền xử lý để hỗ trợ các ký hiệu LaTeX phổ biến khác như \( \) và \[ \]
  const processedContent = React.useMemo(() => {
    if (!content) return ''
    return content
      .replace(/\\\(/g, '$')
      .replace(/\\\)/g, '$')
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
  }, [content])

  return (
    <div className={cn("markdown-prose max-w-none text-foreground leading-relaxed", className)}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({node, ...props}) => <h1 className={cn("text-2xl font-bold mb-4 mt-6", noMargin && "m-0")} {...props} />,
          h2: ({node, ...props}) => <h2 className={cn("text-xl font-semibold mb-3 mt-5 text-primary", noMargin && "m-0")} {...props} />,
          h3: ({node, ...props}) => <h3 className={cn("text-lg font-medium mb-2 mt-4", noMargin && "m-0")} {...props} />,
          p: ({node, ...props}) => <p className={cn("text-sm sm:text-base whitespace-pre-wrap", noMargin ? "m-0" : "mb-4")} {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-2" {...props} />,
          li: ({node, ...props}) => <li className="text-sm sm:text-base" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-primary/90" {...props} />,
          code: ({node, ...props}) => (
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs sm:text-sm" {...props} />
          ),
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic my-4 text-muted-foreground" {...props} />
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
