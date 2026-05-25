from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class PaymentProvider(ABC):
    @abstractmethod
    async def create_order(self, transaction: Any, user_id: str, plan: Any) -> Dict[str, Any]:
        """
        Tạo đơn hàng trên hệ thống của provider.
        Trả về dictionary chứa các field như: order_url, provider_order_id, qr_code, etc.
        """
        pass

    @abstractmethod
    def verify_webhook(self, payload: Any, signature: Optional[str] = None) -> bool:
        """
        Kiểm tra tính hợp lệ của webhook (chữ ký, định dạng).
        """
        pass

    @abstractmethod
    def parse_webhook(self, payload: Any) -> Dict[str, Any]:
        """
        Trích xuất các thông tin cần thiết từ webhook payload.
        Trả về dictionary:
        {
            "order_code": str,
            "amount": float,
            "provider_order_id": str,
            "is_success": bool,
            "error_message": str (optional)
        }
        """
        pass
