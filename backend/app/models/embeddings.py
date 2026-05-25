"""
Model: embeddings — Vector embeddings cho từng chunk.
Mapped from deploy.sql Table 3.
"""
from sqlalchemy import Column, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid

try:
    from pgvector.sqlalchemy import Vector
    VECTOR_TYPE = Vector(1536)
except ImportError:
    # Fallback nếu chưa cài pgvector
    from sqlalchemy import LargeBinary
    VECTOR_TYPE = LargeBinary


class Embedding(Base):
    __tablename__ = "embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_id = Column(
        UUID(as_uuid=True),
        ForeignKey("item_chunks.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    embedding = Column(VECTOR_TYPE, nullable=True)
    model = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    chunk = relationship("ItemChunk", back_populates="embedding")

    __table_args__ = (
        UniqueConstraint("chunk_id", name="unique_chunk_embedding"),
    )

    def __repr__(self):
        return f"<Embedding(id={self.id}, chunk_id={self.chunk_id}, model='{self.model}')>"
