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
from app.api.deps import get_current_user, UserInfo
from app.api.schemas import AILogResponse, AIMonitoringResponse

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

