'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { RefreshCw, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MindmapNode, MindmapVersion } from '@/lib/types'
import dynamic from 'next/dynamic'
import { useDocumentProcessing } from '@/contexts/document-processing-context'
import { saveMindmapSlideImageToCache } from '@/lib/slide-deck-storage'

// Dynamically import MindMap from @ant-design/graphs
const MindMap = dynamic(
  () => import('@ant-design/graphs').then((mod) => ({ default: mod.MindMap })),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-card/50 rounded-2xl border">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground">Đang tải sơ đồ tư duy...</p>
      </div>
    )
  }
)

interface MindmapTabProps {
  mindmap: MindmapNode
  mindmapVersions?: MindmapVersion[]
  itemId?: string
}

export function MindmapTab({ mindmap, mindmapVersions = [], itemId }: MindmapTabProps) {
  const { handleRegenerate } = useDocumentProcessing()!
  const chartRef = useRef<any>(null)
  const exportSurfaceRef = useRef<HTMLDivElement | null>(null)
  const isMountedRef = useRef(false)
  const activeGraphTokenRef = useRef(0)
  const captureTimerIdsRef = useRef<number[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(
    mindmapVersions.length > 0 ? mindmapVersions[0].version_id : null
  )
  const [isReady, setIsReady] = useState(false)
  const [renderKey, setRenderKey] = useState(Date.now())
  const lastFittedIdRef = useRef<string | null>(null)

  // Tự động chọn phiên bản mới nhất khi có dữ liệu mới index
  const [prevCount, setPrevCount] = useState(0)
  useEffect(() => {
    if (mindmapVersions.length > prevCount) {
      setActiveVersionId(mindmapVersions[0].version_id)
    }
    setPrevCount(mindmapVersions.length)
  }, [mindmapVersions, prevCount])

  const activeMindmap = useMemo(() => {
    if (mindmapVersions.length > 0 && activeVersionId) {
      return mindmapVersions.find(v => v.version_id === activeVersionId)?.mindmap || mindmap
    }
    return mindmap
  }, [mindmap, mindmapVersions, activeVersionId])

  // Kiểm tra dữ liệu hợp lệ không
  const hasData = activeMindmap && (activeMindmap.name || activeMindmap.title || activeMindmap.label);

  // Đệ quy chuẩn hóa dữ liệu cho G6 v5
  // @ant-design/graphs MindMap dùng `id` để hiển thị label — nên id phải là text thực
  // Dùng seenCounts để đảm bảo id unique (label trùng → thêm số thứ tự từ lần 2 trở đi)
  const formatNode = (node: any, seenCounts: Record<string, number> = {}): any => {
    if (!node) return null;
    const baseLabel = node.name || node.title || node.label || 'Khái niệm';

    seenCounts[baseLabel] = (seenCounts[baseLabel] || 0) + 1;
    const count = seenCounts[baseLabel];
    const uniqueLabel = count > 1 ? `${baseLabel} (${count})` : baseLabel;

    return {
      id: uniqueLabel,     // ID = label text unique (G6 dùng id để hiển thị)
      name: uniqueLabel,
      label: uniqueLabel,
      children: (node.children || [])
        .map((child: any) => formatNode(child, seenCounts))
        .filter(Boolean)
    }
  }

  useEffect(() => {
    let mounted = true;
    console.log("🧩 Mindmap Data check:", mindmap);
    if (!hasData) return;
    // Delay nhỏ để đảm bảo dynamic import của MindMap đã load xong
    const timer = setTimeout(() => {
      if (mounted) setIsReady(true);
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [activeMindmap, hasData]);

  const chartConfig = useMemo(() => {
    if (!hasData) return null;
    const formattedData = formatNode(activeMindmap);
    console.log("📊 Formatted Graph Data:", formattedData);

    return {
      data: formattedData,
      layout: {
        type: 'mindmap',
        direction: 'H',
        getHGap: () => 70,
        getVGap: () => 20,
      },
      labelField: 'id',
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'collapse-expand'],
      autoFit: undefined,
      fitCenter: undefined,
    }
  }, [activeMindmap, hasData])

  const clearCaptureTimers = useCallback(() => {
    captureTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    captureTimerIdsRef.current = []
  }, [])

  const resolveLiveGraph = useCallback((graphInstance?: any) => {
    const graph = graphInstance?.getGraph?.() || graphInstance || chartRef.current?.getGraph?.() || chartRef.current
    if (!isMountedRef.current || !graph || graph.destroyed) return null
    return graph
  }, [])

  const shouldAbortGraphWork = useCallback((token: number, graphInstance?: any) => {
    if (!isMountedRef.current) return true
    if (token !== activeGraphTokenRef.current) return true
    return !resolveLiveGraph(graphInstance)
  }, [resolveLiveGraph])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      activeGraphTokenRef.current += 1
      chartRef.current = null
      clearCaptureTimers()
    }
  }, [clearCaptureTimers])

  const waitForAnimationFrames = useCallback(async (count = 2) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    }
  }, [])

  const exportGraphToPng = useCallback(async (graphInstance?: any) => {
    const graph = resolveLiveGraph(graphInstance)
    if (!graph?.toDataURL) return null
    try {
      const dataUrl = await graph.toDataURL({
        mode: 'viewport',
        type: 'image/png',
      })
      return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') ? dataUrl : null
    } catch {
      return null
    }
  }, [resolveLiveGraph])

  const exportSvgElementToPng = useCallback(async (svgElement: SVGElement, width?: number, height?: number) => {
    const svgRect = svgElement.getBoundingClientRect()
    const safeWidth = Math.max(1, Math.round(width || svgRect.width || 1600))
    const safeHeight = Math.max(1, Math.round(height || svgRect.height || 900))
    const serialized = new XMLSerializer().serializeToString(svgElement)
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(svgBlob)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Không thể đọc SVG mindmap'))
        img.src = objectUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = safeWidth * 2
      canvas.height = safeHeight * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }, [])

  const exportSurfaceLayersToPng = useCallback(async (target: HTMLDivElement) => {
    const targetRect = target.getBoundingClientRect()
    const width = Math.max(1, Math.round(targetRect.width || target.clientWidth || 1600))
    const height = Math.max(1, Math.round(targetRect.height || target.clientHeight || 900))
    const pixelRatio = 2
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = width * pixelRatio
    exportCanvas.height = height * pixelRatio
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return null

    ctx.scale(pixelRatio, pixelRatio)
    ctx.fillStyle = window.getComputedStyle(target).backgroundColor || '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const canvasLayers = Array.from(target.querySelectorAll('canvas')) as HTMLCanvasElement[]
    for (const layer of canvasLayers) {
      if (!layer.width || !layer.height) continue
      const rect = layer.getBoundingClientRect()
      const dx = rect.left - targetRect.left
      const dy = rect.top - targetRect.top
      const drawW = Math.max(1, rect.width)
      const drawH = Math.max(1, rect.height)
      try {
        ctx.drawImage(layer, dx, dy, drawW, drawH)
      } catch {
        // skip broken layer and continue composing the others
      }
    }

    const svgLayers = Array.from(target.querySelectorAll('svg')) as SVGElement[]
    for (const layer of svgLayers) {
      const rect = layer.getBoundingClientRect()
      const dx = rect.left - targetRect.left
      const dy = rect.top - targetRect.top
      const drawW = Math.max(1, Math.round(rect.width))
      const drawH = Math.max(1, Math.round(rect.height))
      try {
        const svgDataUrl = await exportSvgElementToPng(layer, drawW, drawH)
        if (!svgDataUrl) continue
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('Không thể ghép layer SVG'))
          img.src = svgDataUrl
        })
        ctx.drawImage(image, dx, dy, drawW, drawH)
      } catch {
        // skip broken svg layer and continue composing the others
      }
    }

    if (canvasLayers.length === 0 && svgLayers.length === 0) {
      return null
    }
    return exportCanvas.toDataURL('image/png')
  }, [exportSvgElementToPng])

  const captureMindmapImage = useCallback(async (graphInstance?: any, token = activeGraphTokenRef.current) => {
    const target = exportSurfaceRef.current
    if (!target || !hasData || shouldAbortGraphWork(token, graphInstance)) return
    try {
      const { toPng } = await import('html-to-image')
      if (shouldAbortGraphWork(token, graphInstance)) return
      const htmlDataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: window.getComputedStyle(target).backgroundColor || '#ffffff',
      })
      if (shouldAbortGraphWork(token, graphInstance)) return
      if (typeof htmlDataUrl === 'string' && htmlDataUrl.startsWith('data:image/')) {
        saveMindmapSlideImageToCache(htmlDataUrl, itemId)
        return
      }

      const composedDataUrl = await exportSurfaceLayersToPng(target)
      if (shouldAbortGraphWork(token, graphInstance)) return
      if (typeof composedDataUrl === 'string' && composedDataUrl.startsWith('data:image/')) {
        saveMindmapSlideImageToCache(composedDataUrl, itemId)
        return
      }

      const graphDataUrl = await exportGraphToPng(graphInstance || chartRef.current)
      if (shouldAbortGraphWork(token, graphInstance)) return
      if (typeof graphDataUrl === 'string' && graphDataUrl.startsWith('data:image/')) {
        saveMindmapSlideImageToCache(graphDataUrl, itemId)
      }
    } catch (error) {
      console.error('Không thể render sơ đồ tư duy thành ảnh:', error)
    }
  }, [exportGraphToPng, exportSurfaceLayersToPng, hasData, itemId, shouldAbortGraphWork])

  const fitAndCapture = useCallback((graphInstance?: any, token = activeGraphTokenRef.current) => {
    void (async () => {
      const graph = resolveLiveGraph(graphInstance)
      const target = exportSurfaceRef.current
      if (!graph || !target || shouldAbortGraphWork(token, graph)) return
      try {
        if (shouldAbortGraphWork(token, graph)) return
        if (target?.clientWidth && target?.clientHeight) {
          graph?.resize?.(target.clientWidth, target.clientHeight)
        }
        if (shouldAbortGraphWork(token, graph)) return
        await graph?.render?.()
      } catch {
        // continue with best-effort export even if render throws
      }
      if (shouldAbortGraphWork(token, graph)) return
      
      // CHIẾN LƯỢC: Chỉ tự động căn giữa/vừa khung nếu là lần đầu tiên của itemId này
      // giúp giữ nguyên vị trí zoom/pan của người dùng khi chuyển tab hoặc update nhẹ.
      const needsFirstTimeFit = itemId && lastFittedIdRef.current !== itemId;

      try {
        if (needsFirstTimeFit) {
          console.log("🎯 First time fit for item:", itemId);
          await graph?.fitCenter?.()
          if (shouldAbortGraphWork(token, graph)) return
          await graph?.fitView?.()
          lastFittedIdRef.current = itemId || null;
        }
      } catch (err) {
        console.warn("Chart fitting issue:", err);
      }
      if (shouldAbortGraphWork(token, graph)) return
      await waitForAnimationFrames(4)
      if (shouldAbortGraphWork(token, graph)) return
      await captureMindmapImage(graph, token)
    })()
  }, [captureMindmapImage, resolveLiveGraph, shouldAbortGraphWork, waitForAnimationFrames])

  const scheduleFitAndCapture = useCallback((delayMs: number, graphInstance?: any, token = activeGraphTokenRef.current) => {
    const timerId = window.setTimeout(() => {
      captureTimerIdsRef.current = captureTimerIdsRef.current.filter((id) => id !== timerId)
      if (shouldAbortGraphWork(token, graphInstance)) return
      fitAndCapture(graphInstance, token)
    }, delayMs)
    captureTimerIdsRef.current.push(timerId)
  }, [fitAndCapture, shouldAbortGraphWork])

  useEffect(() => {
    if (!isReady || !chartConfig) return
    clearCaptureTimers()
    const token = activeGraphTokenRef.current
    
    // Chỉ thực hiện fitAndCapture một lần sau khi dữ liệu ổn định để tránh nhảy màn hình nhiều lần
    scheduleFitAndCapture(1000, chartRef.current, token)

    return () => clearCaptureTimers()
  }, [isReady, chartConfig, clearCaptureTimers, renderKey, scheduleFitAndCapture])

  if (!hasData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10 text-muted-foreground p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <GitBranch className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-foreground">Sơ đồ tư duy chưa sẵn sàng</p>
          <p className="text-sm text-muted-foreground">
            Hệ thống đang quá tải hoặc nội dung quá phức tạp khiến không thể tạo sơ đồ kịp thời.
            <br />Bạn có thể thử tạo lại bất cứ lúc nào.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => handleRegenerate('mindmap')} className="mt-1 gap-2 border-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/20">
          <RefreshCw className="h-4 w-4" /> Tạo lại sơ đồ tư duy
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 h-[750px] flex flex-col">
      {/* Version Selector — Chip style */}
      {mindmapVersions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Phiên bản:</span>
          {mindmapVersions.map(v => (
            <button
              key={v.version_id}
              onClick={() => {
                setActiveVersionId(v.version_id)
                activeGraphTokenRef.current += 1
                setRenderKey(Date.now())
              }}
              style={{
                borderRadius: '9999px',
                padding: '4px 14px',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s',
                border: activeVersionId === v.version_id ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: activeVersionId === v.version_id ? 'var(--primary)' : 'transparent',
                color: activeVersionId === v.version_id ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}


      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-sm font-medium text-muted-foreground flex gap-2 items-center">
          <GitBranch className="h-4 w-4 text-primary" /> Sơ đồ tri thức (Interactive)
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleRegenerate('mindmap')} className="gap-2 hover:bg-primary/10 hover:text-primary transition-colors">
            <RefreshCw className="h-4 w-4" /> Tạo lại
          </Button>
        </div>
      </div>

      <div
        ref={exportSurfaceRef}
        className="flex-1 overflow-hidden rounded-2xl border border-border bg-card relative shadow-inner"
      >
        {isReady && chartConfig && (
          <MindMap
            key={renderKey}
            {...chartConfig}
            onReady={(chart: any) => {
              clearCaptureTimers()
              const graph = chart?.getGraph?.() || chart
              activeGraphTokenRef.current += 1
              const token = activeGraphTokenRef.current
              chartRef.current = graph
              // Gọi fitView một lần sau khi ready để đảm bảo căn giữa ban đầu
              scheduleFitAndCapture(500, graph, token)
            }}
            onDestroy={() => {
              activeGraphTokenRef.current += 1
              chartRef.current = null
              clearCaptureTimers()
            }}
          />
        )}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/10 backdrop-blur-[1px]">
             <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground px-2 flex justify-between items-center whitespace-nowrap overflow-hidden">
        <p>💡 Cuộn chuột để Zoom, Kéo để di chuyển sơ đồ</p>
        <div className="flex gap-4">
           <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /> Chủ đề</span>
           <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-border" /> Kết nối</span>
        </div>
      </div>
    </div>
  )
}