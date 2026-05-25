"""
Model: enrichment_jobs — Hàng đợi điều phối các tác vụ AI.
Mapped from deploy.sql Table 4.
"""
from sqlalchemy import Column, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class EnrichmentJob(Base):
    __tablename__ = "enrichment_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job_type = Column(Text, nullable=False)
    status = Column(Text, default="pending")
    error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    item = relationship("KnowledgeItem", back_populates="enrichment_jobs")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')",
            name="ck_enrichment_jobs_status"
        ),
    )

    def __repr__(self):
        return f"<EnrichmentJob(id={self.id}, job_type='{self.job_type}', status='{self.status}')>"
