"""
Model ghi log các request AI (LLM) để phục vụ trang Giám sát hệ thống AI.
Mỗi lần gọi LLM (summarize, outline, write_lesson, quiz, ...) sẽ tạo 1 bản ghi riêng biệt.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class AILog(Base):
    __tablename__ = "ai_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Ai đã gọi
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_email = Column(String(255), nullable=True)

    # Loại tác vụ: 'Summarize', 'Outline', 'Write Lesson', 'Quiz', 'RAG Query', 'Chat', 'Extract', 'Mindmap'
    task_type = Column(String(100), nullable=False, index=True)

    # Model đã sử dụng: 'gpt-4o-mini', 'gemini-1.5-pro', ...
    model_name = Column(String(100), nullable=False)

    # Token usage
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)

    # Hiệu năng
    latency_ms = Column(Integer, default=0)

    # Kết quả
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)

    # Nội dung (cắt ngắn nếu quá dài để tiết kiệm dung lượng)
    prompt = Column(Text, nullable=True)
    response = Column(Text, nullable=True)

    # Liên kết ngược tới item (nếu có)
    item_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    def __repr__(self):
        return f"<AILog {self.id} task={self.task_type} model={self.model_name} success={self.success}>"
