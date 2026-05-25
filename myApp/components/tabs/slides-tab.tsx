'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { 
    Layout, 
    Upload, 
    Link as LinkIcon, 
    Palette, 
    ChevronLeft, 
    ChevronRight, 
    RefreshCw, 
    Share2, 
    Plus, 
    Image as ImageIcon, 
    Mic, 
    GitBranch, 
    Sparkles, 
    Languages,
    Layers,
    Type as FontIcon,
    X,
    HelpCircle,
    FileText,
    Youtube,
    Music,
    Video,
    Palette as PaletteIcon,
    Check as CheckIcon,
    CheckCircle2,
    FileDown,
    Save,
    Cloud,
    CloudOff,
    Clock3
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'react-toastify'
import type { Slide, SlideShow, UploadedFile, QuizQuestion, MindmapNode } from '@/lib/types'
import dynamic from 'next/dynamic'
import { generateSlidesWithAi, generateSlideOutlineWithAi, type SlideOutlineItem } from '@/lib/api'
import pptxgen from 'pptxgenjs'
import { SUPPORTED_SLIDE_FONTS, normalizeSlideFont } from '@/lib/slide-fonts'
import {
    loadMindmapSlideImage,
    loadPersistedSlideDeck,
    savePersistedSlideDeck,
    MINDMAP_SLIDE_IMAGE_EVENT,
    type SyncResult,
} from '@/lib/slide-deck-storage'
import { SlideTemplatePreview } from './slide-template-preview'
import { buildSlideTemplate, SLIDE_H_IN, SLIDE_W_IN, type TemplateElement } from './slide-template'

// Dynamically import MindMap for thumbnail
const MindMapThumbnail = dynamic(
    () => import('@ant-design/graphs').then((mod) => ({ default: mod.MindMap })),
    { ssr: false }
)

interface SlidesTabProps {
    slideshow?: SlideShow
  itemId?: string
    selectedFile?: UploadedFile
    quiz?: QuizQuestion[]
    mindmap?: MindmapNode
    isActive?: boolean
}

export function SlidesTab({ slideshow: initialSlideshow, itemId, selectedFile, quiz, mindmap, isActive = false }: SlidesTabProps) {
    const normalizeDeckStyle = (input?: Partial<NonNullable<SlideShow['style']>> | null): NonNullable<SlideShow['style']> => {
        const palette = Array.isArray(input?.colorPalette)
            ? input!.colorPalette.map((color) => String(color || '').trim()).filter(Boolean)
            : []
        const safePalette =
            palette.length >= 3
                ? palette.slice(0, 3)
                : palette.length === 2
                    ? [palette[0], palette[1], palette[0]]
                    : palette.length === 1
                        ? [palette[0], palette[0], palette[0]]
                        : ['#3b82f6', '#1d4ed8', '#1e3a8a']

        return {
            category: (input?.category as NonNullable<SlideShow['style']>['category']) || 'academic',
            colorPalette: safePalette,
            font: normalizeSlideFont(String(input?.font || 'Inter')),
        }
    }

    const hasRealSlides = (deck?: SlideShow | null): deck is SlideShow => {
        return Array.isArray(deck?.slides) && deck.slides.length > 0
    }

    const normalizeIncomingDeck = (deck?: SlideShow | null): SlideShow | null => {
        if (!hasRealSlides(deck)) return null
        return {
            ...deck,
            style: normalizeDeckStyle(deck.style),
        }
    }

    const [slideshow, setSlideshow] = useState<SlideShow | null>(() => normalizeIncomingDeck(initialSlideshow))
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
    const [isGenerating, setIsGenerating] = useState(false)
    const [sidebarTab, setSidebarTab] = useState<'config' | 'style'>('config')
  const [error, setError] = useState<string | null>(null)
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [isExportingGoogleSlides, setIsExportingGoogleSlides] = useState(false)
    const workflowMode = 'outline-first' as const
    const [styleBrief, setStyleBrief] = useState('')
    const [outlineDraft, setOutlineDraft] = useState('')
    const [outlineItems, setOutlineItems] = useState<SlideOutlineItem[]>([])
    const [isGeneratingOutline, setIsGeneratingOutline] = useState(false)
    const [isSyncingOutline, setIsSyncingOutline] = useState(false)
    const [selectedOutlineIndices, setSelectedOutlineIndices] = useState<number[]>([])
    const [outlineBaselineKey, setOutlineBaselineKey] = useState('')
    const [outlineBaselineItems, setOutlineBaselineItems] = useState<SlideOutlineItem[]>([])
    const [lastSyncedIndices, setLastSyncedIndices] = useState<number[]>([])
    const [syncPulseVersion, setSyncPulseVersion] = useState(0)
    const [wizardStep, setWizardStep] = useState<1 | 2>(1)
    const [isPresenterMode, setIsPresenterMode] = useState(false)
    const [showPresentationText, setShowPresentationText] = useState(false)
    const presenterModeRef = useRef<HTMLDivElement>(null)
    const selectedSlidePreviewRef = useRef<HTMLDivElement>(null)
    const thumbnailPreviewRef = useRef<HTMLDivElement>(null)
    const thumbnailStripRef = useRef<HTMLDivElement>(null)
    const isDraggingThumbnailsRef = useRef(false)
    const thumbnailDragStartXRef = useRef(0)
    const thumbnailDragStartScrollLeftRef = useRef(0)
    const thumbnailDragMovedRef = useRef(false)
    const [thumbnailScaleRatio, setThumbnailScaleRatio] = useState(0.333333)
    
    // Interaction States
    const [includeQuiz, setIncludeQuiz] = useState(false)
    const [selectedQuizIds, setSelectedQuizIds] = useState<number[]>([])
    const [showQuizSelector, setShowQuizSelector] = useState(false)
    const [includeMindmap, setIncludeMindmap] = useState(false)
    
    // Configuration State
    const [pageCount, setPageCount] = useState([10])
    const [language, setLanguage] = useState<'vi' | 'en'>('vi')
    const [customColor, setCustomColor] = useState('#3b82f6')
    const [style, setStyle] = useState<NonNullable<SlideShow['style']>>(normalizeDeckStyle(initialSlideshow?.style))

    const fontOptions = SUPPORTED_SLIDE_FONTS.map((name) => ({
        name,
        class: name === 'Playfair Display' || name === 'Lora' ? 'font-serif' : name === 'Dancing Script' ? 'italic' : 'font-sans',
    }))

    const palettes = [
        ['#3b82f6', '#1d4ed8', '#1e3a8a'], // Blue
        ['#10b981', '#059669', '#064e3b'], // Green
        ['#f59e0b', '#d97706', '#78350f'], // Orange
        ['#ef4444', '#dc2626', '#7f1d1d'], // Red
        ['#8b5cf6', '#7c3aed', '#5b21b6'], // Purple
        ['#ec4899', '#db2777', '#9d174d'], // Pink
        ['#000000', '#1f2937', '#374151']  // Dark
    ]

    const categoryStylePresets: Record<NonNullable<SlideShow['style']>['category'], { colorPalette: string[] }> = {
        academic: {
            colorPalette: ['#4F46E5', '#3B82F6', '#1E3A8A'],
        },
        business: {
            colorPalette: ['#0EA5E9', '#38BDF8', '#1D4ED8'],
        },
        creative: {
            colorPalette: ['#EC4899', '#8B5CF6', '#F97316'],
        },
        children: {
            colorPalette: ['#22C55E', '#F59E0B', '#38BDF8'],
        },
    }

    const applyCategoryPreset = (category: NonNullable<SlideShow['style']>['category']) => {
        const preset = categoryStylePresets[category]
        const nextStyle = normalizeDeckStyle({
            category,
            colorPalette: preset.colorPalette,
            font: style.font,
        })
        setStyle(nextStyle)
        setCustomColor(nextStyle.colorPalette[0])
    }

    const imageDataCacheRef = useRef<Map<string, string>>(new Map())
    const lastItemIdRef = useRef<string>(String(itemId || ''))
    const [mindmapImage, setMindmapImage] = useState<string | null>(null)
    const [deckSyncStatus, setDeckSyncStatus] = useState<'idle' | 'syncing' | 'cloud' | 'cache'>('idle')
    const [deckSyncMessage, setDeckSyncMessage] = useState<string | null>(null)
    const [deckLastSavedAt, setDeckLastSavedAt] = useState<string | null>(null)
    const [timeTick, setTimeTick] = useState(() => Date.now())

    const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
        const key = String(url || '').trim()
        if (!key) return null
        if (key.startsWith('data:image/')) return key
        const cached = imageDataCacheRef.current.get(key)
        if (cached) return cached
        try {
            const res = await fetch(key, { method: 'GET' })
            if (!res.ok) return null
            const blob = await res.blob()
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onerror = () => reject(new Error('FileReader error'))
                reader.onload = () => resolve(String(reader.result || ''))
                reader.readAsDataURL(blob)
            })
            if (dataUrl) imageDataCacheRef.current.set(key, dataUrl)
            return dataUrl || null
        } catch {
            return null
        }
    }
    const isMindmapSlideLike = (slide: Slide | null | undefined) => {
        if (!slide) return false
        const slideTitle = String(slide.title || '').toLowerCase()
        return slide.id === 'slide-mindmap' || slideTitle.includes('mindmap') || slideTitle.includes('sơ đồ') || slideTitle.includes('tư duy')
    }

    useEffect(() => {
        if (hasRealSlides(slideshow)) return
        let cancelled = false
        void (async () => {
            const restored = await loadPersistedSlideDeck(itemId)
            const normalizedRestored = normalizeIncomingDeck(restored.slideshow)
            if (cancelled || !normalizedRestored) return
            setStyle(normalizeDeckStyle(normalizedRestored.style))
            setSlideshow(normalizedRestored)
            setWizardStep(2)
            if (restored.mindmapImage) {
                setMindmapImage(restored.mindmapImage)
            }
            setDeckLastSavedAt(restored.updatedAt)
            setCurrentSlideIndex(0)
        })()
        return () => {
            cancelled = true
        }
    }, [itemId, slideshow])

    useEffect(() => {
        const safeItemId = String(itemId || '')
        const itemChanged = lastItemIdRef.current !== safeItemId
        lastItemIdRef.current = safeItemId

        const normalizedIncoming = normalizeIncomingDeck(initialSlideshow)

        if (itemChanged) {
            setSlideshow(normalizedIncoming)
            setStyle(normalizeDeckStyle(initialSlideshow?.style))
            setWizardStep(normalizedIncoming?.slides?.length ? 2 : 1)
            setCurrentSlideIndex(0)
            return
        }

        if (!normalizedIncoming?.slides?.length) return
        if (hasRealSlides(slideshow)) return

        setSlideshow(normalizedIncoming)
        setStyle(normalizeDeckStyle(normalizedIncoming.style))
        setWizardStep(normalizedIncoming.slides?.length ? 2 : 1)
        setCurrentSlideIndex(0)
    }, [initialSlideshow, itemId, slideshow])

    useEffect(() => {
        if (!isActive || !itemId) return
        let cancelled = false
        void (async () => {
            const restored = await loadPersistedSlideDeck(itemId)
            if (cancelled) return

            const normalizedDeck = normalizeIncomingDeck(restored.slideshow)
            if (normalizedDeck) {
                setSlideshow(normalizedDeck)
                setStyle(normalizeDeckStyle(normalizedDeck.style))
                setWizardStep(2)
                setCurrentSlideIndex((prev) => Math.min(prev, Math.max(0, normalizedDeck.slides.length - 1)))
            }

            if (restored.mindmapImage) {
                setMindmapImage(restored.mindmapImage)
            }

            if (restored.updatedAt) {
                setDeckLastSavedAt(restored.updatedAt)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [isActive, itemId])

    useEffect(() => {
        const normalizedStyle = normalizeDeckStyle(style)
        if (
            normalizedStyle.category !== style.category ||
            normalizedStyle.font !== style.font ||
            JSON.stringify(normalizedStyle.colorPalette) !== JSON.stringify(style.colorPalette)
        ) {
            setStyle(normalizedStyle)
            return
        }
        if (!slideshow) return
        if (
            slideshow.style &&
            slideshow.style.category === normalizedStyle.category &&
            slideshow.style.font === normalizedStyle.font &&
            JSON.stringify(slideshow.style.colorPalette) === JSON.stringify(normalizedStyle.colorPalette)
        ) {
            return
        }
        setSlideshow((prev) => (prev ? { ...prev, style: normalizedStyle } : prev))
    }, [style, slideshow])

    useEffect(() => {
        const primary = style.colorPalette?.[0]
        if (primary && primary !== customColor) {
            setCustomColor(primary)
        }
    }, [style.colorPalette, customColor])

    useEffect(() => {
        const timer = window.setInterval(() => setTimeTick(Date.now()), 60000)
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        if (!hasRealSlides(slideshow)) return
        let cancelled = false
        setDeckSyncStatus('syncing')
        void savePersistedSlideDeck(slideshow, itemId).then((result) => {
            if (cancelled) return
            setDeckSyncStatus(result.status)
            setDeckSyncMessage(result.message || (result.status === 'cloud' ? 'Deck slide đã lưu lên cloud.' : 'Deck slide đang ở cache cục bộ.'))
            setDeckLastSavedAt(result.savedAt || new Date().toISOString())
            if (result.message) {
                setError(result.message)
            }
        }).catch(() => {
            if (cancelled) return
            setDeckSyncStatus('cache')
            setDeckSyncMessage('Không thể đồng bộ deck slide lên Supabase. Đang giữ bản cache cục bộ.')
            setDeckLastSavedAt(new Date().toISOString())
            setError('Không thể đồng bộ deck slide lên Supabase. Đang giữ bản cache cục bộ.')
        })
        return () => {
            cancelled = true
        }
    }, [slideshow, itemId])

    useEffect(() => {
        let cancelled = false
        void (async () => {
            const nextMindmapImage = await loadMindmapSlideImage(itemId)
            if (!cancelled) {
                setMindmapImage(nextMindmapImage)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [itemId, mindmap])

    useEffect(() => {
        const syncMindmapImage = () => {
            void loadMindmapSlideImage(itemId).then((value) => {
                setMindmapImage(value)
            })
        }
//
        const handleCustomUpdate = (event: Event) => {
            const detail = (event as CustomEvent<{ itemId?: string; dataUrl?: string }>).detail
            if (!detail) {
                syncMindmapImage()
                return
            }
            const safeItemId = String(itemId || 'default')
            const eventItemId = String(detail.itemId || 'default')
            if (eventItemId === safeItemId) {
                const nextImage = String(detail.dataUrl || '').trim()
                if (nextImage) {
                    setMindmapImage(nextImage)
                } else {
                    void loadMindmapSlideImage(itemId).then((value) => setMindmapImage(value))
                }
            }
        }

        window.addEventListener('storage', syncMindmapImage)
        window.addEventListener(MINDMAP_SLIDE_IMAGE_EVENT, handleCustomUpdate as EventListener)
        return () => {
            window.removeEventListener('storage', syncMindmapImage)
            window.removeEventListener(MINDMAP_SLIDE_IMAGE_EVENT, handleCustomUpdate as EventListener)
        }
    }, [itemId])

    // Prepare Mindmap Data (Simplified for thumbnail)
    const formattedMindmap = useMemo(() => {
        if (!mindmap) return null
        const formatNode = (node: any, path: string, index: number): any => {
            // Use path + index to guarantee uniqueness — labels can repeat across the tree
            const uniqueId = `${path}/${index}`
            return {
                id: uniqueId,
                label: node.name || node.title || node.label || 'Concept',
                children: (node.children || []).map((child: any, i: number) =>
                    formatNode(child, uniqueId, i)
                )
            }
        }
        return formatNode(mindmap, 'root', 0)
    }, [mindmap])

    const toggleQuizSelection = (id: number) => {
        setSelectedQuizIds(prev => {
            if (prev.includes(id)) return prev.filter(i => i !== id)
            if (prev.length >= 3) return prev
            return [...prev, id]
        })
    }

    useEffect(() => {
        if (selectedQuizIds.length <= 3) return
        setSelectedQuizIds(prev => prev.slice(0, 3))
    }, [selectedQuizIds])

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf': return <FileText className="w-4 h-4 text-blue-500" />
            case 'youtube': return <Youtube className="w-4 h-4 text-red-500" />
            case 'audio': return <Music className="w-4 h-4 text-purple-500" />
            case 'video': return <Video className="w-4 h-4 text-orange-500" />
            default: return <FileText className="w-4 h-4 text-primary" />
        }
    }

    const buildOutlineTemplate = (count: number) => {
        const sections = [
            'Mở đầu: bối cảnh + mục tiêu',
            'Vấn đề hiện tại',
            'Phân tích nguyên nhân cốt lõi',
            'Giải pháp đề xuất',
            'Lộ trình triển khai',
            'Nguồn lực và rủi ro',
            'KPI đo lường',
            'Kết luận và hành động tiếp theo'
        ]
        return Array.from({ length: count }, (_, i) => `${i + 1}. ${sections[i] || `Nội dung chính ${i + 1}`}`).join('\n')
    }

    const fillOutlineTemplate = () => {
        setOutlineDraft(buildOutlineTemplate(pageCount[0]))
    }

    const toOutlineKey = (items: SlideOutlineItem[]) =>
        JSON.stringify(
            items.map((item) => ({
                index: item.index,
                title: item.title.trim(),
                intent: item.intent.trim(),
            }))
        )

    const cloneOutline = (items: SlideOutlineItem[]) =>
        items.map((item) => ({ ...item }))

    useEffect(() => {
        if (!outlineDraft.trim()) {
            setOutlineDraft(buildOutlineTemplate(pageCount[0]))
        }
    }, [pageCount, outlineDraft])

    useEffect(() => {
        if (!syncPulseVersion) return
        const timer = setTimeout(() => setLastSyncedIndices([]), 3200)
        return () => clearTimeout(timer)
    }, [syncPulseVersion])

    // Presenter Mode keyboard handling
    useEffect(() => {
        if (!isPresenterMode || !slideshow) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsPresenterMode(false)
            } else if (e.key === 'ArrowLeft') {
                setCurrentSlideIndex(prev => Math.max(0, prev - 1))
            } else if (e.key === 'ArrowRight') {
                setCurrentSlideIndex(prev => Math.min((slideshow?.slides.length || 1) - 1, prev + 1))
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isPresenterMode, slideshow, setIsPresenterMode, setCurrentSlideIndex])

    // Auto-enable includeMindmap if mindmap exists
    useEffect(() => {
        if (mindmap) {
            setIncludeMindmap(true)
        }
    }, [mindmap])

    // Auto-enable includeQuiz if quiz exists
    useEffect(() => {
        if (quiz && quiz.length > 0) {
            setIncludeQuiz(true)
        }
    }, [quiz])

    const handleGenerateOutline = async () => {
        if (!itemId) {
            setError('Bạn cần chọn tài liệu trước khi tạo outline.')
            return
        }

        setError(null)
        setIsGeneratingOutline(true)
        try {
            const outline = await generateSlideOutlineWithAi({
                itemId,
                pageCount: pageCount[0],
                language,
                additionalInstructions: buildSlidesDirectives({
                    includeOutlineDraft: true,
                    includeReviewedOutline: false,
                }) || null,
            })
            setOutlineItems(outline)
            setSelectedOutlineIndices(outline.map((item) => item.index))
            setOutlineBaselineKey(toOutlineKey(outline))
            setOutlineBaselineItems(cloneOutline(outline))
            setLastSyncedIndices([])
            if (outline.length > 0) setWizardStep(2)
        } catch (e: any) {
            setError(e?.message || 'Không thể sinh outline.')
        } finally {
            setIsGeneratingOutline(false)
        }
    }

    const outlineCurrentKey = useMemo(() => toOutlineKey(outlineItems), [outlineItems])
    const outlineChanged = outlineItems.length > 0 && outlineBaselineKey !== '' && outlineCurrentKey !== outlineBaselineKey
    const changedOutlineIndices = useMemo(() => {
        if (!outlineBaselineItems.length) return []
        const baselineMap = new Map(outlineBaselineItems.map((item) => [item.index, item]))
        return outlineItems
            .filter((item) => {
                const base = baselineMap.get(item.index)
                if (!base) return true
                return base.title.trim() !== item.title.trim() || base.intent.trim() !== item.intent.trim()
            })
            .map((item) => item.index)
    }, [outlineItems, outlineBaselineItems])

    const toggleOutlineSelection = (index: number) => {
        setSelectedOutlineIndices((prev) =>
            prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
        )
    }

    const reviewedOutlineText = (items: SlideOutlineItem[]) =>
        items
            .map((item) => `${item.index}. ${item.title}${item.intent ? ` — ${item.intent}` : ''}`)
            .join('\n')

    const buildSlidesDirectives = (options?: {
        includeOutlineDraft?: boolean
        includeReviewedOutline?: boolean
        targetSlideIndices?: number[]
    }) => {
        const directives: string[] = [
            'WORKFLOW_MODE: outline-first. Hệ thống bắt buộc dùng outline cho mọi lần tạo slide.',
        ]
        if (additionalInstructions.trim()) {
            directives.push(`USER_ADDITIONAL_REQUIREMENTS:\n${additionalInstructions.trim()}`)
        }
        if (styleBrief.trim()) {
            directives.push(`STYLE_BRIEF_FROM_USER:\n${styleBrief.trim()}`)
        }
        if (options?.includeOutlineDraft !== false && outlineDraft.trim()) {
            directives.push(`OUTLINE_DRAFT (BẮT BUỘC PHẢI BÁM SÁT):\n${outlineDraft.trim()}`)
        }
        if (options?.includeReviewedOutline !== false && outlineItems.length > 0) {
            directives.push(`REVIEWED_OUTLINE (ƯU TIÊN CAO NHẤT):\n${reviewedOutlineText(outlineItems)}`)
        }
        if (options?.targetSlideIndices?.length) {
            directives.push(`TARGET_SLIDES_TO_REGENERATE: ${options.targetSlideIndices.join(', ')}`)
        }
        return directives.join('\n\n')
    }

    const handleSyncOutlineSelected = async () => {
        if (!itemId) {
            setError('Bạn cần chọn tài liệu trước.')
            return
        }
        if (!slideshow) {
            setError('Cần có deck hiện tại trước khi sync lại outline.')
            return
        }
        if (selectedOutlineIndices.length === 0) {
            setError('Hãy chọn ít nhất 1 slide để sync.')
            return
        }

        setIsSyncingOutline(true)
        setError(null)
        try {
            const selectedSet = new Set(selectedOutlineIndices)
            const syncInstructions = [
                buildSlidesDirectives({
                    includeOutlineDraft: true,
                    includeReviewedOutline: true,
                    targetSlideIndices: selectedOutlineIndices,
                }),
                'Chỉ tập trung cập nhật nội dung cho các slide mục tiêu theo outline mới. Giữ giọng điệu, ngôn ngữ và thẩm mỹ nhất quán toàn bộ deck.',
            ].filter(Boolean).join('\n\n')

            const result = await generateSlidesWithAi({
                itemId,
                pageCount: slideshow.slides.length,
                language,
                additionalInstructions: syncInstructions,
                includeQuiz,
                selectedQuizIds: includeQuiz && selectedQuizIds.length > 0
                    ? selectedQuizIds.slice(0, 3).map((idx) => String(quiz?.[idx]?.id ?? idx))
                    : [],
                includeMindmap,
                mindmapData: mindmap,
                quizData: quiz,
                style: normalizeDeckStyle(style),
            })

            let mergedSlides = [...slideshow.slides]
            if (result.slides.length >= slideshow.slides.length) {
                mergedSlides = mergedSlides.map((slide, idx) => (
                    selectedSet.has(idx + 1) ? (result.slides[idx] || slide) : slide
                ))
            } else if (result.slides.length === selectedOutlineIndices.length) {
                const partialMap = new Map<number, Slide>()
                selectedOutlineIndices.forEach((idx, i) => {
                    const candidate = result.slides[i]
                    if (candidate) partialMap.set(idx, candidate)
                })
                mergedSlides = mergedSlides.map((slide, idx) => partialMap.get(idx + 1) || slide)
            }

            setSlideshow({
                ...slideshow,
                title: result.title || slideshow.title,
                style: normalizeDeckStyle(style),
                slides: mergedSlides,
            })
            setOutlineBaselineKey(outlineCurrentKey)
            setOutlineBaselineItems(cloneOutline(outlineItems))
            setLastSyncedIndices([...selectedOutlineIndices])
            setSyncPulseVersion((v) => v + 1)
            setWizardStep(2)
        } catch (e: any) {
            setError(e?.message || 'Không thể sync outline.')
        } finally {
            setIsSyncingOutline(false)
        }
    }

  const handleGenerate = async () => {
    if (!itemId) {
      setError('Bạn cần chọn tài liệu trước khi tạo slide.')
      return
    }

    if (outlineItems.length === 0) {
      setError('Hãy bấm "Sinh Outline AI" và duyệt outline trước khi tạo slide.')
      return
    }
    if (wizardStep === 1) {
      setError('Bạn đang ở Bước 1. Hãy chuyển sang Bước 2 để tạo slide.')
      return
    }

    setIsGenerating(true)
    setError(null)
    try {
      const selectedQuizIdsStr =
        includeQuiz && selectedQuizIds.length > 0
          ? selectedQuizIds.slice(0, 3).map((idx) => String(quiz?.[idx]?.id ?? idx))
          : []

      const mergedInstructions = buildSlidesDirectives({
        includeOutlineDraft: true,
        includeReviewedOutline: true,
      })

      const result = await generateSlidesWithAi({
        itemId,
        pageCount: pageCount[0],
        language,
        additionalInstructions: mergedInstructions || null,
        includeQuiz,
        selectedQuizIds: selectedQuizIdsStr,
        includeMindmap,
        mindmapData: mindmap,
        quizData: quiz,
        style: normalizeDeckStyle(style),
      })

      setSlideshow({
        ...result,
        style: normalizeDeckStyle(style),
      })
      setCurrentSlideIndex(0)
      if (outlineItems.length > 0) {
        setOutlineBaselineKey(outlineCurrentKey)
        setOutlineBaselineItems(cloneOutline(outlineItems))
        setLastSyncedIndices([])
      }
    } catch (e: any) {
      setError(e?.message || 'Không thể tạo slide. Vui lòng thử lại.')
    } finally {
      setIsGenerating(false)
    }
  }

    const buildPptxPresentation = async (options?: { rasterizeDecorForGoogleSlides?: boolean }) => {
        if (!slideshow) return null

        const pres = new pptxgen()
        pres.title = slideshow.title
        pres.defineLayout({ name: 'NEXUS_WIDE', width: SLIDE_W_IN, height: SLIDE_H_IN })
        pres.layout = 'NEXUS_WIDE'

        const exportedSlides = slideshow.slides.map((slide) => localizeSpecialSlide(slide))
        const slideCount = exportedSlides.length
        const resolvedStyle: NonNullable<SlideShow['style']> = normalizeDeckStyle(style)

        const opacityToTransparency = (opacity?: number) => {
            const safeOpacity = typeof opacity === 'number' ? Math.max(0, Math.min(1, opacity)) : 1
            return Math.round((1 - safeOpacity) * 100)
        }

        const renderDecorLayerAsPng = async (template: ReturnType<typeof buildSlideTemplate>) => {
            const widthPx = 1600
            const heightPx = Math.round((widthPx * SLIDE_H_IN) / SLIDE_W_IN)
            const svgParts: string[] = [
                `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${SLIDE_W_IN} ${SLIDE_H_IN}">`,
                `<rect x="0" y="0" width="${SLIDE_W_IN}" height="${SLIDE_H_IN}" fill="#${template.background}" />`,
            ]

            for (let index = 0; index < template.elements.length; index++) {
                const el = template.elements[index]
                if (el.kind !== 'shape') continue

                const fillOpacity = typeof el.fillOpacity === 'number' ? Math.max(0, Math.min(1, el.fillOpacity)) : 1
                const strokeOpacity = typeof el.strokeOpacity === 'number' ? Math.max(0, Math.min(1, el.strokeOpacity)) : 1
                const strokeColor = el.stroke ? `#${el.stroke}` : 'none'
                const strokeWidth =
                    el.stroke && (el.role === 'panel-main' || el.role === 'image-frame')
                        ? Math.max(0.01, 1 / 96)
                        : 0

                if (el.shape === 'ellipse') {
                    svgParts.push(
                        `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="#${el.fill}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}" />`
                    )
                    continue
                }

                const radius = Math.max(0, el.shape === 'roundRect' ? el.radius ?? 0.18 : 0)
                svgParts.push(
                    `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${radius}" ry="${radius}" fill="#${el.fill}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}" />`
                )
            }

            svgParts.push('</svg>')

            const svgMarkup = svgParts.join('')
            const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`

            const pngDataUrl = await new Promise<string>((resolve, reject) => {
                const image = new Image()
                image.onload = () => {
                    const canvas = document.createElement('canvas')
                    canvas.width = widthPx
                    canvas.height = heightPx
                    const context = canvas.getContext('2d')
                    if (!context) {
                        reject(new Error('Không tạo được canvas context để render Google Slides.'))
                        return
                    }
                    context.drawImage(image, 0, 0, widthPx, heightPx)
                    resolve(canvas.toDataURL('image/png'))
                }
                image.onerror = () => reject(new Error('Không render được nền slide sang ảnh PNG.'))
                image.src = svgDataUrl
            })

            return pngDataUrl
        }

        const applyShape = (pptSlide: any, el: Extract<TemplateElement, { kind: 'shape' }>) => {
            const fillTransparency = opacityToTransparency(el.fillOpacity)
            const lineTransparency = el.stroke ? opacityToTransparency(el.strokeOpacity) : 100
            const fill = { color: el.fill, transparency: fillTransparency }
            const line = el.stroke
                ? {
                    color: el.stroke,
                    transparency: lineTransparency,
                    width: el.role === 'panel-main' || el.role === 'image-frame' ? 1 : undefined,
                }
                : undefined
            const shapeType =
                el.shape === 'ellipse'
                    ? pres.ShapeType.ellipse
                    : el.shape === 'roundRect'
                        ? pres.ShapeType.roundRect
                        : pres.ShapeType.rect
            pptSlide.addShape(shapeType, {
                x: el.x,
                y: el.y,
                w: el.w,
                h: el.h,
                fill,
                line,
                radius: el.radius,
            })
        }

        const applyText = (pptSlide: any, el: Extract<TemplateElement, { kind: 'text' }>) => {
            pptSlide.addText(el.text, {
                x: el.x,
                y: el.y,
                w: el.w,
                h: el.h,
                fontFace: el.fontFace,
                fontSize: el.fontSize,
                bold: el.bold,
                italic: el.italic,
                color: el.color,
                align: el.align,
                valign: el.valign,
                letterSpacing: el.letterSpacing,
                breakLine: false,
                margin: 0,
                paraSpaceAfterPt: 0,
            } as any)
        }

        const applyImage = async (pptSlide: any, el: Extract<TemplateElement, { kind: 'image' }>) => {
            const data = await fetchImageAsDataUrl(el.src)
            if (!data) return
            pptSlide.addImage({
                data,
                x: el.x,
                y: el.y,
                w: el.w,
                h: el.h,
            })
        }

        for (let slideIndex = 0; slideIndex < exportedSlides.length; slideIndex++) {
            const slide = exportedSlides[slideIndex]
            const pptSlide = pres.addSlide()
            const template = buildSlideTemplate({
                slide,
                slideIndex,
                slideCount,
                slideshowTitle: slideshow.title || 'Deck',
                style: resolvedStyle,
            })
            if (options?.rasterizeDecorForGoogleSlides) {
                const decorDataUrl = await renderDecorLayerAsPng(template)
                pptSlide.addImage({
                    data: decorDataUrl,
                    x: 0,
                    y: 0,
                    w: SLIDE_W_IN,
                    h: SLIDE_H_IN,
                })
            } else {
                pptSlide.background = { color: template.background }
            }

            for (const el of template.elements) {
                if (el.kind === 'shape') {
                    if (!options?.rasterizeDecorForGoogleSlides) applyShape(pptSlide, el)
                } else if (el.kind === 'text') {
                    applyText(pptSlide, el)
                } else {
                    await applyImage(pptSlide, el)
                }
            }
        }

        return pres
    }

    const exportAsPPTX = async () => {
        const pres = await buildPptxPresentation()
        if (!pres || !slideshow) return
        pres.writeFile({ fileName: `${slideshow.title || 'Document'}.pptx` })
    }

    const exportAsTXT = () => {
        if (!slideshow) return
        const exportedSlides = displaySlides
        
        let txtContent = `${slideshow.title}\n${'='.repeat(slideshow.title.length)}\n\n`

        exportedSlides.forEach((slide, index) => {
            txtContent += `\n${index + 1}. ${slide.title}\n${'-'.repeat(slide.title.length + 3)}\n`
            
            if (slide.subtitle) {
                txtContent += `${slide.subtitle}\n`
            }
            
            if (slide.bullets && slide.bullets.length > 0) {
                slide.bullets.forEach(bullet => {
                    txtContent += `• ${bullet}\n`
                })
            }
            
            if (slide.leftBullets && slide.leftBullets.length > 0) {
                txtContent += `\n${slide.leftTitle || 'Bên trái'}:\n`
                slide.leftBullets.forEach(bullet => {
                    txtContent += `• ${bullet}\n`
                })
            }
            
            if (slide.rightBullets && slide.rightBullets.length > 0) {
                txtContent += `\n${slide.rightTitle || 'Bên phải'}:\n`
                slide.rightBullets.forEach(bullet => {
                    txtContent += `• ${bullet}\n`
                })
            }
            
            if (slide.quote) {
                txtContent += `\n"${slide.quote}"\n`
            }
            
            if (slide.content && !slide.bullets && !slide.leftBullets && !slide.rightBullets) {
                txtContent += `${slide.content}\n`
            }
            
            txtContent += '\n'
        })
        
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${slideshow.title || 'Document'}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }


    const exportToGoogleSlides = async () => {
        if (!slideshow) return
        setError(null)
        setIsExportingGoogleSlides(true)

        try {
            const parseGoogleApiError = async (response: Response) => {
                const rawText = await response.text()
                const trimmed = rawText.trim()
                try {
                    const parsed = JSON.parse(trimmed) as any
                    const err = parsed?.error
                    const message = String(err?.message || trimmed || `HTTP ${response.status}`)
                    const details = Array.isArray(err?.details) ? err.details : []
                    const errorInfo = details.find((d: any) => String(d?.['@type'] || '').includes('google.rpc.ErrorInfo'))
                    const activationUrlRaw = errorInfo?.metadata?.activationUrl
                    const activationUrl = activationUrlRaw
                        ? String(activationUrlRaw).trim().replace(/^`|`$/g, '').trim()
                        : null
                    const reason = errorInfo?.reason ? String(errorInfo.reason) : null
                    const status = err?.status ? String(err.status) : null
                    return { message, activationUrl, reason, status, rawText: trimmed }
                } catch {
                    return { message: trimmed || `HTTP ${response.status}`, activationUrl: null, reason: null, status: null, rawText: trimmed }
                }
            }

            const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim()
            if (!clientId) {
                throw new Error('Thiếu NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID trong myApp/.env.local')
            }

            const loadScript = (src: string) =>
                new Promise<void>((resolve, reject) => {
                    const existing = document.querySelector(`script[src="${src}"]`)
                    if (existing) return resolve()
                    const script = document.createElement('script')
                    script.src = src
                    script.async = true
                    script.onload = () => resolve()
                    script.onerror = () => reject(new Error('Không tải được Google Identity script'))
                    document.head.appendChild(script)
                })

            await loadScript('https://accounts.google.com/gsi/client')

            const token = await new Promise<string>((resolve, reject) => {
                const googleObj = (window as any).google
                if (!googleObj?.accounts?.oauth2?.initTokenClient) {
                    reject(new Error('Google Identity chưa sẵn sàng'))
                    return
                }
                const tokenClient = googleObj.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file',
                    callback: (resp: any) => {
                        if (resp?.access_token) resolve(String(resp.access_token))
                        else reject(new Error(resp?.error_description || resp?.error || 'Không lấy được access token'))
                    },
                })
                tokenClient.requestAccessToken({ prompt: 'consent' })
            })

            const pres = await buildPptxPresentation({ rasterizeDecorForGoogleSlides: true })
            if (!pres) throw new Error('Không tạo được file PPTX để chuyển đổi sang Google Slides.')

            const pptxBlob: Blob = await (async () => {
                const writer = (pres as any).write
                if (typeof writer === 'function') {
                    const blobCandidate = await writer.call(pres, 'blob')
                    if (blobCandidate instanceof Blob) return blobCandidate
                }
                throw new Error('PPTX export không hỗ trợ blob trên môi trường này.')
            })()

            const boundary = `nexus_${Math.random().toString(36).slice(2)}`
            const metadata = {
                name: slideshow.title || 'Slides',
                mimeType: 'application/vnd.google-apps.presentation',
            }
            const body = new Blob(
                [
                    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
                    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`,
                    pptxBlob,
                    `\r\n--${boundary}--`,
                ],
                { type: `multipart/related; boundary=${boundary}` }
            )

            const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                },
                body,
            })
            if (!uploadRes.ok) {
                const parsedError = await parseGoogleApiError(uploadRes)
                if (parsedError.status === 'PERMISSION_DENIED' && parsedError.reason === 'SERVICE_DISABLED') {
                    const url = parsedError.activationUrl
                    throw new Error(
                        [
                            'Google Drive API đang bị tắt hoặc chưa từng bật cho project này.',
                            url ? `Mở link này để bật API: ${url}` : 'Hãy vào Google Cloud Console và bật Google Drive API.',
                            'Nếu vừa bật xong, chờ 2–5 phút để Google đồng bộ rồi thử lại.',
                        ].join('\n')
                    )
                }
                throw new Error(parsedError.message || `HTTP ${uploadRes.status}`)
            }
            const uploaded = (await uploadRes.json()) as { id?: string }
            if (!uploaded.id) throw new Error('Không lấy được fileId sau khi upload sang Google Drive.')

            window.open(`https://docs.google.com/presentation/d/${uploaded.id}/edit`, '_blank', 'noopener,noreferrer')
        } catch (e: any) {
            const raw = String(e?.message || '')
            const lowered = raw.toLowerCase()

            if (
                lowered.includes('access_denied') ||
                lowered.includes('has not completed the google verification process') ||
                lowered.includes('app is currently being tested')
            ) {
                setError(
                    [
                        'Google đang chặn OAuth vì app chưa được verify / đang ở chế độ Testing.',
                        'Cách xử lý nhanh:',
                        '- Google Cloud Console → APIs & Services → Library: bật Google Slides API + Google Drive API.',
                        '- Google Cloud Console → OAuth consent screen → Publishing status: để Testing (hoặc In production) đúng mục đích.',
                        '- Google Cloud Console → OAuth consent screen → Test users → thêm email đang đăng nhập.',
                        '- Google Cloud Console → Credentials → OAuth client (Web) → Authorized JavaScript origins: thêm http://localhost:3000.',
                        '- Hoặc Publish app (Production) và gửi verification nếu cần.',
                        '- Đảm bảo OAuth consent screen đã khai báo scopes: presentations + drive.file.',
                    ].join('\n')
                )
                return
            }

            if (lowered.includes('redirect_uri_mismatch')) {
                setError(
                    [
                        'Google OAuth bị lỗi redirect_uri_mismatch.',
                        'Hãy kiểm tra OAuth Client (Web):',
                        '- Authorized JavaScript origins có http://localhost:3000',
                        '- (Nếu dùng redirect-based flow) Authorized redirect URIs đúng môi trường.',
                    ].join('\n')
                )
                return
            }

            if (lowered.includes('popup') || lowered.includes('blocked')) {
                setError('Trình duyệt đang chặn pop-up. Hãy cho phép pop-up cho localhost rồi thử lại.')
                return
            }

            setError(raw || 'Xuất sang Google Slides thất bại')
        } finally {
            setIsExportingGoogleSlides(false)
        }
    }

    const activeStyle = normalizeDeckStyle(style)
    const palette = activeStyle.colorPalette
    const accent = palette[0] || '#3b82f6'
    const accent2 = palette[1] || '#1d4ed8'
    const accent3 = palette[2] || '#1e3a8a'
    const localizedSpecialSlideCopy = language === 'en'
        ? {
            summaryTitle: 'Quick Summary',
            summarySubtitle: 'A high-level view before diving into the details',
            mindmapTitle: 'Mind Map Overview',
            mindmapSubtitle: 'Overall lesson structure',
            quizTitle: 'Review Questions',
            quizSubtitle: 'Check understanding',
            closingTitle: 'Thank You',
            closingSubtitle: 'Thank you for listening, and I am ready to discuss further.',
            missingTitle: 'Untitled Slide',
            missingText: 'No presentation text for this slide yet.',
            missingDescription: 'No descriptive content available.',
        }
        : {
            summaryTitle: 'Tổng kết nhanh',
            summarySubtitle: 'Bức tranh tổng quan trước khi vào nội dung chi tiết',
            mindmapTitle: 'Sơ đồ tư duy tổng quan',
            mindmapSubtitle: 'Tổng thể nội dung bài học',
            quizTitle: 'Câu hỏi ôn tập',
            quizSubtitle: 'Kiểm tra hiểu biết',
            closingTitle: 'Cảm ơn đã lắng nghe',
            closingSubtitle: 'Trân trọng cảm ơn và sẵn sàng trao đổi thêm.',
            missingTitle: 'Chưa có tiêu đề',
            missingText: 'Chưa có text trình bày cho slide này.',
            missingDescription: 'Chưa có nội dung mô tả.',
        }

    const localizeSpecialSlide = (slide: Slide): Slide => {
        if (!slide) return slide
        if (slide.id === 'slide-summary') {
            return {
                ...slide,
                title: localizedSpecialSlideCopy.summaryTitle,
                subtitle: localizedSpecialSlideCopy.summarySubtitle,
            }
        }
        if (slide.id === 'slide-mindmap') {
            return {
                ...slide,
                title: localizedSpecialSlideCopy.mindmapTitle,
                subtitle: undefined,
                content: undefined,
                layout: slide.layout,
                image: mindmapImage || slide.image,
                imagePrompt: undefined,
            }
        }
        if (slide.id === 'slide-quiz') {
            return {
                ...slide,
                title: localizedSpecialSlideCopy.quizTitle,
                subtitle: localizedSpecialSlideCopy.quizSubtitle,
            }
        }
        if (slide.id === 'slide-closing') {
            return {
                ...slide,
                title: localizedSpecialSlideCopy.closingTitle,
                subtitle: localizedSpecialSlideCopy.closingSubtitle,
                content: localizedSpecialSlideCopy.closingSubtitle,
            }
        }
        return slide
    }

    const displaySlides = useMemo(
        () => (slideshow?.slides || []).map((slide) => localizeSpecialSlide(slide)),
        [slideshow, language, mindmapImage]
    )

    const hasSlides = displaySlides.length > 0
    const mindmapSlideIndex = displaySlides.findIndex((slide) => isMindmapSlideLike(slide))
    const currentSlide = displaySlides[currentSlideIndex]
    const currentPresentationText = currentSlide?.speakerNotes || currentSlide?.content || localizedSpecialSlideCopy.missingText

    const isOutlineWorkflow = workflowMode === 'outline-first'
    const outlineReady = !isOutlineWorkflow || outlineItems.length > 0
    const currentSlideSynced = lastSyncedIndices.includes(currentSlideIndex + 1)

    const getDeckSyncMeta = (status: typeof deckSyncStatus) => {
        switch (status) {
            case 'syncing':
                return {
                    label: 'Đang lưu',
                    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
                    icon: <RefreshCw className="w-3 h-3 animate-spin" />,
                }
            case 'cloud':
                return {
                    label: 'Đã lưu cloud',
                    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
                    icon: <Cloud className="w-3 h-3" />,
                }
            case 'cache':
                return {
                    label: 'Chỉ cache cục bộ',
                    className: 'border-orange-500/30 bg-orange-500/10 text-orange-700',
                    icon: <CloudOff className="w-3 h-3" />,
                }
            default:
                return {
                    label: 'Chưa lưu',
                    className: 'border-muted bg-muted/40 text-muted-foreground',
                    icon: <Save className="w-3 h-3" />,
                }
        }
    }

    const formatLastSavedLabel = (value: string | null) => {
        if (!value) return 'Chưa có mốc lưu'
        const timestamp = new Date(value).getTime()
        if (!Number.isFinite(timestamp)) return 'Chưa có mốc lưu'
        const diffMinutes = Math.max(0, Math.round((timeTick - timestamp) / 60000))
        if (diffMinutes <= 0) return 'vừa xong'
        if (diffMinutes < 60) return `${diffMinutes} phút trước`
        const date = new Date(timestamp)
        const now = new Date(timeTick)
        const sameDay = date.toDateString() === now.toDateString()
        if (sameDay) {
            return `hôm nay ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
        }
        return date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const handleSaveDeckNow = async () => {
        if (!slideshow || !hasSlides) return
        setDeckSyncStatus('syncing')
        const result: SyncResult = await savePersistedSlideDeck(slideshow, itemId)
        setDeckSyncStatus(result.status)
        setDeckSyncMessage(result.message || (result.status === 'cloud' ? 'Deck slide đã lưu lên cloud.' : 'Deck slide đang ở cache cục bộ.'))
        setDeckLastSavedAt(result.savedAt || new Date().toISOString())
        if (result.message) {
            setError(result.message)
            toast.error(result.message)
            return
        }
        toast.success(result.status === 'cloud' ? 'Đã lưu deck slide lên cloud.' : 'Đã lưu deck slide vào cache cục bộ.')
    }

    const deckSyncMeta = getDeckSyncMeta(deckSyncStatus)
    const deckLastSavedLabel = formatLastSavedLabel(deckLastSavedAt)
    const slideAspectRatio = `${SLIDE_W_IN} / ${SLIDE_H_IN}`
    const thumbnailCanvasScale = Math.min(1, Math.max(0.05, thumbnailScaleRatio))
    const thumbnailCanvasSize = `${100 / thumbnailCanvasScale}%`
    const renderThumbnailContent = (slide: Slide, slideIndex: number) => (
        <SlideTemplatePreview
            slide={localizeSpecialSlide(slide)}
            slideIndex={slideIndex}
            slideCount={displaySlides.length || 1}
            slideshowTitle={slideshow?.title || 'Deck'}
            style={activeStyle}
        />
    )

    useEffect(() => {
        const selectedSlideElement = selectedSlidePreviewRef.current
        const thumbnailElement = thumbnailPreviewRef.current
        if (!selectedSlideElement || !thumbnailElement || typeof ResizeObserver === 'undefined') return

        const updateThumbnailScale = () => {
            const selectedWidth = selectedSlideElement.getBoundingClientRect().width
            const thumbnailWidth = thumbnailElement.getBoundingClientRect().width
            if (selectedWidth <= 0 || thumbnailWidth <= 0) return

            const nextScale = Math.min(1, Math.max(0.05, thumbnailWidth / selectedWidth))
            setThumbnailScaleRatio((previousScale) =>
                Math.abs(previousScale - nextScale) < 0.001 ? previousScale : nextScale
            )
        }

        updateThumbnailScale()

        const resizeObserver = new ResizeObserver(updateThumbnailScale)
        resizeObserver.observe(selectedSlideElement)
        resizeObserver.observe(thumbnailElement)

        return () => resizeObserver.disconnect()
    }, [hasSlides, currentSlideIndex, displaySlides.length])

    const handleThumbnailStripMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        const strip = thumbnailStripRef.current
        if (!strip) return

        isDraggingThumbnailsRef.current = true
        thumbnailDragMovedRef.current = false
        thumbnailDragStartXRef.current = event.clientX
        thumbnailDragStartScrollLeftRef.current = strip.scrollLeft
    }

    const handleThumbnailStripMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        const strip = thumbnailStripRef.current
        if (!strip || !isDraggingThumbnailsRef.current) return

        const deltaX = event.clientX - thumbnailDragStartXRef.current
        if (Math.abs(deltaX) > 4) {
            thumbnailDragMovedRef.current = true
        }

        strip.scrollLeft = thumbnailDragStartScrollLeftRef.current - deltaX
    }

    const stopThumbnailStripDrag = () => {
        isDraggingThumbnailsRef.current = false
    }

    const handleThumbnailClick = (index: number) => {
        if (thumbnailDragMovedRef.current) {
            thumbnailDragMovedRef.current = false
            return
        }

        setCurrentSlideIndex(index)
    }

    return (
        <div className="flex h-auto min-h-[850px] w-full flex-col gap-4 overflow-hidden rounded-[32px] border border-border/40 bg-background/40 shadow-2xl backdrop-blur-xl transition-all duration-500 2xl:h-[850px] 2xl:flex-row">
            {/* 1. Sidebar (Left) */}
            <aside className="flex w-full shrink-0 flex-col border-b border-border/50 bg-card/30 2xl:w-80 2xl:border-b-0 2xl:border-r">
                <div className="flex border-b border-border/50">
                    <button 
                        onClick={() => setSidebarTab('config')}
                        className={cn(
                            "flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all",
                            sidebarTab === 'config' ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:bg-muted/50"
                        )}
                    >
                        Cấu hình
                    </button>
                    <button 
                        onClick={() => setSidebarTab('style')}
                        className={cn(
                            "flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all",
                            sidebarTab === 'style' ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:bg-muted/50"
                        )}
                    >
                        Thẩm mỹ
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 space-y-8 2xl:max-h-none">
                    {sidebarTab === 'config' ? (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }} 
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-6"
                        >
                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-primary" /> Nguồn nội dung
                                </label>
                                {selectedFile ? (
                                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shadow-sm">
                                            {getFileIcon(selectedFile.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold truncate">{selectedFile.name}</p>
                                            <p className="text-[10px] text-muted-foreground capitalize">{selectedFile.type}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" size="sm" className="h-20 flex flex-col gap-2 rounded-xl border-dashed">
                                            <Upload className="w-5 h-5" />
                                            <span className="text-[10px]">Tải tệp</span>
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-20 flex flex-col gap-2 rounded-xl border-dashed">
                                            <LinkIcon className="w-5 h-5" />
                                            <span className="text-[10px]">Dán link</span>
                                        </Button>
                                    </div>
                                )}
                                <div className="relative">
                                    <Textarea 
                                        placeholder="Ghi rõ yêu cầu thêm cho AI, ví dụ: nhấn mạnh pain point, dùng giọng điệu thuyết trình, tránh thuật ngữ khó..." 
                                        className="min-h-[80px] text-xs bg-muted/30 border-none resize-none pr-8"
                                        value={additionalInstructions}
                                        onChange={(e) => setAdditionalInstructions(e.target.value)}
                                    />
                                    <Sparkles className="absolute bottom-2 right-2 w-3.5 h-3.5 text-primary/40" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <GitBranch className="w-4 h-4 text-primary" /> Workflow Outline
                                </label>
                                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] font-semibold text-primary">
                                    Hệ thống luôn dùng outline để sinh slide.
                                </div>
                                <Textarea
                                    placeholder="Mô tả thẩm mỹ mong muốn, ví dụ: consulting dark deck, navy glassmorphism, data-first, tối giản..."
                                    className="min-h-[72px] text-xs bg-muted/30 border-none resize-none"
                                    value={styleBrief}
                                    onChange={(e) => setStyleBrief(e.target.value)}
                                />
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Outline Draft</label>
                                        <button
                                            onClick={fillOutlineTemplate}
                                            type="button"
                                            className="text-[10px] font-semibold text-primary hover:underline"
                                        >
                                            Tạo outline mẫu
                                        </button>
                                    </div>
                                    <Textarea
                                        placeholder="1. Mở đầu ...&#10;2. Vấn đề ...&#10;3. Giải pháp ..."
                                        className="min-h-[120px] text-xs bg-muted/30 border-none resize-y"
                                        value={outlineDraft}
                                        onChange={(e) => setOutlineDraft(e.target.value)}
                                    />
                                    <Button
                                        onClick={handleGenerateOutline}
                                        type="button"
                                        variant="outline"
                                        className="h-8 rounded-lg text-[11px] font-semibold"
                                        disabled={isGeneratingOutline || !itemId}
                                    >
                                        {isGeneratingOutline ? (
                                            <>
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                                                Đang sinh outline...
                                            </>
                                        ) : (
                                            'Sinh Outline AI'
                                        )}
                                    </Button>
                                    {outlineItems.length > 0 && (
                                        <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                                            <p className="text-[11px] font-semibold text-muted-foreground">Review Outline ({outlineItems.length} slide)</p>
                                            <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                                                {outlineItems.map((item, idx) => (
                                                    <div key={idx} className="space-y-1 rounded-lg bg-background/70 p-2">
                                                        <Input
                                                            value={item.title}
                                                            onChange={(e) => {
                                                                const next = [...outlineItems]
                                                                next[idx] = { ...next[idx], title: e.target.value }
                                                                setOutlineItems(next)
                                                            }}
                                                            className="h-7 text-[11px]"
                                                        />
                                                        <Input
                                                            value={item.intent}
                                                            onChange={(e) => {
                                                                const next = [...outlineItems]
                                                                next[idx] = { ...next[idx], intent: e.target.value }
                                                                setOutlineItems(next)
                                                            }}
                                                            className="h-7 text-[10px] text-muted-foreground"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium">Số trang: {pageCount[0]}</label>
                                </div>
                                <Slider 
                                    value={pageCount} 
                                    onValueChange={setPageCount} 
                                    max={20} 
                                    min={5} 
                                    step={1} 
                                    className="py-4"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Languages className="w-4 h-4 text-primary" /> Ngôn ngữ đầu ra
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { value: 'vi', label: 'Tiếng Việt' },
                                        { value: 'en', label: 'English' },
                                    ].map((lang) => (
                                        <button 
                                            key={lang.value}
                                            onClick={() => setLanguage(lang.value as 'vi' | 'en')}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                                language === lang.value ? "bg-primary text-primary-foreground shadow-md" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                            )}
                                        >
                                            {lang.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }} 
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-8"
                        >
                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Layout className="w-4 h-4 text-primary" /> Thể loại
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['academic', 'business', 'creative', 'children'].map(cat => (
                                        <button 
                                            key={cat}
                                            onClick={() => applyCategoryPreset(cat as NonNullable<SlideShow['style']>['category'])}
                                            className={cn(
                                                "p-3 rounded-xl border text-[10px] font-medium transition-all text-center capitalize",
                                                style.category === cat ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            {cat === 'academic' ? 'Học thuật' : cat === 'business' ? 'Doanh nghiệp' : cat === 'creative' ? 'Sáng tạo' : 'Trẻ em'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Palette className="w-4 h-4 text-primary" /> Tông màu chủ đạo
                                </label>
                                <div className="flex flex-wrap gap-3">
                                    {palettes.map((palette, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => {
                                                setStyle({ ...style, colorPalette: palette })
                                                setCustomColor(palette[0])
                                            }}
                                            className={cn(
                                                "group relative flex flex-col w-10 h-10 rounded-full overflow-hidden border-2 transition-all hover:scale-105",
                                                JSON.stringify(style.colorPalette) === JSON.stringify(palette) ? "border-primary scale-110 shadow-lg ring-2 ring-primary/20" : "border-transparent"
                                            )}
                                        >
                                            {palette.map(c => <div key={c} className="flex-1 w-full" style={{ backgroundColor: c }} />)}
                                            {JSON.stringify(style.colorPalette) === JSON.stringify(palette) && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                                    <CheckIcon className="w-4 h-4 text-white drop-shadow-md" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                    
                                    <div className="relative group">
                                        <input 
                                            type="color" 
                                            value={customColor}
                                            onChange={(e) => {
                                                const color = e.target.value
                                                setCustomColor(color)
                                                setStyle({ ...style, colorPalette: [color, color, color] })
                                            }}
                                            className={cn(
                                                "w-10 h-10 rounded-full overflow-hidden border-2 cursor-pointer bg-transparent transition-all",
                                                !palettes.some(p => p[0] === customColor) ? "border-primary scale-110 shadow-lg" : "border-transparent"
                                            )}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <PaletteIcon className="w-4 h-4 text-white mix-blend-difference" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <Input 
                                        value={customColor} 
                                        onChange={(e) => {
                                            const val = e.target.value
                                            setCustomColor(val)
                                            if (/^#[0-9A-F]{6}$/i.test(val)) {
                                                setStyle({ ...style, colorPalette: [val, val, val] })
                                            }
                                        }}
                                        className="h-8 text-[10px] font-mono w-24 uppercase" 
                                        placeholder="#000000"
                                    />
                                    <span className="text-[10px] text-muted-foreground italic">Tùy chỉnh mã màu</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <FontIcon className="w-4 h-4 text-primary" /> Font chữ
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {fontOptions.map(font => (
                                        <button 
                                            key={font.name}
                                            onClick={() => setStyle({ ...style, font: font.name as any })}
                                            className={cn(
                                                "p-3 rounded-xl border text-xs font-medium transition-all text-center relative overflow-hidden group",
                                                font.class,
                                                style.font === font.name ? "border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            {font.name}
                                            {style.font === font.name && (
                                                <div className="absolute top-1 right-1">
                                                    <CheckIcon className="w-2.5 h-2.5" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                <div className="p-6 bg-gradient-to-t from-card/50 to-transparent">
                    {error && (
                        <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}
                    <Button 
                        onClick={() => {
                            if (isOutlineWorkflow && wizardStep === 1) {
                                if (!outlineReady) {
                                    setError('Bạn cần sinh outline trước khi sang bước preview.')
                                    return
                                }
                                setWizardStep(2)
                                setError(null)
                                return
                            }
                            void handleGenerate()
                        }} 
                        disabled={(isGenerating && wizardStep === 2) || !itemId}
                        className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2 font-bold"
                    >
                        {isGenerating && wizardStep === 2 ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isOutlineWorkflow && wizardStep === 1
                            ? 'Sang bước 2: Preview'
                            : slideshow
                                ? 'Tạo lại Slide'
                                : (isOutlineWorkflow ? 'Tạo deck từ outline' : 'Bắt đầu thiết kế')}
                    </Button>
                </div>
            </aside>

            {/* Main Area */}
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/5">
                {/* 4. Action Bar (Top) */}
                <header className="border-b border-border/50 bg-card/20 px-4 py-3 xl:px-6">
                    <div className="flex min-h-16 flex-col gap-3">
                        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2.5 xl:gap-3">
                                {isOutlineWorkflow ? (
                                    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/50 bg-muted/30 p-1">
                                        <button
                                            onClick={() => setWizardStep(1)}
                                            className={cn(
                                                "h-7 rounded-lg px-3 text-[11px] font-semibold transition-all",
                                                wizardStep === 1 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            B1 Outline
                                        </button>
                                        <button
                                            onClick={() => outlineReady && setWizardStep(2)}
                                            disabled={!outlineReady}
                                            className={cn(
                                                "h-7 rounded-lg px-3 text-[11px] font-semibold transition-all",
                                                wizardStep === 2 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                                                !outlineReady && "cursor-not-allowed opacity-50"
                                            )}
                                        >
                                            B2 Preview
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex h-8 shrink-0 items-center rounded-lg bg-muted p-1">
                                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md"><Layout className="h-3 w-3" /></Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md bg-background shadow-sm"><Layers className="h-3 w-3" /></Button>
                                    </div>
                                )}
                                <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-border/50 bg-background/80 px-3 text-sm font-medium text-muted-foreground whitespace-nowrap">
                                    {isOutlineWorkflow && wizardStep === 1
                                        ? `${outlineItems.length > 0 ? `Đã có ${outlineItems.length} mục outline` : 'Chưa có outline'}`
                                        : (hasSlides ? `${currentSlideIndex + 1} / ${displaySlides.length}` : 'Chưa có slide')}
                                </span>
                            </div>

                            <div className="flex min-w-0 flex-wrap items-center gap-2 2xl:justify-end">
                                {isOutlineWorkflow && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 rounded-full gap-2 text-xs font-semibold"
                                        onClick={handleSyncOutlineSelected}
                                        disabled={!hasSlides || selectedOutlineIndices.length === 0 || !outlineChanged || isSyncingOutline}
                                    >
                                        {isSyncingOutline ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                        Sync {selectedOutlineIndices.length > 0 ? `(${selectedOutlineIndices.length})` : ''} outline
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-full gap-2 text-xs font-semibold"
                                    disabled={!hasSlides || deckSyncStatus === 'syncing'}
                                    onClick={() => void handleSaveDeckNow()}
                                    title={deckSyncMessage || undefined}
                                >
                                    {deckSyncStatus === 'syncing' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    Lưu ngay
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-full gap-2 text-xs font-semibold"
                                    disabled={!hasSlides}
                                    onClick={() => setShowPresentationText(true)}
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    Text trình bày
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-9 min-w-[220px] rounded-full gap-2 px-4 text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-700 text-white border-none shadow-lg transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-blue-500/30 xl:px-5 xl:text-sm"
                                    disabled={!hasSlides || isExportingGoogleSlides}
                                    onClick={exportToGoogleSlides}
                                >
                                    {isExportingGoogleSlides ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <FileDown className="h-4 w-4" />
                                    )}{' '}
                                    Xuất sang Trang trình bày
                                </Button>
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn('shrink-0 gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border whitespace-nowrap', deckSyncMeta.className)}>
                                {deckSyncMeta.icon}
                                {deckSyncMeta.label}
                            </Badge>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground whitespace-nowrap">
                                <Clock3 className="h-3.5 w-3.5" />
                                Lưu gần nhất: {deckLastSavedLabel}
                            </span>
                            {isOutlineWorkflow && outlineChanged && (
                                <span className="shrink-0 rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700 whitespace-nowrap">
                                    outline changed ({changedOutlineIndices.length})
                                </span>
                            )}
                        </div>
                    </div>
                </header>

                {/* 2. Preview Area (Center) */}
                <div className="relative flex flex-1 items-center justify-center p-3 sm:p-5 lg:p-8 group">
                    {isSyncingOutline && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                            <div className="rounded-2xl border border-border/50 bg-card px-5 py-3 text-sm font-semibold shadow-xl flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                Đang sync lại các slide đã chọn...
                            </div>
                        </div>
                    )}
                    <AnimatePresence mode="wait">
                        {isOutlineWorkflow && wizardStep === 1 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="w-full max-w-4xl rounded-3xl border border-border/50 bg-card/40 p-4 sm:p-5 lg:p-6 space-y-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-bold">Bước 1: Duyệt Outline</h3>
                                        <p className="text-xs text-muted-foreground mt-1">Chỉnh title + intent cho từng slide trước khi render deck.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {outlineChanged && (
                                            <span className="rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                outline changed ({changedOutlineIndices.length})
                                            </span>
                                        )}
                                        <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={handleGenerateOutline} disabled={isGeneratingOutline || !itemId}>
                                            {isGeneratingOutline ? 'Đang sinh...' : 'Sinh lại Outline'}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                                    <div className="text-[11px] text-muted-foreground">
                                        Đã chọn <span className="font-semibold text-foreground">{selectedOutlineIndices.length}</span> slide để sync.
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 rounded-md text-[10px]"
                                            onClick={() => setSelectedOutlineIndices(outlineItems.map((item) => item.index))}
                                        >
                                            Chọn tất cả
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 rounded-md text-[10px]"
                                            onClick={() => setSelectedOutlineIndices(changedOutlineIndices)}
                                            disabled={changedOutlineIndices.length === 0}
                                        >
                                            Chọn slide đã đổi
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 rounded-md text-[10px]"
                                            onClick={() => setSelectedOutlineIndices([])}
                                        >
                                            Bỏ chọn
                                        </Button>
                                    </div>
                                </div>
                                <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                                    {outlineItems.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground text-center">
                                            Chưa có outline. Hãy bấm <span className="font-semibold">Sinh Outline AI</span> ở sidebar hoặc nút phía trên.
                                        </div>
                                    ) : (
                                        outlineItems.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className={cn(
                                                    "rounded-xl border bg-background/60 p-3 space-y-2 transition-colors",
                                                    changedOutlineIndices.includes(item.index)
                                                        ? "border-amber-300/80 bg-amber-50/60"
                                                        : "border-border/40"
                                                )}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Slide {item.index}</div>
                                                    <div className="flex items-center gap-2">
                                                        {changedOutlineIndices.includes(item.index) && (
                                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                                                                changed
                                                            </span>
                                                        )}
                                                        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedOutlineIndices.includes(item.index)}
                                                                onChange={() => toggleOutlineSelection(item.index)}
                                                                className="h-3.5 w-3.5 rounded border-border"
                                                            />
                                                            Sync
                                                        </label>
                                                    </div>
                                                </div>
                                                <Input
                                                    value={item.title}
                                                    onChange={(e) => {
                                                        const next = [...outlineItems]
                                                        next[idx] = { ...next[idx], title: e.target.value }
                                                        setOutlineItems(next)
                                                    }}
                                                    className="h-8 text-sm"
                                                />
                                                <Textarea
                                                    value={item.intent}
                                                    onChange={(e) => {
                                                        const next = [...outlineItems]
                                                        next[idx] = { ...next[idx], intent: e.target.value }
                                                        setOutlineItems(next)
                                                    }}
                                                    className="min-h-[56px] text-xs"
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        ) : !hasSlides ? (
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }}
                                className="text-center space-y-4"
                            >
                                <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                                    <Layout className="w-12 h-12 text-primary" />
                                </div>
                                <h2 className="text-2xl font-bold">Sẵn sàng để tỏa sáng?</h2>
                                <p className="text-muted-foreground max-w-xs mx-auto">Thiết lập cấu hình bên trái và để AI giúp bạn soạn thảo bộ Slide chuyên nghiệp nhất.</p>
                            </motion.div>
                        ) : (
                            <div className="w-full max-w-5xl space-y-2.5 sm:space-y-3">
                                <motion.div 
                                    key={currentSlideIndex}
                                    initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                                    transition={{ 
                                        type: "spring", 
                                        damping: 25, 
                                        stiffness: 120,
                                        opacity: { duration: 0.4 }
                                    }}
                                    ref={selectedSlidePreviewRef}
                                    className={cn("group/slide relative w-full overflow-hidden rounded-[20px] shadow-2xl ring-1 ring-white/10 sm:rounded-[24px] lg:rounded-[28px]")}
                                    style={{
                                        aspectRatio: slideAspectRatio,
                                        ['--accent' as any]: accent,
                                        ['--accent2' as any]: accent2,
                                        ['--accent3' as any]: accent3,
                                    }}
                                >
                                    {currentSlide ? (
                                        <SlideTemplatePreview
                                            slide={currentSlide}
                                            slideIndex={currentSlideIndex}
                                            slideCount={displaySlides.length}
                                            slideshowTitle={slideshow?.title || 'Deck'}
                                            style={activeStyle}
                                        />
                                    ) : null}
                                    {hasSlides && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}
                                                disabled={currentSlideIndex === 0}
                                                className="absolute left-2 top-1/2 z-[20] h-9 w-9 -translate-y-1/2 rounded-full text-primary hover:bg-primary/10 disabled:opacity-30 sm:left-3 sm:h-10 sm:w-10 lg:left-4 lg:h-12 lg:w-12"
                                            >
                                                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                    setCurrentSlideIndex((prev) => Math.min(displaySlides.length - 1, prev + 1))
                                                }
                                                disabled={currentSlideIndex === displaySlides.length - 1}
                                                className="absolute right-2 top-1/2 z-[20] h-9 w-9 -translate-y-1/2 rounded-full text-primary hover:bg-primary/10 disabled:opacity-30 sm:right-3 sm:h-10 sm:w-10 lg:right-4 lg:h-12 lg:w-12"
                                            >
                                                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
                                            </Button>
                                        </>
                                    )}
                                </motion.div>

                                <div className="rounded-[18px] border border-border/50 bg-card/30 p-2 sm:p-2.5 shadow-xl backdrop-blur-sm sm:rounded-[22px]">
                                    <div
                                        ref={thumbnailStripRef}
                                        className="flex cursor-grab gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden active:cursor-grabbing sm:gap-2.5"
                                        onMouseDown={handleThumbnailStripMouseDown}
                                        onMouseMove={handleThumbnailStripMouseMove}
                                        onMouseUp={stopThumbnailStripDrag}
                                        onMouseLeave={stopThumbnailStripDrag}
                                    >
                                        {displaySlides.map((slide, index) => (
                                            <button
                                                key={slide.id || `${slide.title}-${index}`}
                                                type="button"
                                                onClick={() => handleThumbnailClick(index)}
                                                className={cn(
                                                    "w-[154px] shrink-0 rounded-[18px] border p-1.5 text-left transition-all select-none sm:w-[176px] lg:w-[188px]",
                                                    currentSlideIndex === index
                                                        ? "border-primary bg-primary/8 shadow-lg ring-1 ring-primary/30"
                                                        : "border-border/50 bg-background/40 hover:border-primary/40 hover:bg-background/70"
                                                )}
                                            >
                                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                        {String(index + 1).padStart(2, '0')}
                                                    </span>
                                                    <span className="rounded-full bg-background/70 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                                                        {slide.layout}
                                                    </span>
                                                </div>
                                                <div
                                                    className="relative overflow-hidden rounded-xl ring-1 ring-white/10"
                                                    style={{ aspectRatio: slideAspectRatio }}
                                                    ref={index === 0 ? thumbnailPreviewRef : undefined}
                                                >
                                                    <div
                                                        className="absolute left-0 top-0 origin-top-left"
                                                        style={{
                                                            width: thumbnailCanvasSize,
                                                            height: thumbnailCanvasSize,
                                                            transform: `scale(${thumbnailCanvasScale})`,
                                                        }}
                                                    >
                                                        {renderThumbnailContent(slide, index)}
                                                    </div>
                                                </div>
                                                <p className="mt-1.5 line-clamp-1 text-[10px] font-medium text-foreground/90">
                                                    {slide.title || `Slide ${index + 1}`}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 3. Notes & Interaction (Bottom) */}
                <footer className="flex h-auto flex-col gap-4 overflow-auto border-t border-border/50 bg-card/20 p-4 sm:p-5 lg:p-6 xl:flex-row xl:gap-6 2xl:h-48 2xl:overflow-hidden">
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Mic className="w-3.5 h-3.5" /> Speaker Notes
                            </label>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] gap-1 rounded-md"
                                disabled={!hasSlides}
                                onClick={() => setShowPresentationText(true)}
                            >
                                <FileText className="w-3 h-3" /> Mở text
                            </Button>
                        </div>
                        <div className="flex-1 bg-muted/30 rounded-xl p-4 text-xs text-muted-foreground overflow-y-auto leading-relaxed border border-border/30">
                            {currentSlide?.speakerNotes || localizedSpecialSlideCopy.missingText}
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 xl:w-72">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5" /> Tương tác
                        </label>
                        <div className="flex-1 flex flex-col gap-2">
                            <div className={cn(
                                "flex items-center justify-between p-3 rounded-xl border transition-all",
                                includeQuiz ? "bg-primary/5 border-primary/30" : "bg-muted/30 border-dashed"
                            )}>
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                        includeQuiz ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                    )}>
                                        <HelpCircle className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold">Slide Quiz</p>
                                        <p className="text-[9px] text-muted-foreground">
                                            {selectedQuizIds.length > 0 ? `Đã chọn ${selectedQuizIds.length}/3 câu` : 'Mặc định hiển thị 3 câu đầu'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {includeQuiz && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-7 px-2 text-[9px] font-bold text-primary hover:bg-primary/10"
                                            onClick={() => setShowQuizSelector(true)}
                                        >
                                            Chọn câu
                                        </Button>
                                    )}
                                    <button 
                                        onClick={() => setIncludeQuiz(!includeQuiz)}
                                        className={cn(
                                            "w-8 h-4 rounded-full transition-all relative",
                                            includeQuiz ? "bg-primary" : "bg-slate-300"
                                        )}
                                    >
                                        <div className={cn(
                                            "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm",
                                            includeQuiz ? "left-4.5" : "left-0.5"
                                        )} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 xl:w-56">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <GitBranch className="w-3.5 h-3.5" /> Góc nhìn
                        </label>
                        <div className={cn(
                            "flex-1 rounded-xl border transition-all overflow-hidden flex flex-col relative group",
                            includeMindmap ? "bg-primary/5 border-primary/30 shadow-inner" : "bg-muted/30 border-dashed"
                        )}>
                            {/* Mindmap Thumbnail Preview */}
                            <div className="flex-1 w-full opacity-40 group-hover:opacity-60 transition-opacity pointer-events-none">
                                {mindmap && includeMindmap && formattedMindmap && (
                                    <div className="w-full h-full scale-50 origin-center translate-y-[-20%]">
                                        <MindMapThumbnail 
                                            data={formattedMindmap}
                                            layout={{ type: 'mindmap', direction: 'H' }}
                                            autoFit={'view' as const}
                                        />
                                    </div>
                                )}
                                {!includeMindmap && (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <GitBranch className="w-8 h-8 text-muted-foreground/30" />
                                    </div>
                                )}
                            </div>

                            {/* Toggle Button Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Button 
                                    variant={includeMindmap ? "secondary" : "outline"} 
                                    size="sm" 
                                    className="h-8 rounded-full shadow-md text-[10px] font-bold gap-2 px-4"
                                    onClick={() => setIncludeMindmap(!includeMindmap)}
                                >
                                    {includeMindmap ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Plus className="w-3 h-3" />}
                                    {includeMindmap ? "Đã bật sơ đồ" : "Hiện sơ đồ"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </footer>

                {/* Quiz Selector Dialog */}
                <AnimatePresence>
                    {showQuizSelector && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-8"
                        >
                            <motion.div 
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                className="bg-card border border-border shadow-2xl rounded-3xl w-full max-w-2xl flex flex-col max-h-[80%]"
                            >
                                <div className="p-6 border-b border-border flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold">Chọn câu hỏi cho Slide</h3>
                                        <p className="text-xs text-muted-foreground">Chọn tối đa 3 câu hỏi hay nhất để đưa vào bộ thuyết trình.</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowQuizSelector(false)}>
                                        <X className="w-5 h-5" />
                                    </Button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                                    {quiz && quiz.length > 0 ? (
                                        quiz.map((q, idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => toggleQuizSelection(idx)}
                                                className={cn(
                                                    "w-full text-left p-4 rounded-2xl border transition-all flex gap-4 items-start group",
                                                    selectedQuizIds.includes(idx) ? "bg-primary/5 border-primary shadow-sm" : "hover:bg-muted/50 border-border"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                                                    selectedQuizIds.includes(idx) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30 group-hover:border-primary/50"
                                                )}>
                                                    {selectedQuizIds.includes(idx) && <CheckIcon className="w-3.5 h-3.5" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold mb-1">Câu hỏi {idx + 1}</p>
                                                    <p className="text-xs text-muted-foreground line-clamp-2">{q.question}</p>
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                            <HelpCircle className="w-10 h-10 opacity-20" />
                                            <p className="text-sm">Không tìm thấy dữ liệu câu hỏi.</p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-6 border-t border-border bg-muted/20 flex justify-end gap-3">
                                    <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setShowQuizSelector(false)}>Hủy bỏ</Button>
                                    <Button className="rounded-xl font-bold px-8 shadow-lg shadow-primary/20" onClick={() => setShowQuizSelector(false)}>Xác nhận ({selectedQuizIds.length})</Button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showPresentationText && slideshow && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[101] overflow-y-auto bg-background/80 p-3 sm:p-4 lg:p-6 backdrop-blur-sm"
                        >
                            <motion.div
                                initial={{ scale: 0.96, y: 18 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.96, y: 18 }}
                                className="mx-auto my-3 flex w-full max-w-4xl max-h-[86vh] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:my-6 sm:max-h-[82vh]"
                            >
                                <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-5">
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-bold">Text cho người trình bày</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Slide {currentSlideIndex + 1}: {currentSlide?.title || localizedSpecialSlideCopy.missingTitle}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-xl text-xs font-semibold"
                                            onClick={exportAsTXT}
                                        >
                                            <FileText className="w-3.5 h-3.5 mr-1" />
                                            Xuất TXT
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-full"
                                            onClick={() => setShowPresentationText(false)}
                                        >
                                            <X className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid min-h-0 max-h-[calc(86vh-88px)] grid-cols-1 gap-0 overflow-hidden lg:max-h-[calc(82vh-88px)] lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                                    <div className="min-h-0 overflow-y-scroll border-b border-border px-4 py-4 sm:px-6 sm:py-5 lg:border-b-0 lg:border-r">
                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                                    Nội dung đang đọc
                                                </p>
                                                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                                                    {currentPresentationText}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                                    Tóm tắt slide hiện tại
                                                </p>
                                                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                                    {currentSlide?.subtitle ? <p>{currentSlide.subtitle}</p> : null}
                                                    {currentSlide?.content ? (
                                                        <div className="whitespace-pre-wrap leading-6">{currentSlide.content}</div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-h-0 overflow-y-scroll px-4 py-4 sm:px-5 sm:py-5">
                                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                            Chọn slide để đọc
                                        </p>
                                        <div className="space-y-2">
                                            {displaySlides.map((slide, index) => (
                                                <button
                                                    key={slide.id || `${slide.title}-${index}-text`}
                                                    type="button"
                                                    onClick={() => setCurrentSlideIndex(index)}
                                                    className={cn(
                                                        "w-full rounded-2xl border px-4 py-3 text-left transition-all",
                                                        currentSlideIndex === index
                                                            ? "border-primary bg-primary/8 shadow-sm"
                                                            : "border-border/60 bg-background/40 hover:border-primary/40 hover:bg-background/70"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-xs font-semibold text-foreground">
                                                            {String(index + 1).padStart(2, '0')}. {slide.title || `${localizedSpecialSlideCopy.missingTitle} ${index + 1}`}
                                                        </span>
                                                        <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                                                            {slide.layout}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                        {slide.subtitle || slide.content || localizedSpecialSlideCopy.missingDescription}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Presenter Mode (Fullscreen Slide View) */}
            <AnimatePresence>
                {isPresenterMode && slideshow && (
                    <motion.div
                        ref={presenterModeRef}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black z-50 flex items-center justify-center"
                        tabIndex={0}
                    >
                        {/* Exit button */}
                        <button
                            onClick={() => setIsPresenterMode(false)}
                            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        {/* Slide counter */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full bg-white/10 backdrop-blur-md text-white/80 text-sm font-medium">
                            {currentSlideIndex + 1} / {displaySlides.length}
                        </div>

                        {/* Previous button */}
                        <button
                            onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                            className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all disabled:opacity-30"
                            disabled={currentSlideIndex === 0}
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>

                        {/* Next button */}
                        <button
                            onClick={() => setCurrentSlideIndex(prev => Math.min(displaySlides.length - 1, prev + 1))}
                            className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all disabled:opacity-30"
                            disabled={currentSlideIndex === displaySlides.length - 1}
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>

                        {/* Slide content */}
                        <div className="w-full h-full max-w-7xl max-h-[90vh] aspect-video relative">
                            {(() => {
                                const slide = displaySlides[currentSlideIndex]
                                const presenterStyle = activeStyle

                                return (
                                    <div className="w-full h-full relative overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-white/10">
                                        <SlideTemplatePreview
                                            slide={slide}
                                            slideIndex={currentSlideIndex}
                                            slideCount={displaySlides.length}
                                            slideshowTitle={slideshow.title || 'Deck'}
                                            style={presenterStyle}
                                        />
                                    </div>
                                )
                            })()}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
