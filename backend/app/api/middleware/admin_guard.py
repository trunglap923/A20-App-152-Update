import os
from fastapi import Depends, HTTPException, status
from app.api.deps import get_current_user, UserInfo
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db
from app.core.logging import logger

def get_admin_emails() -> list[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]

def get_admin_user(current_user: UserInfo = Depends(get_current_user), db: Session = Depends(get_db)) -> UserInfo:
    """
    Middleware / Dependency: Check if the current user is an admin.
    Returns UserInfo if admin, raises 403 otherwise.
    """
    admin_emails = get_admin_emails()
    
    # Check if the user's email is in the admin list
    if current_user.email and current_user.email.lower() in admin_emails:
        return current_user
        
    # Check if the user has an admin role in user_profiles
    try:
        # Supabase user_profiles table is typically in public schema
        result = db.execute(
            text("SELECT role FROM user_profiles WHERE id = :uid"),
            {"uid": str(current_user.id)}
        ).fetchone()
        
        if result and result[0] and result[0].lower() == 'admin':
            return current_user
    except Exception as e:
        logger.error(f"Error checking user profile for admin role: {e}")
        # Not all systems have user_profiles, it's fine if it fails
        pass

    logger.warning(f"Unauthorized admin access attempt by user {current_user.id}")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Quyền truy cập bị từ chối. Cần quyền Quản trị viên."
    )
