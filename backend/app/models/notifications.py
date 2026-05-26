from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone
from app.db.session import Base

class BroadcastCampaign(Base):
    __tablename__ = "admin_broadcast_campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_name = Column(String)
    audience = Column(String) # 'Tất cả user', etc.
    channel = Column(String)  # 'Email', 'In-app Notification', 'Push Notification'
    sent_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="Đang gửi") # 'Đang gửi', 'Đã gửi', 'Lỗi'
    open_rate = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class UserNotification(Base):
    __tablename__ = "user_notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("admin_broadcast_campaigns.id"), nullable=True)
    title = Column(String)
    content = Column(String)
    channel = Column(String)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Banner(Base):
    __tablename__ = "admin_banners"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    placement = Column(String) # 'Top bar', 'Cạnh bên', 'Popup giữa màn hình'
    type = Column(String) # 'Info', 'Warning', 'Khuyến mãi'
    content = Column(String)
    cta_text = Column(String)
    cta_link = Column(String)
    start_date = Column(DateTime(timezone=True))
    end_date = Column(DateTime(timezone=True))
    enabled = Column(Boolean, default=True)
    ctr = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
