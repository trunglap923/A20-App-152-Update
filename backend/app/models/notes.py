from sqlalchemy import Column, String, Text, Integer, ForeignKey, JSON
from app.db.base import Base

class Note(Base):
    """
    Note lưu trữ AI generated content (Summary, Micro-lessons, Quiz) được đính kèm với một Item.
    """
    __tablename__ = "notes"

    id = Column(String, primary_key=True, index=True)
    item_id = Column(String, ForeignKey("items.id"), nullable=False, index=True)
    note_type = Column(String, nullable=False) # 'summary', 'micro_lesson', 'quiz'
    content = Column(Text, nullable=True)      # Dành cho summary dạng text
    data = Column(JSON, nullable=True)         # Dành cho micro_lesson dạng list hoặc quiz dạng question-answers
