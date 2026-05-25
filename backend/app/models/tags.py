"""
Models: tags, item_tags — Hệ thống gắn thẻ (many-to-many).
Mapped from deploy.sql Tables 7, 8.
"""
from sqlalchemy import Column, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, unique=True)

    # Relationships
    items = relationship("ItemTag", back_populates="tag", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}')>"


class ItemTag(Base):
    __tablename__ = "item_tags"

    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Relationships
    item = relationship("KnowledgeItem", back_populates="tags")
    tag = relationship("Tag", back_populates="items")

    def __repr__(self):
        return f"<ItemTag(item_id={self.item_id}, tag_id={self.tag_id})>"
