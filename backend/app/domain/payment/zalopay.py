import os
import hmac
import hashlib
import json
import urllib.parse
from datetime import datetime
import httpx
from typing import Dict, Any, Optional

from app.domain.payment.base import PaymentProvider
from app.core.logging import logger

class ZaloPayProvider(PaymentProvider):
    def __init__(self):
        self.app_id = int(os.environ.get("ZALOPAY_APP_ID", 0))
        self.key1 = os.environ.get("ZALOPAY_KEY1", "")
        self.key2 = os.environ.get("ZALOPAY_KEY2", "")
        self.endpoint = os.environ.get("ZALOPAY_CREATE_ORDER_URL", "")
        self.app_base_url = os.environ.get("APP_BASE_URL", "")

    async def create_order(self, transaction: Any, user_id: str, plan: Any) -> Dict[str, Any]:
        app_time = int(datetime.now().timestamp() * 1000)
        
        yy = datetime.now().strftime("%y")
        mm = datetime.now().strftime("%m")
        dd = datetime.now().strftime("%d")
        app_trans_id = f"{yy}{mm}{dd}_{transaction.order_code}"

        embed_data = json.dumps({
            "redirecturl": f"{self.app_base_url}/payment/success"
        })
        item_data = json.dumps([])

        description = f"Thanh toán gói {plan.name} ({transaction.billing_cycle})"

        order = {
            "app_id": self.app_id,
            "app_user": user_id,
            "app_time": app_time,
            "amount": int(transaction.amount),
            "app_trans_id": app_trans_id,
            "embed_data": embed_data,
            "item": item_data,
            "description": description,
            "bank_code": "",
            "callback_url": f"{self.app_base_url}/api/payment/webhook/zalopay"
        }

        data = f"{order['app_id']}|{order['app_trans_id']}|{order['app_user']}|{order['amount']}|{order['app_time']}|{order['embed_data']}|{order['item']}"
        mac = hmac.new(self.key1.encode(), data.encode(), hashlib.sha256).hexdigest()
        order["mac"] = mac

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.endpoint,
                data=order,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            result = response.json()

        if result.get("return_code") != 1:
            logger.error(f"[ZALOPAY_CREATE_FAILED] {result}")
            raise Exception(result.get("return_message", "Giao dịch thất bại"))

        return {
            "order_url": result.get("order_url"),
            "provider_order_id": result.get("order_token"),
            "qr_code": result.get("qr_code"),
            "raw_response": result,
            "app_trans_id": app_trans_id
        }

    def verify_webhook(self, payload: Any, signature: Optional[str] = None) -> bool:
        if not isinstance(payload, dict):
            return False
            
        data = payload.get("data", "")
        mac = payload.get("mac", "")
        
        expected_mac = hmac.new(self.key2.encode(), data.encode(), hashlib.sha256).hexdigest()
        return expected_mac == mac

    def parse_webhook(self, payload: Any) -> Dict[str, Any]:
        data_str = payload.get("data", "{}")
        parsed = json.loads(data_str)

        app_trans_id = parsed.get("app_trans_id", "")
        zp_trans_id = parsed.get("zp_trans_id", "")
        amount = parsed.get("amount", 0)

        # Trích xuất localOrderCode từ app_trans_id (ví dụ: 250507_ORD-123)
        parts = app_trans_id.split('_', 1)
        local_order_code = parts[1] if len(parts) > 1 else app_trans_id

        return {
            "order_code": local_order_code,
            "amount": float(amount),
            "provider_order_id": str(zp_trans_id),
            "is_success": True, # Nếu gọi được webhook này là thành công
            "raw_payload": payload,
            "raw_parsed": parsed
        }
