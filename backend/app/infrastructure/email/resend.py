import os
import httpx
from typing import Dict, Any
from app.infrastructure.email.base import EmailSender
from app.core.logging import logger

class ResendAdapter(EmailSender):
    def __init__(self):
        self.api_key = os.getenv("RESEND_API_KEY")
        self.from_email = os.getenv("EMAIL_FROM") or os.getenv("RESEND_FROM")

    def is_configured(self) -> bool:
        return bool(self.api_key and self.from_email)

    async def send_email(self, to_email: str, subject: str, text: str, html: str) -> Dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "error": "Missing RESEND_API_KEY or EMAIL_FROM"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.from_email,
                        "to": [to_email],
                        "subject": subject,
                        "text": text,
                        "html": html,
                    }
                )
                if not response.is_success:
                    return {"ok": False, "error": response.text or f"HTTP {response.status_code}"}
                
                return {"ok": True, "data": response.json()}
        except Exception as e:
            logger.error(f"Resend email error: {e}")
            return {"ok": False, "error": str(e)}
