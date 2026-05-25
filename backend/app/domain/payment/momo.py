import os
import hmac
import hashlib
import json
from datetime import datetime
import httpx
from typing import Dict, Any, Optional

from app.domain.payment.base import PaymentProvider
from app.core.logging import logger

class MoMoProvider(PaymentProvider):
    def __init__(self):
        self.partner_code = os.environ.get("MOMO_PARTNER_CODE", "")
        self.access_key = os.environ.get("MOMO_ACCESS_KEY", "")
        self.secret_key = os.environ.get("MOMO_SECRET_KEY", "")
        self.endpoint = os.environ.get("MOMO_ENDPOINT", "")
        self.redirect_url = os.environ.get("MOMO_REDIRECT_URL", "")
        self.ipn_url = os.environ.get("MOMO_IPN_URL", "")

    async def create_order(self, transaction: Any, user_id: str, plan: Any) -> Dict[str, Any]:
        provider_order_id = f"{self.partner_code}{int(datetime.now().timestamp() * 1000)}"
        request_id = provider_order_id
        order_info = f"Nâng cấp gói {plan.name} {transaction.billing_cycle}"
        amount = str(int(transaction.amount))

        raw_signature = (
            f"accessKey={self.access_key}&"
            f"amount={amount}&"
            f"extraData=&"
            f"ipnUrl={self.ipn_url}&"
            f"orderId={provider_order_id}&"
            f"orderInfo={order_info}&"
            f"partnerCode={self.partner_code}&"
            f"redirectUrl={self.redirect_url}&"
            f"requestId={request_id}&"
            f"requestType=payWithMethod"
        )

        signature = hmac.new(
            self.secret_key.encode(),
            raw_signature.encode(),
            hashlib.sha256
        ).hexdigest()

        momo_payload = {
            "partnerCode": self.partner_code,
            "partnerName": "InsightAI",
            "storeId": "InsightAI",
            "requestId": request_id,
            "amount": int(amount),
            "orderId": provider_order_id,
            "orderInfo": order_info,
            "redirectUrl": self.redirect_url,
            "ipnUrl": self.ipn_url,
            "lang": "vi",
            "requestType": "payWithMethod",
            "autoCapture": True,
            "extraData": "",
            "orderGroupId": "",
            "signature": signature,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.endpoint,
                json=momo_payload
            )
            result = response.json()

        if response.status_code != 200 or result.get("resultCode") != 0:
            logger.error(f"[MOMO_CREATE_FAILED] {result}")
            raise Exception(result.get("message", "MoMo create failed"))

        return {
            "order_url": result.get("payUrl"),
            "provider_order_id": provider_order_id,
            "raw_response": result
        }

    def verify_webhook(self, payload: Any, signature: Optional[str] = None) -> bool:
        if not isinstance(payload, dict):
            return False

        if not signature:
            signature = payload.get("signature", "")
            
        raw_signature = (
            f"accessKey={self.access_key}&"
            f"amount={payload.get('amount')}&"
            f"extraData={payload.get('extraData', '')}&"
            f"orderId={payload.get('orderId')}&"
            f"orderInfo={payload.get('orderInfo')}&"
            f"orderType={payload.get('orderType')}&"
            f"partnerCode={payload.get('partnerCode')}&"
            f"payType={payload.get('payType')}&"
            f"requestId={payload.get('requestId')}&"
            f"responseTime={payload.get('responseTime')}&"
            f"resultCode={payload.get('resultCode')}&"
            f"transId={payload.get('transId')}"
        )

        expected_signature = hmac.new(
            self.secret_key.encode(),
            raw_signature.encode(),
            hashlib.sha256
        ).hexdigest()

        return expected_signature == signature

    def parse_webhook(self, payload: Any) -> Dict[str, Any]:
        result_code = payload.get("resultCode")
        is_success = (int(result_code) == 0) if result_code is not None else False

        return {
            "order_code": payload.get("orderId"), # Note: MoMo uses provider_order_id as orderId
            "amount": float(payload.get("amount", 0)),
            "provider_order_id": str(payload.get("orderId")),
            "provider_transaction_id": str(payload.get("transId", "")),
            "is_success": is_success,
            "error_message": payload.get("message", ""),
            "raw_payload": payload
        }
