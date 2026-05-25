"""
Transcriber — Chuyển audio thành text có timestamps dùng OpenAI Whisper API.
STT chỉ hỗ trợ OpenAI (Whisper-1, gpt-4o-transcribe...).
Hỗ trợ nhận user API key riêng thay vì dùng system key.
"""

from app.processors.base import BaseProcessor
from openai import AsyncOpenAI
import os
import time
import asyncio
import subprocess
import uuid
from app.ai.extractor import _save_ai_log

def _clean_key(value: str | None) -> str | None:
    if not value:
        return None
    key = str(value).strip().strip('"').strip("'").strip()
    return key or None


class Transcriber(BaseProcessor):
    def __init__(self, model_name: str = "whisper-1", api_key: str | None = None):
        # Dùng user key nếu có, fallback sang system OPENAI_API_KEY, fallback dummy để không crash
        effective_key = (api_key or "").strip() or os.getenv("OPENAI_API_KEY") or "dummy_key"
        self.client = AsyncOpenAI(api_key=effective_key)
        self.model_name = model_name
        self._user_id = None
        self._item_id = None
        print(f"[STT] model={model_name} source={'user-key' if _clean_key(api_key) else 'system-default'}")

    def set_context(self, user_id: str | None = None, item_id: str | None = None):
        self._user_id = user_id
        self._item_id = item_id

    async def process(self, audio_path: str, **kwargs) -> dict:
        """Hàm thực hiện STT qua OpenAI API."""
        segments = await self.transcribe(audio_path)
        return {"segments": segments}

    def _get_duration(self, filepath: str) -> float:
        """Lấy độ dài của file audio bằng ffprobe."""
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", filepath],
                capture_output=True, text=True, check=True
            )
            return float(result.stdout.strip())
        except Exception:
            # Fallback nếu không tính được
            return 0.0

    async def transcribe(self, audio_path: str) -> list:
        """Chuyển audio thành text kèm timestamps sử dụng OpenAI Whisper API, chạy song song với chunk lớn."""
        if not os.path.exists(audio_path):
            return []

        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        duration = self._get_duration(audio_path)
        chunk_duration = 600  # 10 phút mỗi chunk
        num_chunks = 1
        
        # Whisper API max 25MB. Nếu file lớn hơn hoặc dài quá 10 phút, ta cắt ra.
        if duration > chunk_duration or audio_size_mb > 20:
            if duration > 0:
                num_chunks = int(duration // chunk_duration) + (1 if duration % chunk_duration > 0 else 0)
            else:
                num_chunks = int(audio_size_mb // 10) + 1  # Fallback nếu không có duration, giả sử 10MB/chunk

        print(f"[STT] Bắt đầu STT (model={self.model_name} | Size: {audio_size_mb:.2f}MB | Chunks: {num_chunks})")
        t0 = time.time()
        
        chunk_files = []
        try:
            if num_chunks > 1 and duration > 0:
                for i in range(num_chunks):
                    start_ts = i * chunk_duration
                    chunk_path = f"{audio_path}_chunk_{i}_{uuid.uuid4().hex[:6]}.mp3"
                    subprocess.run([
                        "ffmpeg", "-i", audio_path,
                        "-ss", str(start_ts), "-t", str(chunk_duration),
                        "-acodec", "copy", chunk_path, "-y"
                    ], capture_output=True, check=True)
                    chunk_files.append((chunk_path, start_ts))
            else:
                chunk_files.append((audio_path, 0))

            async def _transcribe_single(chunk_info):
                c_path, offset = chunk_info
                with open(c_path, "rb") as audio_file:
                    res = await self.client.audio.transcriptions.create(
                        model=self.model_name,
                        file=audio_file,
                        response_format="verbose_json"
                    )
                segs = getattr(res, "segments", [])
                for s in segs:
                    s.start += offset
                    s.end += offset
                return segs

            segment_lists = await asyncio.gather(*[_transcribe_single(c) for c in chunk_files])
            
            segments = []
            for segs in segment_lists:
                segments.extend(segs)

            total_duration = segments[-1].end if segments else 0

            latency = int((time.time() - t0) * 1000)
            print(f"[STT] HOÀN TẤT STT (Latency: {latency/1000:.2f}s | Segments: {len(segments)} | Duration: {total_duration:.1f}s)")            
            
            # Ghi log STT (Lấy thời lượng audio làm input_tokens để ước tính chi phí)
            _save_ai_log(
                user_id=self._user_id,
                item_id=self._item_id,
                task_type="Audio STT",
                model_name=self.model_name,
                input_tokens=int(total_duration), # 1 giây = 1 token hiển thị
                output_tokens=len(segments),      # Số câu
                latency_ms=latency,
                success=True,
                prompt=f"[STT] Audio file: {os.path.basename(audio_path)}",
                response=f"Transcribed {len(segments)} segments, duration: {total_duration}s"
            )

        except Exception as e:
            latency = int((time.time() - t0) * 1000)
            print(f"❌ [LỖI STT] {self.model_name}: {e}")
            _save_ai_log(
                user_id=self._user_id, item_id=self._item_id, task_type="Audio STT",
                model_name=self.model_name, input_tokens=0, output_tokens=0, latency_ms=latency,
                success=False, error_message=str(e)
            )
            raise e

        finally:
            # Cleanup temporary chunks
            for c_path, _ in chunk_files:
                if c_path != audio_path and os.path.exists(c_path):
                    try:
                        os.remove(c_path)
                    except Exception as e:
                        print(f"[STT] Lỗi xóa file tạm {c_path}: {e}")

        processed_segments = [
            {"start": getattr(s, "start", 0), "end": getattr(s, "end", 0), "text": getattr(s, "text", "")}
            for s in segments
        ]

        return self._post_process_segments(processed_segments)

    def _post_process_segments(self, segments: list) -> list:
        """Merge/Split logic cho các segments."""
        if not segments:
            return []

        merged = []
        current = segments[0]

        for i in range(1, len(segments)):
            next_seg = segments[i]
            # Merge nếu quá ngắn (< 2s)
            if (current["end"] - current["start"]) < 2.0:
                current["end"] = next_seg["end"]
                current["text"] += " " + next_seg["text"]
            else:
                merged.append(current)
                current = next_seg

        merged.append(current)

        return [
            {"start": s["start"], "end": s["end"], "text": s["text"].strip()}
            for s in merged
        ]
