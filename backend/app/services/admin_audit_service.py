from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.admin import AuthAuditLog

def get_audit_logs(db: Session, limit: int = 200, event: str = None, result: str = None) -> list:
    """
    Fetch audit logs based on filters.
    """
    query = db.query(AuthAuditLog)
    
    if event:
        query = query.filter(AuthAuditLog.event == event)
    
    if result == "success":
        query = query.filter(AuthAuditLog.success == True)
    elif result == "failed":
        query = query.filter(AuthAuditLog.success == False)
        
    logs = query.order_by(desc(AuthAuditLog.created_at)).limit(limit).all()
    
    return [
        {
            "id": str(log.id),
            "createdAt": log.created_at.isoformat() if log.created_at else None,
            "email": log.email or "-",
            "event": log.event,
            "ip": log.ip or "-",
            "userAgent": log.user_agent or "-",
            "device": log.device,
            "success": log.success
        }
        for log in logs
    ]

def insert_audit_log(
    db: Session,
    user_id: str = None,
    email: str = None,
    event: str = None,
    success: bool = True,
    ip: str = None,
    user_agent: str = None,
    device: str = None,
    error_code: str = None
) -> AuthAuditLog:
    """
    Insert a new audit log.
    """
    log = AuthAuditLog(
        user_id=user_id,
        email=email,
        event=event,
        success=success,
        ip=ip,
        user_agent=user_agent,
        device=device,
        error_code=error_code
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
