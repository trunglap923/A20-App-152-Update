from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.payment import PaymentTransaction, Subscription, Plan
from app.infrastructure.supabase.auth_admin import supabase_admin_client

def get_billing_history(db: Session) -> list:
    """
    Fetch payment transactions joined with subscriptions and plans,
    then fetch user emails from Supabase Auth to map to the results.
    """
    transactions = db.query(
        PaymentTransaction,
        Subscription,
        Plan
    ).outerjoin(
        Subscription, PaymentTransaction.subscription_id == Subscription.id
    ).outerjoin(
        Plan, Subscription.plan_id == Plan.id
    ).order_by(
        desc(PaymentTransaction.created_at)
    ).all()

    # Get distinct user_ids
    user_ids = list({t.PaymentTransaction.user_id for t in transactions if t.PaymentTransaction.user_id})
    
    # Fetch user emails
    user_emails = {}
    if user_ids:
        try:
            from gotrue.errors import AuthError
            auth_users = supabase_admin_client.auth.admin.list_users()
            for u in auth_users.users:
                user_emails[u.id] = u.email
        except Exception as e:
            print(f"[ADMIN_BILLING_SERVICE] Error fetching auth users: {e}")

    formatted = []
    for t in transactions:
        pt = t.PaymentTransaction
        sub = t.Subscription
        plan = t.Plan
        
        email = user_emails.get(pt.user_id, "Unknown")
        description = f"Thanh toán gói {plan.name}" if plan and plan.name else "Thanh toán subscription"
        
        formatted.append({
            "id": str(pt.id),
            "created_at": pt.created_at.isoformat() if pt.created_at else None,
            "amount": float(pt.amount) if pt.amount else 0,
            "provider": pt.provider or "unknown",
            "status": pt.status or "pending",
            "user_email": email,
            "description": description
        })
        
    return formatted
