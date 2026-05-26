from sqlalchemy.orm import Session
from sqlalchemy import desc
import uuid
from typing import List, Dict, Any, Optional
from app.models.notifications import BroadcastCampaign, UserNotification, Banner
from app.infrastructure.email.smtp import SmtpAdapter
from app.infrastructure.email.resend import ResendAdapter
from app.infrastructure.supabase.auth_admin import supabase_admin
from app.core.logging import logger
import asyncio

class NotificationService:
    def __init__(self):
        # We can detect which email adapter to use
        self.resend = ResendAdapter()
        self.smtp = SmtpAdapter()
        self.email_sender = self.resend if self.resend.is_configured() else self.smtp

    async def get_broadcasts(self, db: Session) -> List[Dict[str, Any]]:
        try:
            campaigns = db.query(BroadcastCampaign).order_by(desc(BroadcastCampaign.created_at)).all()
        except Exception as e:
            db.rollback()
            logger.warning(f"Failed to fetch broadcast campaigns: {e}")
            return []
        return [
            {
                "id": str(c.id),
                "campaign": c.campaign_name,
                "audience": c.audience,
                "channel": c.channel,
                "sentAt": c.sent_at.isoformat() if c.sent_at else None,
                "status": c.status,
                "openRate": c.open_rate or 0
            }
            for c in campaigns
        ]

    async def get_banners(self, db: Session) -> List[Dict[str, Any]]:
        try:
            banners = db.query(Banner).order_by(desc(Banner.created_at)).all()
        except Exception as e:
            db.rollback()
            logger.warning(f"Failed to fetch banners: {e}")
            return []
        return [
            {
                "id": str(b.id),
                "placement": b.placement,
                "type": b.type,
                "content": b.content,
                "ctaText": b.cta_text,
                "ctaLink": b.cta_link,
                "startDate": b.start_date.isoformat() if b.start_date else None,
                "endDate": b.end_date.isoformat() if b.end_date else None,
                "enabled": b.enabled,
                "ctr": b.ctr or 0
            }
            for b in banners
        ]

    async def _get_target_users(self, audience: str) -> List[Dict[str, Any]]:
        """Fetch users from Supabase matching the audience."""
        try:
            users = await supabase_admin.list_users()
        except Exception as e:
            logger.error(f"Failed to list users for broadcast: {e}")
            return []

        # Map to common structure
        mapped_users = []
        for u in users:
            email = u.get("email", "").strip()
            if not email:
                continue
            metadata = u.get("user_metadata", {})
            full_name = metadata.get("full_name") or metadata.get("name") or "Bạn"
            mapped_users.append({
                "userId": u.get("id"),
                "email": email,
                "fullName": full_name,
                "lastSignInAt": u.get("last_sign_in_at")
            })

        # Apply simple audience filtering
        if audience == "User đang hoạt động":
            import datetime
            from datetime import timezone
            now = datetime.datetime.now(timezone.utc)
            active_users = []
            for u in mapped_users:
                last_sign_in = u.get("lastSignInAt")
                if last_sign_in:
                    try:
                        # Supabase dates are ISO8601
                        dt = datetime.datetime.fromisoformat(last_sign_in.replace('Z', '+00:00'))
                        if (now - dt).days <= 30:
                            active_users.append(u)
                    except ValueError:
                        pass
            return active_users
        
        # We assume "Tất cả user" and others fallback to all users for now
        # Subscriptions check could be done querying DB here but let's keep it simple for MVP
        return mapped_users

    async def create_broadcast(self, db: Session, payload: dict) -> Dict[str, Any]:
        from datetime import datetime, timezone
        
        channel = payload.get("channel")
        audience = payload.get("audience")
        title = payload.get("title")
        content = payload.get("content")
        action = payload.get("action", "send_now")

        # Create campaign record
        campaign = BroadcastCampaign(
            campaign_name=title[:50],
            audience=audience,
            channel=channel,
            sent_at=datetime.now(timezone.utc) if action == "send_now" else None,
            status="Đang gửi" if action == "send_now" else "Lên lịch"
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        if action == "send_now":
            # Fire and forget sending in background or synchronously for now
            # In a real system, this goes to Celery/ARQ
            asyncio.create_task(self._process_broadcast(campaign.id, audience, channel, title, content))

        return {"ok": True, "campaign_id": str(campaign.id)}

    async def _process_broadcast(self, campaign_id: uuid.UUID, audience: str, channel: str, title: str, content: str):
        from app.db.session import SessionLocal
        users = await self._get_target_users(audience)
        
        db = SessionLocal()
        try:
            if channel in ["In-app Notification", "Push Notification"]:
                # Insert to user_notifications
                notifications = []
                for u in users:
                    personalized_content = content.replace("{{tên_user}}", u["fullName"])
                    notifications.append(
                        UserNotification(
                            user_id=uuid.UUID(u["userId"]),
                            campaign_id=campaign_id,
                            title=title,
                            content=personalized_content,
                            channel=channel
                        )
                    )
                if notifications:
                    db.bulk_save_objects(notifications)
                    db.commit()

            elif channel == "Email":
                # Send emails
                for u in users:
                    personalized_content = content.replace("{{tên_user}}", u["fullName"])
                    # Simple HTML wrap
                    html_content = f"<html><body><p>{personalized_content.replace(chr(10), '<br>')}</p></body></html>"
                    await self.email_sender.send_email(
                        to_email=u["email"],
                        subject=title,
                        text=personalized_content,
                        html=html_content
                    )

            # Mark campaign as sent
            campaign = db.query(BroadcastCampaign).filter(BroadcastCampaign.id == campaign_id).first()
            if campaign:
                campaign.status = "Đã gửi"
                db.commit()
        except Exception as e:
            logger.error(f"Broadcast failed: {e}")
            campaign = db.query(BroadcastCampaign).filter(BroadcastCampaign.id == campaign_id).first()
            if campaign:
                campaign.status = "Lỗi"
                db.commit()
        finally:
            db.close()

    async def create_banner(self, db: Session, payload: dict) -> Dict[str, Any]:
        from datetime import datetime
        start_date = datetime.fromisoformat(payload["startDate"].replace('Z', '+00:00')) if "startDate" in payload else None
        end_date = datetime.fromisoformat(payload["endDate"].replace('Z', '+00:00')) if "endDate" in payload else None
        
        banner = Banner(
            placement=payload.get("placement"),
            type=payload.get("bannerType"),
            content=payload.get("content"),
            cta_text=payload.get("ctaText"),
            cta_link=payload.get("ctaLink"),
            start_date=start_date,
            end_date=end_date,
            enabled=True
        )
        db.add(banner)
        db.commit()
        return {"ok": True, "banner_id": str(banner.id)}

    async def toggle_banner(self, db: Session, banner_id: str, enabled: bool) -> Dict[str, Any]:
        banner = db.query(Banner).filter(Banner.id == uuid.UUID(banner_id)).first()
        if not banner:
            return {"error": "Banner not found"}
        banner.enabled = enabled
        db.commit()
        return {"ok": True}

notification_service = NotificationService()
