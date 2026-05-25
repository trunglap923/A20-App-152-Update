"""
Model: item_chunks — Đơn vị dữ liệu nhỏ nhất, chứa text + frame + vector search.
Mapped from deploy.sql Table 2.
"""
from sqlalchemy import (
    Column, Text, Integer, Float, DateTime, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY, TSVECTOR
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class ItemChunk(Base):
    __tablename__ = "item_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    content = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=True)

    # Timestamps cho video/audio
    start_time = Column(Float, nullable=True)
    end_time = Column(Float, nullable=True)

    # Multimodal RAG: URL frame ảnh cắt từ video
    frame_urls = Column(ARRAY(Text), server_default="{}")
    chunk_metadata = Column(JSONB, server_default="{}")

    token_count = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    search_vector = Column(TSVECTOR, nullable=True)

    # Relationships
    item = relationship("KnowledgeItem", back_populates="chunks")
    embedding = relationship("Embedding", back_populates="chunk", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ItemChunk(id={self.id}, item_id={self.item_id}, chunk_index={self.chunk_index})>"
