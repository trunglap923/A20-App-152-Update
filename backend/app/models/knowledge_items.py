"""
Model: knowledge_items — Thực thể gốc chứa metadata và trạng thái xử lý.
Mapped from deploy.sql Table 1.
"""
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, CheckConstraint, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    # Hỗ trợ đa phương tiện
    source_type = Column(Text, nullable=True)
    source_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)

    raw_content = Column(Text, nullable=True)
    language = Column(Text, default="en")
    duration = Column(Integer, nullable=True)

    status = Column(Text, default="pending")
    processing_stage = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    chunks = relationship("ItemChunk", back_populates="item", cascade="all, delete-orphan")
    enrichment_jobs = relationship("EnrichmentJob", back_populates="item", cascade="all, delete-orphan")
    summaries = relationship("Summary", back_populates="item", cascade="all, delete-orphan")
    mindmaps = relationship("Mindmap", back_populates="item", cascade="all, delete-orphan")
    lessons = relationship("Lesson", back_populates="item", cascade="all, delete-orphan")
    tags = relationship("ItemTag", back_populates="item", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "source_type IN ('pdf', 'youtube', 'audio', 'video')",
            name="ck_knowledge_items_source_type"
        ),
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')",
            name="ck_knowledge_items_status"
        ),
    )

    def __repr__(self):
        return f"<KnowledgeItem(id={self.id}, title='{self.title}', status='{self.status}')>"
