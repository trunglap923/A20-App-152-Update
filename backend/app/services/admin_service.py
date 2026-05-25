import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.infrastructure.supabase.auth_admin import supabase_admin
from app.models.payment import Subscription, PaymentTransaction, Plan
from typing import List, Dict, Any
from app.core.logging import logger

class AdminService:
    @staticmethod
    async def list_users(db: Session) -> List[Dict[str, Any]]:
        """
        Fetch users from Supabase Auth and join with subscriptions and payments from the DB.
        """
        try:
            # 1. Fetch users from Supabase Auth Admin
            auth_users = await supabase_admin.list_users()
            
            # 2. Fetch active subscriptions and plans
            active_subs = db.query(Subscription, Plan).join(Plan, Subscription.plan_id == Plan.id).filter(Subscription.status == 'active').all()
            
            # Group active subs by user_id
            user_subs = {}
            for sub, plan in active_subs:
                user_id_str = str(sub.user_id)
                user_subs[user_id_str] = plan.code

            # 3. Fetch payment totals
            payment_totals = db.query(
                PaymentTransaction.user_id,
                func.sum(PaymentTransaction.amount).label('total_paid')
            ).filter(PaymentTransaction.status == 'paid').group_by(PaymentTransaction.user_id).all()
            
            user_payments = {str(pt.user_id): float(pt.total_paid) for pt in payment_totals}

            # 4. Map everything together
            result = []
            for user in auth_users:
                user_id = user.get("id")
                email = user.get("email", "")
                metadata = user.get("user_metadata", {})
                
                full_name = metadata.get("full_name") or metadata.get("name") or "Unknown User"
                avatar_url = metadata.get("avatar_url")
                
                created_at = user.get("created_at")
                last_sign_in_at = user.get("last_sign_in_at") or created_at
                
                banned_until = user.get("banned_until")
                status = "suspended" if banned_until else "active"
                
                plan_code = user_subs.get(user_id, "free")
                total_paid = user_payments.get(user_id, 0.0)
                usage_score = min(100, int(total_paid / 10000))

                result.append({
                    "id": user_id,
                    "fullName": full_name,
                    "email": email,
                    "avatarUrl": avatar_url,
                    "registeredAt": created_at,
                    "lastLoginAt": last_sign_in_at,
                    "status": status,
                    "plan": plan_code,
                    "totalPaidVnd": total_paid,
                    "usageScore": usage_score
                })
                
            return result
        except Exception as e:
            logger.error(f"Error in list_users: {e}")
            raise e

    @staticmethod
    async def update_user_status(user_id: str, is_banned: bool) -> Dict[str, Any]:
        """Ban or unban a user."""
        # 'none' unbans in Supabase API, or we can just omit it
        # The Supabase UI uses something like "100000h" for permanent ban
        banned_until = "87600h" if is_banned else "none" 
        return await supabase_admin.update_user_ban_status(user_id, banned_until)

admin_service = AdminService()
