"""
Admin API routes — Giám sát hệ thống AI (AI Monitoring).
Cung cấp endpoint lấy log các lần gọi LLM, hỗ trợ lọc theo ngày.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.ai_logs import AILog
from app.api.deps import get_current_user, UserInfo, get_db
from app.api.schemas import AILogResponse, AIMonitoringResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ai-monitoring/logs", response_model=AIMonitoringResponse)
async def get_ai_monitoring_logs(
    time_filter: str = Query("7d", description="Bộ lọc thời gian: 'today', '7d', '30d'"),
    limit: int = Query(500, ge=1, le=10000, description="Số bản ghi tối đa trả về"),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Lấy danh sách AI request logs theo khoảng thời gian.
    Trả về danh sách logs và tổng số bản ghi.
    """
    now = datetime.now(timezone.utc)
    # Múi giờ Việt Nam UTC+7
    VN_OFFSET = timedelta(hours=7)

    if time_filter == "today":
        # Lấy đầu ngày hôm nay theo giờ VN (00:00:00 +07:00), đổi về UTC
        now_vn = now + VN_OFFSET
        start_of_today_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
        start = start_of_today_vn - VN_OFFSET
    elif time_filter == "7d":
        start = now - timedelta(days=7)
    elif time_filter == "30d":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=7)

    # Query logs
    query = db.query(AILog).filter(AILog.created_at >= start)
    total_count = query.count()

    logs = (
        query
        .order_by(AILog.created_at.desc())
        .limit(limit)
        .all()
    )

    # Convert to response
    log_responses = []
    for log in logs:
        log_responses.append(AILogResponse(
            id=str(log.id),
            at=log.created_at.isoformat() if log.created_at else "",
            user_id=str(log.user_id) if log.user_id else None,
            email=log.user_email or (str(log.user_id)[:8] + "..." if log.user_id else "system"),
            task=log.task_type or "",
            model=log.model_name or "",
            inputTokens=log.input_tokens or 0,
            outputTokens=log.output_tokens or 0,
            latencyMs=log.latency_ms or 0,
            success=log.success if log.success is not None else True,
            prompt=log.prompt,
            response=log.response,
            error_message=log.error_message,
            item_id=str(log.item_id) if log.item_id else None,
        ))

    return AIMonitoringResponse(
        logs=log_responses,
        total_count=total_count,
    )


@router.get("/ai-monitoring/summary")
async def get_ai_monitoring_summary(
    time_filter: str = Query("7d"),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Trả về tổng hợp nhanh (tổng request, tổng token, chi phí ước tính, avg latency)
    để FE có thể hiển thị KPI cards nhanh mà không cần tính toán phía client.
    """
    now = datetime.now(timezone.utc)
    VN_OFFSET = timedelta(hours=7)

    if time_filter == "today":
        now_vn = now + VN_OFFSET
        start_of_today_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
        start = start_of_today_vn - VN_OFFSET
    elif time_filter == "7d":
        start = now - timedelta(days=7)
    elif time_filter == "30d":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=7)

    result = db.query(
        func.count(AILog.id).label("total_requests"),
        func.coalesce(func.sum(AILog.input_tokens), 0).label("total_input_tokens"),
        func.coalesce(func.sum(AILog.output_tokens), 0).label("total_output_tokens"),
        func.coalesce(func.avg(AILog.latency_ms), 0).label("avg_latency"),
        func.count(AILog.id).filter(AILog.success == False).label("failed_count"),
    ).filter(AILog.created_at >= start).one()

    return {
        "total_requests": result.total_requests,
        "total_input_tokens": result.total_input_tokens,
        "total_output_tokens": result.total_output_tokens,
        "avg_latency_ms": round(float(result.avg_latency), 0),
        "failed_count": result.failed_count,
        "time_filter": time_filter,
    }

from app.api.middleware.admin_guard import get_admin_user as admin_guard

@router.get("/users")
async def get_admin_users(
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.admin_service import admin_service
    return await admin_service.list_users(db)

@router.patch("/users/{user_id}/ban")
async def ban_admin_user(
    user_id: str,
    payload: dict,
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.admin_service import admin_service
    is_banned = payload.get("banned", False)
    return await admin_service.update_user_status(user_id, is_banned)

@router.get("/notifications")
async def get_notifications(
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.notification_service import notification_service
    broadcasts = await notification_service.get_broadcasts(db)
    banners = await notification_service.get_banners(db)
    return {
        "broadcasts": broadcasts,
        "banners": banners
    }

@router.post("/notifications/broadcast")
async def create_broadcast(
    payload: dict,
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.notification_service import notification_service
    return await notification_service.create_broadcast(db, payload)

@router.post("/notifications/banner")
async def create_banner(
    payload: dict,
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.notification_service import notification_service
    return await notification_service.create_banner(db, payload)

@router.patch("/notifications/banner/{banner_id}/toggle")
async def toggle_banner(
    banner_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.notification_service import notification_service
    enabled = payload.get("enabled", False)
    return await notification_service.toggle_banner(db, banner_id, enabled)

@router.post("/notifications/preview")
async def preview_notification(
    payload: dict,
    admin: UserInfo = Depends(admin_guard),
):
    from app.services.gemini_preview_service import gemini_preview_service
    notif_type = payload.get("type")
    
    if notif_type == "broadcast":
        preview = await gemini_preview_service.preview_broadcast(payload)
        return {"preview": preview}
    elif notif_type == "banner":
        preview = await gemini_preview_service.preview_banner(payload)
        return {"preview": preview}
        
    raise HTTPException(status_code=400, detail="Loại preview không hợp lệ")

# ==========================================
# BILLING, FEEDBACK, AUDIT (PHASE 4)
# ==========================================

@router.get("/billing")
async def get_billing(
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    """
    Returns payment transactions, joined with subscription and plan info.
    """
    from app.services.admin_billing_service import get_billing_history
    try:
        return get_billing_history(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/feedback")
async def get_feedback(
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    """
    Returns all user feedbacks.
    """
    from app.services.admin_feedback_service import get_all_feedbacks
    try:
        return get_all_feedbacks(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateFeedbackStatusPayload(BaseModel):
    id: str
    status: str

@router.patch("/feedback")
async def update_feedback(
    payload: UpdateFeedbackStatusPayload,
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    """
    Update feedback status.
    """
    from app.services.admin_feedback_service import update_feedback_status
    try:
        success = update_feedback_status(db, payload.id, payload.status)
        if not success:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReplyFeedbackPayload(BaseModel):
    userId: str
    title: str
    content: str

@router.post("/feedback/reply")
async def reply_feedback(
    payload: ReplyFeedbackPayload,
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    """
    Send an in-app notification to a user as a reply to feedback.
    """
    from app.models.notifications import UserNotification
    import uuid
    try:
        notif = UserNotification(
            user_id=uuid.UUID(payload.userId),
            title=payload.title,
            content=payload.content,
            channel="In-app Notification"
        )
        db.add(notif)
        db.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/audit")
async def get_audit(
    event: Optional[str] = None,
    result: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    admin: UserInfo = Depends(admin_guard),
):
    """
    Returns auth audit logs.
    """
    from app.services.admin_audit_service import get_audit_logs
    try:
        limit = min(max(limit, 1), 1000)
        rows = get_audit_logs(db, limit=limit, event=event, result=result)
        return {"rows": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import Request

class AuditPayload(BaseModel):
    event: str
    email: Optional[str] = None
    success: Optional[bool] = None
    errorCode: Optional[str] = None
    device: Optional[str] = None

@router.post("/audit")
async def post_audit(
    payload: AuditPayload,
    request: Request,
    db: Session = Depends(get_db),
    # Use optional user so guests (failed logins) can also be logged
    current_user: Optional[UserInfo] = Depends(get_current_user)
):
    """
    Log an audit event (called from frontend on user actions).
    """
    from app.services.admin_audit_service import insert_audit_log
    try:
        if payload.event not in ["login", "register", "logout", "password_reset"]:
            raise HTTPException(status_code=400, detail="Invalid event")
            
        # Get IP and UserAgent
        ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        insert_audit_log(
            db=db,
            user_id=current_user.id if current_user else None,
            email=payload.email or (current_user.email if current_user else None),
            event=payload.event,
            success=payload.success if payload.success is not None else True,
            ip=ip,
            user_agent=user_agent,
            device=payload.device or "Unknown Device",
            error_code=payload.errorCode
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AUDIT_POST] Error: {e}")
        return {"ok": False, "logged": False, "error": str(e)}

