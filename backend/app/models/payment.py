from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, JSON, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone
from app.db.session import Base

class Plan(Base):
    __tablename__ = "plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, index=True)
    name = Column(String)
    description = Column(Text, nullable=True)
    price_monthly = Column(Float)
    price_yearly = Column(Float)
    is_active = Column(Boolean, default=True)
    features = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), index=True)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("plans.id"))
    provider = Column(String) # zalopay, momo, vietqr
    billing_cycle = Column(String) # monthly, yearly
    order_code = Column(String, unique=True, index=True)
    provider_order_id = Column(String, nullable=True)
    provider_transaction_id = Column(String, nullable=True)
    amount = Column(Float)
    currency = Column(String, default="VND")
    status = Column(String, default="pending") # pending, paid, failed, expired
    payment_url = Column(String, nullable=True)
    qr_code = Column(String, nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)
    expired_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class PaymentWebhook(Base):
    __tablename__ = "payment_webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("payment_transactions.id"), nullable=True)
    event_type = Column(String, nullable=True)
    payload = Column(JSON)
    signature = Column(String, nullable=True)
    status = Column(String, default="received") # received, processed, failed, ignored
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), index=True)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("plans.id"))
    billing_cycle = Column(String)
    status = Column(String, default="active") # active, canceled, expired
    starts_at = Column(DateTime(timezone=True))
    ends_at = Column(DateTime(timezone=True))
    payment_transaction_id = Column(UUID(as_uuid=True), ForeignKey("payment_transactions.id"), nullable=True)
    auto_renew = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
