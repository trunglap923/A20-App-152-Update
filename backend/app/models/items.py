from sqlalchemy import Column, String, Text, Integer, DateTime
from sqlalchemy.sql import func
from app.db.base import Base

class Item(Base):
    """
    Item đại diện cho một đối tượng nội dung gốc (File PDF, Youtube Video, v.v.)
    """
    __tablename__ = "items"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    source_type = Column(String, index=True) # 'youtube', 'pdf'
    source_url = Column(String, nullable=True)
    content = Column(Text, nullable=True)    # Transcript or Full Text
    status = Column(String, default="processing") # 'processing', 'understanding', 'generating', 'completed'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
