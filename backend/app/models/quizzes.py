"""
Models: quizzes, quiz_questions, quiz_answers — Hệ thống câu hỏi trắc nghiệm.
Mapped from deploy.sql Tables 10, 11, 12.
"""
from sqlalchemy import (
    Column, Text, Integer, Boolean, DateTime, Float,
    ForeignKey, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lesson_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    total_questions = Column(Integer, nullable=True)
    difficulty = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    lesson = relationship("Lesson", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Quiz(id={self.id}, title='{self.title}')>"


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quiz_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    question = Column(Text, nullable=False)
    question_type = Column(Text, default="single_choice")
    explanation = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    quiz = relationship("Quiz", back_populates="questions")
    answers = relationship("QuizAnswer", back_populates="question", cascade="all, delete-orphan")
    user_answers = relationship("UserAnswer", back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "question_type IN ('single_choice', 'multiple_choice', 'true_false')",
            name="ck_quiz_questions_type"
        ),
        UniqueConstraint("quiz_id", "order_index", name="unique_quiz_question_order"),
    )

    def __repr__(self):
        return f"<QuizQuestion(id={self.id}, question_type='{self.question_type}')>"


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quiz_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    content = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False)
    order_index = Column(Integer, nullable=True)

    # Relationships
    question = relationship("QuizQuestion", back_populates="answers")

    __table_args__ = (
        UniqueConstraint("question_id", "order_index", name="unique_question_answer_order"),
    )

    def __repr__(self):
        return f"<QuizAnswer(id={self.id}, is_correct={self.is_correct})>"
