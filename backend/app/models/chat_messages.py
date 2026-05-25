import uuid

from sqlalchemy import Column, Text, DateTime, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.db.base import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    role = Column(Text, nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    sources = Column(JSONB, nullable=True) # Lưu trích dẫn [Trang X, URL...]
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_chat_messages_role"),
    )
