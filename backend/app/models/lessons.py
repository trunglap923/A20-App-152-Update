"""
Model: lessons — Bài học được sinh ra bởi AI.
Mapped from deploy.sql Table 9.
"""
from sqlalchemy import Column, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    example = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=True)
    
    # Video specific fields
    from sqlalchemy import String
    start_time = Column(Integer, nullable=True) # Seconds
    end_time = Column(Integer, nullable=True)   # Seconds
    metadata_json = Column(Text, nullable=True) # Store as JSON string or use JSON type if supported
    
    version_label = Column(String, default="Phiên bản gốc")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    item = relationship("KnowledgeItem", back_populates="lessons")
    quizzes = relationship("Quiz", back_populates="lesson", cascade="all, delete-orphan")
    progress = relationship("LessonProgress", back_populates="lesson", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Lesson(id={self.id}, title='{self.title}', order_index={self.order_index})>"
