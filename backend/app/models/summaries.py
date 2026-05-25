"""
Model: summaries — Bản tóm tắt nội dung từ AI.
Mapped from deploy.sql Table 5.
"""
from sqlalchemy import Column, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class Summary(Base):
    __tablename__ = "summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy import String
    content = Column(Text, nullable=True) # Chi tiết
    tldr = Column(JSONB, nullable=True, server_default='[]')
    highlights = Column(JSONB, nullable=True, server_default='[]')
    model = Column(Text, nullable=True)
    
    version_label = Column(String, default="Phiên bản gốc")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    item = relationship("KnowledgeItem", back_populates="summaries")

    def __repr__(self):
        return f"<Summary(id={self.id}, item_id={self.item_id})>"
