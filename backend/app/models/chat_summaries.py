import uuid

from sqlalchemy import Column, Text, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base

class ChatSummary(Base):
    __tablename__ = "chat_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    summary = Column(Text, nullable=False, default="")
    last_message_count = Column(Integer, nullable=False, default=0)
    
    # Track update time
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
