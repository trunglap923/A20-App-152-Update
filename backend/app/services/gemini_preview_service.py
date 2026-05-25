import os
import json
import httpx
from typing import Dict, Any
from app.core.logging import logger

class GeminiPreviewService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_PREVIEW_API_KEY") or os.getenv("GEMINI_API_KEY")
        self.model = os.getenv("GEMINI_PREVIEW_MODEL", "gemini-2.5-flash")

    async def preview_broadcast(self, payload: dict) -> Dict[str, Any]:
        prompt = f"""
Bạn là QA reviewer cho nội dung thông báo sản phẩm.
Hãy đánh giá payload sau và trả về JSON hợp lệ theo schema:
{{
  "qualityScore": number(0-100),
  "riskLevel": "Thấp" | "Trung bình" | "Cao",
  "issues": string[],
  "suggestions": string[],
  "previewTitle": string,
  "previewBody": string
}}
Yêu cầu:
- Viết tiếng Việt, ngắn gọn, thực dụng.
- previewTitle/previewBody là bản hoàn chỉnh có thể dùng ngay để gửi thật (production-ready).
- Nếu có biến {{{{tên_user}}}} thì giữ nguyên.
- Tránh văn phong chung chung, phải có thông tin hành động rõ ràng.

Payload:
{json.dumps(payload, ensure_ascii=False, indent=2)}
"""
        return await self._call_gemini(prompt)

    async def preview_banner(self, payload: dict) -> Dict[str, Any]:
        prompt = f"""
Bạn là QA reviewer cho banner/popup trong ứng dụng.
Hãy đánh giá payload sau và trả về JSON hợp lệ theo schema:
{{
  "qualityScore": number(0-100),
  "riskLevel": "Thấp" | "Trung bình" | "Cao",
  "issues": string[],
  "suggestions": string[],
  "previewTitle": string,
  "previewBody": string,
  "previewCta": string,
  "previewLink": string
}}
Yêu cầu:
- Viết tiếng Việt.
- previewTitle là tiêu đề popup/banner, previewBody là nội dung hiển thị hoàn chỉnh có thể dùng ngay.
- previewCta và previewLink phải dùng ngay được khi tạo banner (không cần chỉnh sửa).
- previewLink phải là link nội bộ bắt đầu bằng "/" (ví dụ: /pricing, /billing, /status).
- Đảm bảo CTA rõ hành động và không gây hiểu nhầm.
- Ưu tiên thông điệp ngắn, rõ lợi ích, dễ click.

Payload:
{json.dumps(payload, ensure_ascii=False, indent=2)}
"""
        result = await self._call_gemini(prompt)
        
        # Merge defaults
        result["previewCta"] = result.get("previewCta") or payload.get("ctaText", "")
        result["previewLink"] = result.get("previewLink") or payload.get("ctaLink", "")
        return result

    async def _call_gemini(self, prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            raise Exception("Thiếu GEMINI_API_KEY")
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "responseMimeType": "application/json",
                    }
                },
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()
            
            try:
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(text)
            except Exception as e:
                logger.error(f"Failed to parse Gemini response: {e}")
                raise Exception("Failed to parse Gemini response")

gemini_preview_service = GeminiPreviewService()
