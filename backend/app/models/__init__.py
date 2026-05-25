"""
Central model registry — Import tất cả models để SQLAlchemy metadata.create_all() nhận diện.
"""

# --- Core entities ---
from app.models.knowledge_items import KnowledgeItem
from app.models.chunks import ItemChunk
from app.models.embeddings import Embedding
from app.models.enrichment import EnrichmentJob

# --- AI-generated content ---
from app.models.summaries import Summary
from app.models.mindmaps import Mindmap
from app.models.lessons import Lesson
from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer

# --- Tagging ---
from app.models.tags import Tag, ItemTag

# --- User progress ---
from app.models.progress import QuizAttempt, UserAnswer, LessonProgress

# --- Caching ---
from app.models.cache import LLMCache

# --- AI Monitoring ---
from app.models.ai_logs import AILog
from app.models.chat_messages import ChatMessage
from app.models.chat_summaries import ChatSummary

# --- Legacy (sẽ xóa sau khi migration pipeline hoàn tất) ---
from app.models.items import Item
from app.models.notes import Note

__all__ = [
    # New schema
    "KnowledgeItem", "ItemChunk", "Embedding", "EnrichmentJob",
    "Summary", "Mindmap", "Lesson",
    "Quiz", "QuizQuestion", "QuizAnswer",
    "Tag", "ItemTag",
    "QuizAttempt", "UserAnswer", "LessonProgress",
    "LLMCache",
    "AILog",
    "ChatMessage", "ChatSummary",
    # Legacy (keep during transition)
    "Item", "Note",
]
