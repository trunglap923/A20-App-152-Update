from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.admin import UserFeedback
from app.infrastructure.supabase.auth_admin import supabase_admin_client

def get_all_feedbacks(db: Session) -> list:
    """
    Fetch all user feedback and map with user emails from Supabase Auth.
    """
    feedbacks = db.query(UserFeedback).order_by(desc(UserFeedback.created_at)).all()
    
    # Get distinct user_ids
    user_ids = list({fb.user_id for fb in feedbacks if fb.user_id})
    
    # Fetch user emails and names
    user_data = {}
    if user_ids:
        try:
            auth_users = supabase_admin_client.auth.admin.list_users()
            for u in auth_users.users:
                name = u.user_metadata.get("full_name") or u.user_metadata.get("name") or "Unknown"
                user_data[u.id] = {
                    "email": u.email,
                    "name": name
                }
        except Exception as e:
            print(f"[ADMIN_FEEDBACK_SERVICE] Error fetching auth users: {e}")

    result = []
    for fb in feedbacks:
        ud = user_data.get(fb.user_id, {})
        result.append({
            "id": str(fb.id),
            "user_id": fb.user_id,
            "content": fb.content,
            "status": fb.status,
            "created_at": fb.created_at.isoformat() if fb.created_at else None,
            "userEmail": ud.get("email", "Khách (Chưa đăng nhập)"),
            "userName": ud.get("name", "Unknown")
        })
        
    return result

def update_feedback_status(db: Session, feedback_id: str, status: str) -> bool:
    """
    Update status of a feedback.
    """
    updated = db.query(UserFeedback).filter(UserFeedback.id == feedback_id).update({"status": status})
    db.commit()
    return updated > 0
