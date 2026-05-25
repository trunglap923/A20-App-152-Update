import re
import time
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
from app.processors.base import BaseProcessor, ingestion_registry

class YouTubeProcessor(BaseProcessor):
    def extract_video_id(self, url: str) -> str:
        """Trích xuất Video ID từ URL YouTube."""
        patterns = [
            r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', 
            r'(?:youtu\.be\/)([0-9A-Za-z_-]{11})'
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        raise ValueError("URL YouTube không hợp lệ hoặc không tìm thấy Video ID.")

    async def get_metadata(self, url: str) -> dict:
        """Lấy metadata của video thông qua yt-dlp."""
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'skip_download': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title"),
                "channel": info.get("uploader"),
                "duration": info.get("duration"),  # seconds
                "description": info.get("description", "")
            }

    async def get_transcript(self, video_id: str) -> str:
        """Lấy transcript bằng youtube-transcript-api."""
        try:
            api = YouTubeTranscriptApi()
            transcript = api.fetch(video_id, languages=['vi', 'en'])
            formatted_lines = []
            for item in transcript:
                if isinstance(item, dict):
                    start = item.get("start", 0)
                    text = item.get("text", "").strip()
                else:
                    start = getattr(item, "start", 0)
                    text = getattr(item, "text", "").strip()
                formatted_lines.append(f"[{int(start//60):02d}:{int(start%60):02d}] {text}")
            return "\n".join(formatted_lines)
        except Exception as e:
            raise Exception(f"Video YouTube này không có phụ đề (Closed Captions). Hệ thống không thể phân tích nội dung. Vui lòng chọn video khác có phụ đề tiếng Việt/Anh. Lỗi gốc: {e}")

    async def process(self, url: str, **kwargs) -> dict:
        print(f"\n=== [YOUTUBE] BẮT ĐẦU ===")
        print(f"  URL: {url}")
        t_total = time.time()

        # 1. Lấy metadata
        print(f"[YOUTUBE][1/2] Đang lấy metadata (yt-dlp)...")
        t1 = time.time()
        video_id = self.extract_video_id(url)
        metadata = await self.get_metadata(url)
        duration_str = f"{int(metadata.get('duration', 0) // 60)}m{int(metadata.get('duration', 0) % 60)}s" if metadata.get('duration') else "N/A"
        print(f"[YOUTUBE][1/2] HOÀN TẤT metadata (Latency: {time.time()-t1:.2f}s)")
        print(f"  Tiêu đề  : {metadata.get('title', 'N/A')}")
        print(f"  Kênh     : {metadata.get('channel', 'N/A')}")
        print(f"  Thời lượng: {duration_str}")
        
        # 2. Lấy transcript
        print(f"[YOUTUBE][2/2] Đang lấy phụ đề/transcript...")
        t2 = time.time()
        transcript = await self.get_transcript(video_id)
        transcript_len = len(transcript)
        print(f"[YOUTUBE][2/2] HOÀN TẤT transcript (Latency: {time.time()-t2:.2f}s | {transcript_len:,} ký tự)")

        print(f"=== [YOUTUBE] HOÀN TẤT (Tổng: {time.time()-t_total:.2f}s) ===\n")

        # Trả về kết quả chung tương đồng format của PDFProcessor
        return {
            "title": metadata.get("title", f"YouTube Video {video_id}"),
            "author": metadata.get("channel", "Unknown"),
            "source_id": video_id,
            "duration": metadata.get("duration"),
            "content": transcript,
            "metadata": metadata,
            "type": "youtube"
        }

# Đăng ký processor
ingestion_registry.register("youtube", YouTubeProcessor)