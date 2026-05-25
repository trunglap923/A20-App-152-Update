from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Dict, Any

from app.db.session import get_db
from app.api.deps import get_current_user, UserInfo
from app.services.payment_service import PaymentService
from app.core.logging import logger

router = APIRouter(prefix="/payment", tags=["payment"])
payment_service = PaymentService()

@router.post("/{provider}/create")
async def create_payment(
    provider: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Tạo đơn thanh toán mới qua provider.
    Body payload: {"plan_code": "PRO", "billing_cycle": "monthly"}
    """
    plan_code = payload.get("plan_code")
    billing_cycle = payload.get("billing_cycle")

    if not plan_code or not billing_cycle:
        raise HTTPException(status_code=400, detail="Thiếu plan_code hoặc billing_cycle")
    
    if billing_cycle not in ['monthly', 'yearly']:
        raise HTTPException(status_code=400, detail="billing_cycle không hợp lệ")

    try:
        result = await payment_service.create_payment(
            db=db,
            user_id=str(current_user.id),
            plan_code=plan_code,
            billing_cycle=billing_cycle,
            provider_name=provider
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[{provider.upper()}_CREATE_ERROR] {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi tạo đơn thanh toán")

@router.post("/webhook/{provider}")
async def payment_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Webhook nhận notification từ Payment Provider.
    """
    try:
        # SePay/VietQR uses Authorization header as signature
        signature = request.headers.get("authorization") if provider.lower() == "vietqr" else None
        
        # Parse payload
        is_json = request.headers.get("content-type", "").startswith("application/json")
        if is_json:
            payload = await request.json()
        else:
            # ZaloPay uses form url encoded sometimes, but we handle the raw or json
            body = await request.body()
            import json
            try:
                payload = json.loads(body)
            except:
                payload = {"raw_body": body.decode("utf-8", errors="ignore")}

        result = await payment_service.handle_webhook(
            db=db,
            provider_name=provider,
            payload=payload,
            signature=signature
        )

        if "error" in result:
            return {"return_code": 0, "return_message": result["error"]}
        
        return {"return_code": 1, "return_message": "success"}

    except Exception as e:
        logger.error(f"[{provider.upper()}_WEBHOOK_ERROR] {e}")
        return {"return_code": 0, "return_message": "internal error"}

@router.get("/status")
async def get_payment_status(
    order_code: str,
    db: Session = Depends(get_db)
):
    """
    Kiểm tra trạng thái đơn hàng (Dùng cho VietQR polling).
    """
    from app.models.payment import PaymentTransaction
    tx = db.query(PaymentTransaction).filter(PaymentTransaction.order_code == order_code).first()
    
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    return {
        "status": tx.status,
        "amount": tx.amount,
        "provider": tx.provider,
        "created_at": tx.created_at,
        "paid_at": tx.paid_at
    }
