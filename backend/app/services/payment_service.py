import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.payment import Plan, PaymentTransaction, PaymentWebhook
from app.domain.payment.base import PaymentProvider
from app.domain.payment.zalopay import ZaloPayProvider
from app.domain.payment.momo import MoMoProvider
from app.domain.payment.vietqr import VietQRProvider
from app.services.subscription_service import SubscriptionService
from app.services.credit_service import grant_credits
from app.core.logging import logger

class PaymentService:
    def __init__(self):
        self.providers: Dict[str, PaymentProvider] = {
            "zalopay": ZaloPayProvider(),
            "momo": MoMoProvider(),
            "vietqr": VietQRProvider()
        }

    async def create_payment(self, db: Session, user_id: str, plan_code: str, billing_cycle: str, provider_name: str) -> Dict[str, Any]:
        provider = self.providers.get(provider_name.lower())
        if not provider:
            raise ValueError(f"Provider {provider_name} không được hỗ trợ")

        plan = db.query(Plan).filter(Plan.code == plan_code, Plan.is_active == True).first()
        if not plan:
            raise ValueError("Gói cước không tồn tại hoặc không còn hoạt động")

        amount = plan.price_yearly if billing_cycle == 'yearly' else plan.price_monthly
        if not amount or amount <= 0:
            raise ValueError("Giá gói cước không hợp lệ")

        now = datetime.now(timezone.utc)
        
        # Check for MoMo existing pending tx to avoid duplicate QR spam
        if provider_name.lower() == "momo":
            existing_tx = db.query(PaymentTransaction).filter(
                PaymentTransaction.user_id == uuid.UUID(str(user_id)),
                PaymentTransaction.provider == 'momo',
                PaymentTransaction.plan_id == plan.id,
                PaymentTransaction.billing_cycle == billing_cycle,
                PaymentTransaction.status == 'pending',
                PaymentTransaction.expired_at > now
            ).order_by(PaymentTransaction.created_at.desc()).first()

            if existing_tx and existing_tx.payment_url:
                return {
                    "success": True,
                    "order_url": existing_tx.payment_url,
                    "order_code": existing_tx.order_code,
                    "reused": True
                }
            
            # Expire old ones
            db.query(PaymentTransaction).filter(
                PaymentTransaction.user_id == uuid.UUID(str(user_id)),
                PaymentTransaction.provider == 'momo',
                PaymentTransaction.status == 'pending',
                PaymentTransaction.expired_at < now
            ).update({"status": "expired", "updated_at": now})
            db.commit()

        # Generate order code
        if provider_name.lower() == "momo":
            import random, string
            rand_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            order_code = f"NEXUS-{rand_str}"
        elif provider_name.lower() == "vietqr":
            import random
            rand_str = ''.join(random.choices(string.digits, k=6))
            order_code = f"VQR-{rand_str}"
        else: # zalopay
            import time
            order_code = f"ORD-{int(time.time() * 1000)}"

        expired_at = now + timedelta(minutes=15) if provider_name.lower() == "momo" else None

        tx = PaymentTransaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(str(user_id)),
            plan_id=plan.id,
            provider=provider_name.lower(),
            billing_cycle=billing_cycle,
            order_code=order_code,
            amount=amount,
            status="pending",
            expired_at=expired_at,
            metadata_={
                "plan_code": plan.code,
                "plan_name": plan.name
            }
        )
        db.add(tx)
        db.commit()

        try:
            result = await provider.create_order(tx, user_id, plan)
            
            tx.provider_order_id = result.get("provider_order_id")
            tx.payment_url = result.get("order_url")
            tx.qr_code = result.get("qr_code")
            meta = tx.metadata_ or {}
            meta[f"{provider_name.lower()}_response"] = result.get("raw_response")
            tx.metadata_ = meta
            tx.updated_at = datetime.now(timezone.utc)
            db.commit()

            return {
                "success": True,
                "order_url": tx.payment_url,
                "order_code": tx.order_code,
                "app_trans_id": result.get("app_trans_id"), # ZaloPay specific
                "qr_code": tx.qr_code,
                "reused": False
            }
        except Exception as e:
            tx.status = "failed"
            meta = tx.metadata_ or {}
            meta["error"] = str(e)
            tx.metadata_ = meta
            tx.updated_at = datetime.now(timezone.utc)
            db.commit()
            raise e

    async def handle_webhook(self, db: Session, provider_name: str, payload: Any, signature: Optional[str] = None) -> Dict[str, Any]:
        provider = self.providers.get(provider_name.lower())
        if not provider:
            return {"error": f"Provider {provider_name} không được hỗ trợ"}

        if not provider.verify_webhook(payload, signature):
            logger.error(f"[{provider_name.upper()}_WEBHOOK] Invalid signature")
            return {"error": "Invalid signature"}

        parsed = provider.parse_webhook(payload)
        order_code = parsed.get("order_code")

        if not order_code:
            webhook_log = PaymentWebhook(
                id=uuid.uuid4(),
                provider=provider_name.lower(),
                payload=payload,
                signature=signature,
                status="ignored"
            )
            db.add(webhook_log)
            db.commit()
            return {"success": True, "message": parsed.get("error_message", "ignored")}

        tx = db.query(PaymentTransaction).filter(PaymentTransaction.order_code == order_code).first()
        if not tx:
            webhook_log = PaymentWebhook(
                id=uuid.uuid4(),
                provider=provider_name.lower(),
                payload=payload,
                signature=signature,
                status="failed"
            )
            db.add(webhook_log)
            db.commit()
            return {"error": "Transaction not found"}

        if tx.status == "paid":
            return {"success": True, "message": "already processed"}

        if float(tx.amount) != float(parsed.get("amount", 0)):
            webhook_log = PaymentWebhook(
                id=uuid.uuid4(),
                provider=provider_name.lower(),
                transaction_id=tx.id,
                payload=payload,
                signature=signature,
                status="failed"
            )
            db.add(webhook_log)
            db.commit()
            return {"error": "Amount mismatch"}

        # Log received
        webhook_log = PaymentWebhook(
            id=uuid.uuid4(),
            provider=provider_name.lower(),
            transaction_id=tx.id,
            payload=payload,
            signature=signature,
            status="received"
        )
        db.add(webhook_log)
        db.commit()

        meta = tx.metadata_ or {}
        meta[f"{provider_name.lower()}_callback"] = parsed.get("raw_payload")

        if parsed.get("is_success"):
            now = datetime.now(timezone.utc)
            tx.status = "paid"
            tx.provider_transaction_id = parsed.get("provider_transaction_id")
            tx.paid_at = now
            tx.updated_at = now
            tx.metadata_ = meta
            
            # Activate subscription
            try:
                SubscriptionService.activate_subscription(db, str(tx.user_id), str(tx.plan_id), tx.billing_cycle, str(tx.id))
                
                # Grant credits
                amount_usd = 5.0 if tx.billing_cycle == 'monthly' else 50.0
                desc = f"Nạp tiền qua {provider_name} - {tx.billing_cycle}"
                grant_credits(str(tx.user_id), amount_usd, desc, tx.order_code)
                
            except Exception as e:
                logger.error(f"[{provider_name.upper()}_WEBHOOK_ACTIVATE_ERROR] {e}")
                meta["activation_error"] = str(e)
                tx.metadata_ = meta

            webhook_log.status = "processed"
            db.commit()
            return {"success": True, "message": "success"}
        else:
            now = datetime.now(timezone.utc)
            tx.status = "failed"
            tx.updated_at = now
            meta["error"] = parsed.get("error_message")
            tx.metadata_ = meta
            webhook_log.status = "processed"
            db.commit()
            return {"success": True, "message": "failed payment updated"}


