"""
Model: mindmaps — Sơ đồ tư duy dạng JSON.
Mapped from deploy.sql Table 6.
"""
from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class Mindmap(Base):
    __tablename__ = "mindmaps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    from sqlalchemy import String
    data = Column(JSONB, nullable=True)
    version_label = Column(String, default="Phiên bản gốc")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    item = relationship("KnowledgeItem", back_populates="mindmaps")

    def __repr__(self):
        return f"<Mindmap(id={self.id}, item_id={self.item_id})>"
