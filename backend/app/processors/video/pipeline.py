import os
import uuid
from app.processors.video.audio_processing import AudioVideoProcessor
from app.processors.video.transcription import Transcriber
from app.processors.base import BaseProcessor, ingestion_registry

class VideoProcessor(BaseProcessor):
    def __init__(self):
        # Đường dẫn data root
        self.upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data"))
        os.makedirs(self.upload_dir, exist_ok=True)
        
        self.av_processor = AudioVideoProcessor(self.upload_dir)

    async def process(self, source_url: str, **kwargs) -> dict:
        """Quy trình Ingestion thuần túy: Chỉ trích xuất dữ liệu thô (Transcription)."""
        import time
        from app.workers.enrichment_pipeline import _create_transcriber, update_stage
        
        start_total = time.time()
        
        ai_options = kwargs.get("ai_options")
        user_id = kwargs.get("user_id")
        item_id = kwargs.get("item_id")
        
        is_url = source_url.startswith("http")
        filename = source_url.split('/')[-1].split('?')[0] if is_url else os.path.basename(source_url)
        file_size_mb = 0
        if not is_url and os.path.exists(source_url):
            file_size_mb = os.path.getsize(source_url) / (1024 * 1024)
        print(f"\n=== [VIDEO INGESTION] BẮT ĐẦU ===")
        print(f"  File  : {filename}")
        print(f"  Size  : {file_size_mb:.2f} MB")
        print(f"  Item  : {item_id}")
        print(f"===================================")

        # 1. Extract Audio (MP3)
        print(f"[1/2] Đang trích xuất âm thanh (FFmpeg)...")
        update_stage(item_id, "Đang trích xuất âm thanh (FFmpeg)...")
        t1 = time.time()
        audio_data = await self.av_processor.process(source_url)
        audio_path = audio_data["audio_path"]
        print(f"[1/2] HOÀN TẤT trích xuất âm thanh (Latency: {time.time()-t1:.2f}s)")
        
        # 2. Transcribe (OpenAI API)
        print(f"[2/2] Đang chuyển đổi âm thanh -> văn bản (Whisper API)...")
        update_stage(item_id, "Đang chuyển đổi giọng nói thành văn bản (Whisper API)...")
        t2 = time.time()
        transcriber = _create_transcriber(ai_options)
        transcriber.set_context(user_id=user_id, item_id=item_id)
        transcribe_data = await transcriber.process(audio_path)
        segments = transcribe_data["segments"]
        print(f"[2/2] HOÀN TẤT chuyển đổi âm thanh (Latency: {time.time()-t2:.2f}s | {len(segments)} segments)")
        
        # Dọn dẹp: Xóa file audio tạm
        if os.path.exists(audio_path):
            try: os.remove(audio_path)
            except: pass
        
        # Tạo full_content từ toàn bộ segments kèm theo mốc thời gian [MM:SS]
        full_content = "\n".join([f"[{int(s['start']//60):02d}:{int(s['start']%60):02d}] {s['text'].strip()}" for s in segments])
        total_lat = time.time() - start_total

        print(f"=== [VIDEO INGESTION] HOÀN TẤT ===")
        print(f"  Tổng thời gian : {total_lat:.2f}s")
        print(f"  Segments       : {len(segments)}")
        print(f"  Độ dài nội dung: {len(full_content):,} ký tự")
        print(f"======================================\n")
        
        return {
            "title": filename,
            "content": full_content,
            "segments": segments  # Trả về các câu thô để Enrichment thực hiện chia đoạn
        }

# Đăng ký processor (Chỉ truyền Class, không truyền Instance)
ingestion_registry.register("video", VideoProcessor)
ingestion_registry.register("audio", VideoProcessor)
