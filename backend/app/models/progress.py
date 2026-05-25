"""
Models: lesson_progress, quiz_attempts, user_answers — Theo dõi tiến độ người dùng.
Mapped from deploy.sql Tables 13, 14, 15.
"""
from sqlalchemy import (
    Column, Text, Float, Boolean, Integer, DateTime,
    ForeignKey, CheckConstraint, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    quiz_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    score = Column(Float, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    quiz = relationship("Quiz", back_populates="attempts")
    user_answers = relationship("UserAnswer", back_populates="attempt", cascade="all, delete-orphan")

    __table_args__ = (
        # Chỉ cho phép 1 active attempt (chưa hoàn thành) cho mỗi user + quiz
        Index(
            "unique_active_attempt",
            "user_id", "quiz_id",
            unique=True,
            postgresql_where=(Column("completed_at").is_(None)),
        ),
    )

    def __repr__(self):
        return f"<QuizAttempt(id={self.id}, score={self.score})>"


class UserAnswer(Base):
    __tablename__ = "user_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quiz_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quiz_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    answer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quiz_answers.id", ondelete="CASCADE"),
        nullable=True,
    )

    is_correct = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    attempt = relationship("QuizAttempt", back_populates="user_answers")
    question = relationship("QuizQuestion", back_populates="user_answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="unique_attempt_question"),
    )

    def __repr__(self):
        return f"<UserAnswer(id={self.id}, is_correct={self.is_correct})>"


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    lesson_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(Text, default="not_started")
    score = Column(Float, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    lesson = relationship("Lesson", back_populates="progress")

    __table_args__ = (
        CheckConstraint(
            "status IN ('not_started', 'in_progress', 'done')",
            name="ck_lesson_progress_status"
        ),
        UniqueConstraint("user_id", "lesson_id", name="unique_user_lesson"),
    )

    def __repr__(self):
        return f"<LessonProgress(id={self.id}, status='{self.status}')>"
