from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
import uuid
from typing import Dict, Any

from app.db.session import get_db
from app.api.deps import get_current_user, UserInfo
from app.services.credit_service import get_user_credits
from app.models.notifications import UserNotification, Banner

router = APIRouter(prefix="/user", tags=["user"])

@router.get("/credits")
async def get_my_credits(
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Returns current credit balance, totals, and recent transactions for the user.
    """
    return get_user_credits(str(current_user.id))

@router.get("/notifications")
async def get_my_notifications(
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Returns recent notifications for the user.
    """
    notifications = db.query(UserNotification)\
        .filter(UserNotification.user_id == current_user.id)\
        .order_by(desc(UserNotification.created_at))\
        .limit(30)\
        .all()
        
    unread_count = sum(1 for n in notifications if not n.is_read)
    
    return {
        "notifications": [
            {
                "id": str(n.id),
                "title": n.title,
                "content": n.content,
                "channel": n.channel,
                "isRead": n.is_read,
                "createdAt": n.created_at.isoformat() if n.created_at else None
            }
            for n in notifications
        ],
        "unreadCount": unread_count
    }

@router.patch("/notifications")
async def mark_notifications_read(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Mark a specific notification or all notifications as read.
    """
    mark_all = payload.get("markAll", False)
    notif_id = payload.get("id")
    
    if mark_all:
        db.query(UserNotification)\
            .filter(UserNotification.user_id == current_user.id, UserNotification.is_read == False)\
            .update({"is_read": True})
        db.commit()
        return {"ok": True}
        
    if not notif_id:
        raise HTTPException(status_code=400, detail="Invalid payload")
        
    try:
        notif_uuid = uuid.UUID(notif_id)
        updated = db.query(UserNotification)\
            .filter(UserNotification.id == notif_uuid, UserNotification.user_id == current_user.id)\
            .update({"is_read": True})
        db.commit()
        if updated == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"ok": True}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

@router.get("/banners")
async def get_active_banners(
    db: Session = Depends(get_db),
):
    """
    Returns active banners. Public endpoint, no auth required.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    # Auto disable out of date banners (fire and forget basically, or we can just filter them out)
    db.query(Banner)\
        .filter(Banner.enabled == True)\
        .filter((Banner.start_date > now) | (Banner.end_date < now))\
        .update({"enabled": False})
    db.commit()
    
    banners = db.query(Banner)\
        .filter(Banner.enabled == True)\
        .filter(Banner.start_date <= now)\
        .filter(Banner.end_date >= now)\
        .order_by(desc(Banner.created_at))\
        .limit(20)\
        .all()
        
    return {
        "banners": [
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
    }
