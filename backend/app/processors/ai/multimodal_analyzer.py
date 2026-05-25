"""
MultimodalAnalyzer — Phân tích video frames + text để sinh LessonItem.
Hỗ trợ các provider có vision: OpenAI, Gemini, Anthropic, Grok.
"""

from app.processors.base import BaseProcessor
import base64
from app.ai.providers import get_chat_provider
from langchain_core.messages import HumanMessage
from app.ai.schemas import LessonItem
from app.ai.extractor import _save_ai_log, _extract_usage
import time


LESSON_PROMPT = """Dựa trên nội dung text và các hình ảnh từ video sau đây, hãy tạo một bài học nhỏ (micro-lesson).

Văn bản gốc: {text}

Yêu cầu trả về JSON chuẩn theo cấu trúc:
- title: Tiêu đề ngắn gọn của bài học.
- keyConcept: ĐÂY LÀ PHẦN NỘI DUNG LÝ THUYẾT CHI TIẾT NHẤT. Hãy giải thích sâu sắc, cặn kẽ mọi khái niệm, quy trình và kiến thức trong Ngữ cảnh. Sử dụng Markdown (tiêu đề ##, danh sách, in đậm). KHÔNG được tóm tắt ngắn gọn.
- example: Đưa ra MỘT ví dụ minh họa thực tế, trực quan, sinh động (như tình huống thực tế, phép ẩn dụ) để làm rõ lý thuyết ở trên. ĐÂY CHỈ LÀ PHẦN VÍ DỤ, KHÔNG DÙNG ĐỂ GIẢI THÍCH LÝ THUYẾT.
- difficulty: Mức độ (beginner/intermediate/advanced).
- quizzes: Danh sách 5-10 câu hỏi trắc nghiệm kiểm tra kiến thức của bài học này. Mỗi câu có 'question', 'options' (mảng 4 lựa chọn), 'answer' (đáp án đúng), và 'explanation' (giải thích).
"""

class MultimodalAnalyzer(BaseProcessor):
    def __init__(
        self,
        model_name: str = "gpt-4o-mini",
        provider: str = "openai",
        api_key: str | None = None,
    ):
        self.provider = provider
        self.model_name = model_name
        self.llm = get_chat_provider(
            provider=provider,
            model=model_name,
            api_key=api_key,
        )
        self._user_id = None
        self._item_id = None
        import asyncio
        self.semaphore = asyncio.Semaphore(3)

    def set_context(self, user_id: str | None = None, item_id: str | None = None):
        self._user_id = user_id
        self._item_id = item_id

    async def process(self, text: str, **kwargs) -> dict:
        """Hàm thực hiện phân tích multimodal."""
        frame_paths = kwargs.get("frame_paths", [])
        async with self.semaphore:
            analysis = await self.analyze_chunk(text, frame_paths)
        return analysis

    def _encode_image(self, image_path: str) -> str:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")

    def _build_image_content_part(self, b64_image: str) -> dict:
        """
        Trả về content part đúng format cho từng provider.
        - OpenAI / Grok: image_url với data URI
        - Google Gemini: dùng inline_data
        - Anthropic: dùng source type=base64
        """
        if self.provider in ("openai", "grok"):
            return {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{b64_image}",
                    "detail": "low",
                },
            }
        elif self.provider == "google":
            return {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
            }
        elif self.provider == "anthropic":
            return {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64_image,
                },
            }
        # Fallback
        return {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
        }

    async def analyze_chunk(self, text: str, frame_paths: list) -> dict:
        """Phân tích text + frames, trả về LessonItem dict."""
        content = [{"type": "text", "text": LESSON_PROMPT.format(text=text)}]

        import asyncio
        for path in frame_paths:
            b64_image = self._encode_image(path)
            content.append(self._build_image_content_part(b64_image))

        message = HumanMessage(content=content)
        struct_llm = self.llm.with_structured_output(LessonItem, include_raw=True)

        # Retry với exponential backoff để xử lý rate limit
        max_retries = 6
        base_delay = 2
        for attempt in range(max_retries):
            t0 = time.time()
            try:
                raw_result = await struct_llm.ainvoke([message])
                
                parsed = raw_result.get("parsed")
                raw_msg = raw_result.get("raw")
                parsing_error = raw_result.get("parsing_error")
                
                if parsing_error or not parsed:
                    raise ValueError(f"Parsing error: {parsing_error}")

                input_tokens, output_tokens = _extract_usage(raw_msg)
                latency = int((time.time() - t0) * 1000)
                
                # Ghi log Vision
                _save_ai_log(
                    user_id=self._user_id,
                    item_id=self._item_id,
                    task_type="Vision Analysis",
                    model_name=self.model_name,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency,
                    success=True,
                    prompt=f"[Vision] Text length: {len(text)} + {len(frame_paths)} frames",
                    response=f"Title: {parsed.title}"
                )
                
                return parsed.model_dump()

            except Exception as e:
                error_msg = str(e).lower()
                latency = int((time.time() - t0) * 1000)
                if "429" in error_msg or "rate limit" in error_msg:
                    delay = base_delay * (2 ** attempt)
                    print(
                        f"⚠️ [RATE LIMIT] {self.provider}/{self.model_name}, "
                        f"nghỉ {delay}s... (lần {attempt+1}/{max_retries})"
                    )
                    await asyncio.sleep(delay)
                else:
                    print(f"❌ [LỖI VISION] {self.provider}/{self.model_name}: {e}")
                    _save_ai_log(
                        user_id=self._user_id, item_id=self._item_id, task_type="Vision Analysis",
                        model_name=self.model_name, input_tokens=0, output_tokens=0, latency_ms=latency,
                        success=False, error_message=str(e)
                    )
                    raise e

        print("❌ Lỗi API sau nhiều lần thử. Bỏ qua chunk này.")
        return {
            "title": "Nội dung bị lỗi phân tích",
            "keyConcept": "Hệ thống quá tải (Rate limit). Vui lòng thử lại sau.",
            "example": "",
            "difficulty": "beginner",
        }
    
