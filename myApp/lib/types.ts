export interface UploadedFile {
  id: string
  name: string
  type: 'pdf' | 'audio' | 'video' | 'youtube'
  uploadedAt: Date
  status: 'pending' | 'running' | 'done' | 'failed'
}

export interface HighlightItem {
  keyword: string
  source_quote: string
  media_timestamp?: string | null
  page_number?: number | null
}

export interface Summary {
  tldr: string[]
  detailed: string
  highlights: HighlightItem[]
}

export interface Lesson {
  id: string
  title: string
  keyConcept: string
  example: string
}

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'true_false' | 'short_answer' | 'single_choice' | 'multiple_choice'
  question: string
  options?: string[]
  answer: string
  explanation: string
}

export interface QuizVersion {
  version_id: string
  label: string
  questions: QuizQuestion[]
}

export interface MindmapNode {
  id: string
  label: string
  name?: string
  title?: string
  children?: MindmapNode[]
}

export interface Slide {
  id: string
  title: string
  content?: string
  layout: 'title-only' | 'split' | 'grid' | 'full' | 'image-left' | 'image-right'
  subtitle?: string
  bullets?: string[]
  leftTitle?: string
  leftBullets?: string[]
  rightTitle?: string
  rightBullets?: string[]
  quote?: string
  image?: string
  imagePrompt?: string
  speakerNotes?: string
}

export interface SlideShow {
  id: string
  title: string
  slides: Slide[]
  style?: {
    category: 'academic' | 'business' | 'creative' | 'children'
    colorPalette: string[]
    font: string
  }
}

export interface SummaryVersion {
  version_id: string
  label: string
  summary: Summary
}

export interface MindmapVersion {
  version_id: string
  label: string
  mindmap: MindmapNode
}

export interface LessonVersion {
  version_id: string
  label: string
  lessons: Lesson[]
}

export interface ProcessedContent {
  id?: string
  summary: Summary
  lessons: Lesson[]
  quiz: QuizQuestion[]
  quiz_versions?: QuizVersion[]
  summary_versions?: SummaryVersion[]
  mindmap_versions?: MindmapVersion[]
  lesson_versions?: LessonVersion[]
  mindmap: MindmapNode
  slides?: SlideShow
  source_type?: 'pdf' | 'audio' | 'video' | 'youtube'
  source_url?: string
}

export type ProcessingStep = 'upload' | 'processing' | 'understanding' | 'generating' | 'complete' | 'fetching'
