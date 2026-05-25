"""
Model: llm_cache — Cache phản hồi AI theo prompt hash.
Mapped from deploy.sql Table 16.
"""
from sqlalchemy import Column, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.base import Base
import uuid


class LLMCache(Base):
    __tablename__ = "llm_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_hash = Column(Text, unique=True)
    response = Column(Text, nullable=True)
    model = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<LLMCache(id={self.id}, prompt_hash='{self.prompt_hash}')>"
