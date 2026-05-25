import os
import re
from typing import Dict, Any, Optional

from app.domain.payment.base import PaymentProvider

class VietQRProvider(PaymentProvider):
    def __init__(self):
        self.webhook_secret = os.environ.get("SEPAY_WEBHOOK_SECRET", "")

    async def create_order(self, transaction: Any, user_id: str, plan: Any) -> Dict[str, Any]:
        """
        VietQR (SePay) thường tạo mã thanh toán tĩnh tại frontend hoặc app, 
        không cần API call để tạo đơn. Chúng ta chỉ trả về các format quy định.
        """
        # Trả về order_code để frontend hiển thị trong nội dung chuyển khoản
        return {
            "order_url": None,
            "provider_order_id": None,
            "qr_code": None,
            "order_code": transaction.order_code
        }

    def verify_webhook(self, payload: Any, signature: Optional[str] = None) -> bool:
        if not self.webhook_secret:
            return True # Không cấu hình secret thì bỏ qua (dùng cho dev)
            
        if not signature:
            return False
            
        return signature == f"Apikey {self.webhook_secret}"

    def parse_webhook(self, payload: Any) -> Dict[str, Any]:
        amount = float(
            payload.get("transferAmount") or 
            payload.get("amountIn") or 
            payload.get("amount") or 0
        )
        
        description = str(
            payload.get("transactionContent") or 
            payload.get("description") or 
            payload.get("content") or ""
        )
        
        provider_transaction_id = str(
            payload.get("referenceCode") or 
            payload.get("referenceNumber") or 
            payload.get("transaction_id") or 
            payload.get("id") or ""
        )
        
        transfer_type = payload.get("transferType")
        
        # Parse order code (VQR-<digits>) from description
        match = re.search(r'(?:VQR|vqr)[\-\s]*(\d+)', description)
        order_code = f"VQR-{match.group(1)}" if match else None
        
        is_success = False
        error_message = ""
        
        if transfer_type and transfer_type != "in":
            error_message = "ignored_outgoing_transfer"
        elif not order_code:
            error_message = "no_valid_order_code_found"
        else:
            is_success = True

        return {
            "order_code": order_code,
            "amount": amount,
            "provider_order_id": None, # SePay doesn't have an order ID, just transaction ID
            "provider_transaction_id": provider_transaction_id,
            "is_success": is_success,
            "error_message": error_message,
            "raw_payload": payload
        }
