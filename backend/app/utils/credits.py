"""
Credit Deduction Utility for AI Usage.

Quy đổi cố định: 1 credit = 0.002 USD
credits_used = ceil(actual_cost_usd / 0.002)

Ghi trực tiếp vào bảng user_credits và credit_transactions qua SQLAlchemy.
"""

import math
import uuid
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


# ─── Fixed credit rate ────────────────────────────────────────────
CREDIT_RATE_USD = 0.002

# ─── Model pricing per token (USD) ───────────────────────────────
# Format: { input: USD per 1 token, output: USD per 1 token }
MODEL_PRICING = {
    # OpenAI
    "gpt-4o":           {"input": 2.50 / 1e6,  "output": 10.00 / 1e6},
    "gpt-4o-mini":      {"input": 0.15 / 1e6,  "output": 0.60  / 1e6},
    "gpt-4-turbo":      {"input": 10.00 / 1e6, "output": 30.00 / 1e6},
    "gpt-4":            {"input": 30.00 / 1e6, "output": 60.00 / 1e6},
    "gpt-3.5-turbo":    {"input": 0.50  / 1e6, "output": 1.50  / 1e6},
    "o1":               {"input": 15.00 / 1e6, "output": 60.00 / 1e6},
    "o1-mini":          {"input": 3.00  / 1e6, "output": 12.00 / 1e6},
    "o3-mini":          {"input": 1.10  / 1e6, "output": 4.40  / 1e6},

    # Google Gemini
    "gemini-1.5-pro":       {"input": 1.25  / 1e6, "output": 5.00  / 1e6},
    "gemini-1.5-flash":     {"input": 0.075 / 1e6, "output": 0.30  / 1e6},
    "gemini-2.0-flash":     {"input": 0.10  / 1e6, "output": 0.40  / 1e6},
    "gemini-2.5-flash":     {"input": 0.15  / 1e6, "output": 0.60  / 1e6},
    "gemini-2.5-pro":       {"input": 1.25  / 1e6, "output": 10.00 / 1e6},

    # Anthropic Claude
    "claude-3-opus":        {"input": 15.00 / 1e6, "output": 75.00 / 1e6},
    "claude-3-sonnet":      {"input": 3.00  / 1e6, "output": 15.00 / 1e6},
    "claude-3-haiku":       {"input": 0.25  / 1e6, "output": 1.25  / 1e6},
    "claude-3.5-sonnet":    {"input": 3.00  / 1e6, "output": 15.00 / 1e6},
    "claude-3.5-haiku":     {"input": 0.80  / 1e6, "output": 4.00  / 1e6},
    "claude-4-sonnet":      {"input": 3.00  / 1e6, "output": 15.00 / 1e6},
    "claude-4-opus":        {"input": 15.00 / 1e6, "output": 75.00 / 1e6},

    # xAI Grok
    "grok-2":           {"input": 2.00  / 1e6, "output": 10.00 / 1e6},
    "grok-3":           {"input": 3.00  / 1e6, "output": 15.00 / 1e6},
    "grok-3-mini":      {"input": 0.30  / 1e6, "output": 0.50  / 1e6},

    # Whisper — fixed cost per call, not token-based
    "whisper-1":        {"input": 0, "output": 0},
}

DEFAULT_PRICING = {"input": 0.15 / 1e6, "output": 0.60 / 1e6}

# Fixed cost for non-token models (USD per call)
FIXED_COST_MODELS = {
    "whisper-1": 0.006,  # ~$0.006/minute
}


def _find_model_pricing(model_name: str) -> dict:
    """Find best matching pricing. Handles versioned names like 'gpt-4o-mini-2024-07-18'."""
    normalized = model_name.lower().strip()

    if normalized in MODEL_PRICING:
        return MODEL_PRICING[normalized]

    # Prefix match (longest key first)
    for key in sorted(MODEL_PRICING.keys(), key=len, reverse=True):
        if normalized.startswith(key):
            return MODEL_PRICING[key]

    return DEFAULT_PRICING


def calculate_cost_usd(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate actual USD cost from token usage and model name."""
    normalized = model_name.lower().strip()

    # Check fixed-cost models first
    if normalized in FIXED_COST_MODELS:
        return FIXED_COST_MODELS[normalized]

    pricing = _find_model_pricing(model_name)
    return (input_tokens * pricing["input"]) + (output_tokens * pricing["output"])


def usd_to_credits(cost_usd: float) -> int:
    """Convert USD cost to credits. Always ceil, minimum 1 if cost > 0."""
    if cost_usd <= 0:
        return 0
    return math.ceil(cost_usd / CREDIT_RATE_USD)


def check_user_balance(user_id: str, required_credits: int = 1) -> bool:
    """Check if user has at least `required_credits`."""
    try:
        from app.db.session import engine
        with Session(engine) as session:
            result = session.execute(
                text("SELECT balance FROM user_credits WHERE user_id = :uid"),
                {"uid": user_id}
            ).fetchone()
            
            if not result:
                return True  # New users get 50 free credits upon first use
                
            balance = float(result[0])
            return balance >= required_credits
    except Exception as e:
        print(f"[CREDITS] Error checking balance for {user_id}: {e}")
        return False


def deduct_credits_by_usd(
    user_id: str,
    task_type: str,
    actual_cost_usd: float,
    description_override: Optional[str] = None,
    metadata_override: Optional[dict] = None,
) -> dict:
    """Core logic to apply ceil() to actual_cost_usd and deduct once."""
    try:
        from app.db.session import engine

        credits_used = usd_to_credits(actual_cost_usd)
        if credits_used <= 0:
            return {"success": True, "credits_used": 0, "actual_cost_usd": 0, "new_balance": -1}

        now = datetime.now(timezone.utc)

        with Session(engine) as session:
            # 1. Get current balance
            result = session.execute(
                text("SELECT balance, total_used FROM user_credits WHERE user_id = :uid"),
                {"uid": user_id}
            ).fetchone()

            if not result:
                # Default 50 credits for new free users
                session.execute(
                    text("""
                        INSERT INTO user_credits (user_id, balance, total_purchased, total_used, created_at, updated_at)
                        VALUES (:uid, 50, 0, 0, :now, :now)
                    """),
                    {"uid": user_id, "now": now}
                )
                session.commit()
                current_balance = 50.0
                current_used = 0.0
            else:
                current_balance = float(result[0])
                current_used = float(result[1])

            # 2. Deduct (Zero-Bound to prevent negative balance)
            new_balance = max(0.0, current_balance - credits_used)
            new_used = current_used + credits_used

            session.execute(
                text("""
                    UPDATE user_credits
                    SET balance = :balance, total_used = :used, updated_at = :now
                    WHERE user_id = :uid
                """),
                {"balance": new_balance, "used": new_used, "now": now, "uid": user_id}
            )

            # 4. Record transaction
            tx_id = str(uuid.uuid4())
            description = description_override or f"AI: {task_type} — ${actual_cost_usd:.6f}"
            metadata = metadata_override or {
                "actual_cost_usd": actual_cost_usd,
                "credit_rate_usd": CREDIT_RATE_USD,
                "task_type": task_type,
            }

            session.execute(
                text("""
                    INSERT INTO credit_transactions
                    (id, user_id, amount, balance_after, transaction_type, description,
                     payment_reference, ai_log_id, metadata, created_at)
                    VALUES (:id, :uid, :amount, :balance_after, 'usage', :description,
                            NULL, NULL, CAST(:metadata AS jsonb), :now)
                """),
                {
                    "id": tx_id,
                    "uid": user_id,
                    "amount": -credits_used,
                    "balance_after": new_balance,
                    "description": description,
                    "metadata": json.dumps(metadata),
                    "now": now,
                }
            )
            session.commit()

        print(f"[CREDITS] Deducted {credits_used} credits from user {user_id} (task={task_type}, cost=${actual_cost_usd:.6f}, balance={new_balance})")
        return {"success": True, "credits_used": credits_used, "actual_cost_usd": actual_cost_usd, "new_balance": new_balance}

    except Exception as e:
        error_msg = str(e)
        if "Insufficient credits" in error_msg:
            print(f"[CREDITS] ⚠ Insufficient credits for user {user_id}: {error_msg}")
            raise
        print(f"[CREDITS] WARNING: Credit deduction failed: {e}")
        return {"success": False, "error": error_msg}


def deduct_credits_for_ai(
    user_id: str,
    task_type: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    ai_log_id: Optional[str] = None,
    item_title: Optional[str] = None,
) -> dict:
    """Convenience function for a single AI task deduction (e.g., chat, slides)."""
    actual_cost_usd = calculate_cost_usd(model_name, input_tokens, output_tokens)
    
    if item_title:
        description = f"Xử lý tài liệu: {item_title} (Chat) — ${actual_cost_usd:.6f}"
    else:
        description = f"AI: {task_type} ({model_name}) — ${actual_cost_usd:.6f}"
        
    metadata = {
        "actual_cost_usd": actual_cost_usd,
        "credit_rate_usd": CREDIT_RATE_USD,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "model_name": model_name,
        "task_type": task_type,
        "ai_log_id": ai_log_id,
    }
    return deduct_credits_by_usd(user_id, task_type, actual_cost_usd, description, metadata)


def deduct_total_pipeline_cost(
    item_id: str,
    user_id: str,
    start_time: datetime,
    pipeline_name: str = "Document Processing",
    item_title: Optional[str] = None
):
    """
    Sums up all AI costs for an item generated after `start_time`,
    calculates the total USD, and deducts credits using a SINGLE ceil() operation.
    This prevents the user from being overcharged for multiple parallel chunks.
    """
    try:
        from app.db.session import engine
        from sqlalchemy.orm import Session
        
        with Session(engine) as session:
            res = session.execute(
                text("""
                    SELECT model_name, SUM(input_tokens), SUM(output_tokens)
                    FROM ai_logs
                    WHERE item_id = :item_id AND created_at >= :start_time
                    GROUP BY model_name
                """), 
                {"item_id": item_id, "start_time": start_time}
            ).fetchall()

        if not res:
            return

        total_usd = 0.0
        details = []
        for row in res:
            model_name = row[0]
            inp = int(row[1])
            out = int(row[2])
            cost = calculate_cost_usd(model_name, inp, out)
            total_usd += cost
            details.append({"model": model_name, "input": inp, "output": out, "cost": cost})

        if total_usd > 0:
            if item_title:
                description = f"Xử lý tài liệu: {item_title}"
            else:
                description = f"AI: {pipeline_name} — ${total_usd:.6f}"
            metadata = {
                "actual_cost_usd": total_usd,
                "credit_rate_usd": CREDIT_RATE_USD,
                "task_type": pipeline_name,
                "details": details
            }
            deduct_credits_by_usd(user_id, pipeline_name, total_usd, description, metadata)

    except Exception as e:
        print(f"[CREDITS] Failed to calculate total pipeline cost: {e}")
