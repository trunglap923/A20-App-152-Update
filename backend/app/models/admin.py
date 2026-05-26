from sqlalchemy import Column, String, Text, Boolean, DateTime, func, Integer
import uuid
from app.db.base import Base

class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True) # UUID string matching Auth users
    content = Column("message", Text, nullable=False)
    type = Column(String, nullable=True)
    rating = Column(Integer, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AuthAuditLog(Base):
    __tablename__ = "auth_audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True)
    email = Column(String, nullable=True)
    event = Column(String, nullable=False)
    success = Column(Boolean, default=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    device = Column(String, nullable=True)
    error_code = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    create_at = Column(DateTime(timezone=True), server_default=func.now())
