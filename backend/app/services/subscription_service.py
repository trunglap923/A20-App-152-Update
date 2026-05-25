from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
import uuid

from app.models.payment import Subscription

class SubscriptionService:
    @staticmethod
    def activate_subscription(db: Session, user_id: str, plan_id: str, billing_cycle: str, transaction_id: str):
        now = datetime.now(timezone.utc)
        
        if billing_cycle == 'yearly':
            ends_at = now + timedelta(days=365)
        else:
            ends_at = now + timedelta(days=30)
            
        existing_sub = db.query(Subscription).filter(
            Subscription.user_id == uuid.UUID(str(user_id)),
            Subscription.status == 'active'
        ).first()

        if existing_sub:
            existing_sub.plan_id = uuid.UUID(str(plan_id))
            existing_sub.billing_cycle = billing_cycle
            existing_sub.starts_at = now
            existing_sub.ends_at = ends_at
            existing_sub.payment_transaction_id = uuid.UUID(str(transaction_id))
            existing_sub.updated_at = now
        else:
            new_sub = Subscription(
                id=uuid.uuid4(),
                user_id=uuid.UUID(str(user_id)),
                plan_id=uuid.UUID(str(plan_id)),
                billing_cycle=billing_cycle,
                status='active',
                starts_at=now,
                ends_at=ends_at,
                payment_transaction_id=uuid.UUID(str(transaction_id)),
                auto_renew=False
            )
            db.add(new_sub)
        
        db.commit()
