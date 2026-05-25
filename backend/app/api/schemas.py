from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- INPUT SCHEMAS ---
class ProcessRequest(BaseModel):
    source_url: str
    source_type: str = "pdf" # 'pdf', 'youtube', 'audio'

class RenameItemRequest(BaseModel):
    title: str

# --- OUTPUT SCHEMAS (Synced with FE Types) ---

class HighlightItem(BaseModel):
    keyword: str
    source_quote: str
    media_timestamp: Optional[str] = None
    page_number: Optional[int] = None  # PDF page number (1-based)

class Summary(BaseModel):
    tldr: List[str]
    detailed: str
    highlights: List[HighlightItem]

class Lesson(BaseModel):
    id: str
    title: str
    keyConcept: str
    example: str
    start: Optional[float] = None
    end: Optional[float] = None
    key_points: Optional[List[str]] = []

class QuizQuestion(BaseModel):
    id: str
    type: str = "mcq"
    question: str
    options: List[str]
    answer: str
    explanation: str

class MindmapNode(BaseModel):
    id: str
    label: str
    title: Optional[str] = None
    name: Optional[str] = None # Added for user preference
    data: Optional[dict] = None
    children: Optional[List['MindmapNode']] = []

MindmapNode.model_rebuild()

class QuizVersion(BaseModel):
    version_id: str
    label: str
    questions: List[QuizQuestion]

class SummaryVersion(BaseModel):
    version_id: str
    label: str
    summary: Summary

class MindmapVersion(BaseModel):
    version_id: str
    label: str
    mindmap: MindmapNode

class LessonVersion(BaseModel):
    version_id: str
    label: str
    lessons: List[Lesson]

class ItemResponse(BaseModel):
    id: str
    title: str
    source_type: str
    source_url: str
    created_at: datetime
    
    # AI Content (Default/Fallback)
    summary: Optional[Summary] = None
    lessons: Optional[List[Lesson]] = []
    quiz: Optional[List[QuizQuestion]] = []
    mindmap: Optional[MindmapNode] = None

    # Versioned Content
    summary_versions: Optional[List[SummaryVersion]] = []
    mindmap_versions: Optional[List[MindmapVersion]] = []
    lesson_versions: Optional[List[LessonVersion]] = []
    quiz_versions: Optional[List[QuizVersion]] = []
    
    status: str = "processing"
    processing_stage: Optional[str] = None

class ItemListResponse(BaseModel):
    items: List[ItemResponse]


# --- AI Monitoring Schemas ---

class AILogResponse(BaseModel):
    id: str
    at: str  # ISO timestamp
    user_id: Optional[str] = None
    email: Optional[str] = None  # sẽ dùng user_id nếu chưa có email
    task: str
    model: str
    inputTokens: int
    outputTokens: int
    latencyMs: int
    success: bool
    prompt: Optional[str] = None
    response: Optional[str] = None
    error_message: Optional[str] = None
    item_id: Optional[str] = None


class AIMonitoringResponse(BaseModel):
    """Response tổng hợp cho trang AI Monitoring"""
    logs: List[AILogResponse]
    total_count: int

# --- CHAT SCHEMAS ---
class ChatRequest(BaseModel):
    message: str
    item_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = []

class ChatResponse(BaseModel):
    answer: str
    sources: List[str] = []

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sources: List[str] = []
    created_at: datetime

class ChatTtsRequest(BaseModel):
    text: str
    voice_selection: str = "auto"
    item_id: Optional[str] = None

# --- SLIDE SCHEMAS ---
class SlideStyle(BaseModel):
    category: str = "academic"
    colorPalette: List[str] = ["#3b82f6", "#1d4ed8", "#1e3a8a"]
    font: str = "Inter"

class Slide(BaseModel):
    id: str
    title: str
    content: Optional[str] = None
    layout: str = "title-only" # 'title-only', 'split', 'bullets', 'quote', 'image-left', 'image-right'
    subtitle: Optional[str] = None
    bullets: Optional[List[str]] = None
    leftTitle: Optional[str] = None
    leftBullets: Optional[List[str]] = None
    rightTitle: Optional[str] = None
    rightBullets: Optional[List[str]] = None
    quote: Optional[str] = None
    speakerNotes: Optional[str] = None
    imagePrompt: Optional[str] = None
    image: Optional[str] = None

class SlideShow(BaseModel):
    id: str
    title: str
    slides: List[Slide]
    style: Optional[SlideStyle] = None

class GenerateSlidesRequest(BaseModel):
    item_id: str
    page_count: int = 10
    language: str = "vi"
    additional_instructions: Optional[str] = None
    include_quiz: bool = False
    selected_quiz_ids: Optional[List[str]] = []
    include_mindmap: bool = False
    mindmap_data: Optional[Any] = None
    quiz_data: Optional[List[Any]] = None
    style: Optional[SlideStyle] = None

class GenerateOutlineRequest(BaseModel):
    item_id: str
    page_count: int = 10
    language: str = "vi"
    additional_instructions: Optional[str] = None

class SlideOutlineItem(BaseModel):
    index: int
    title: str
    intent: str

class SlideOutlineResponse(BaseModel):
    outline: List[SlideOutlineItem]

