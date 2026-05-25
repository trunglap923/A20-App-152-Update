from abc import ABC, abstractmethod
from typing import Dict, Any

class EmailSender(ABC):
    """
    Abstract base class for email sending adapters.
    """
    @abstractmethod
    async def send_email(self, to_email: str, subject: str, text: str, html: str) -> Dict[str, Any]:
        """
        Gửi email và trả về kết quả (ok, error).
        """
        pass
