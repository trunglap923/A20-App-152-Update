import os
import smtplib
import asyncio
from email.message import EmailMessage
from typing import Dict, Any
from app.infrastructure.email.base import EmailSender
from app.core.logging import logger

class SmtpAdapter(EmailSender):
    def __init__(self):
        self.user = os.getenv("SMTP_USER") or os.getenv("SENDER_EMAIL")
        self.password = os.getenv("SMTP_PASS") or os.getenv("SENDER_PASSWORD")
        self.host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.port = int(os.getenv("SMTP_PORT", 465))
        self.from_name = os.getenv("EMAIL_FROM_NAME", "InsightAI Admin")

    def is_configured(self) -> bool:
        return bool(self.user and self.password)

    def _send_sync(self, to_email: str, subject: str, text: str, html: str) -> None:
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = f"{self.from_name} <{self.user}>"
        msg['To'] = to_email
        msg.set_content(text)
        msg.add_alternative(html, subtype='html')

        if self.port == 465:
            with smtplib.SMTP_SSL(self.host, self.port) as server:
                server.login(self.user, self.password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(self.host, self.port) as server:
                server.starttls()
                server.login(self.user, self.password)
                server.send_message(msg)

    async def send_email(self, to_email: str, subject: str, text: str, html: str) -> Dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "error": "Missing SMTP credentials"}

        try:
            await asyncio.to_thread(self._send_sync, to_email, subject, text, html)
            return {"ok": True}
        except Exception as e:
            logger.error(f"SMTP email error: {e}")
            return {"ok": False, "error": str(e)}
