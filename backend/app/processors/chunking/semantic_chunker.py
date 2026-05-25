from app.processors.base import BaseProcessor
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from app.ai.providers import get_embedding_provider

class SemanticChunker(BaseProcessor):
    def __init__(self, threshold: float = 0.5, min_duration: float = 180.0):
        self.threshold = threshold
        self.min_duration = min_duration
        self.embedding_model = get_embedding_provider()
        self.transition_keywords = ["tiếp theo", "sau đây", "chúng ta sẽ sang", "kết thúc phần"]

    async def process(self, segments: list, **kwargs) -> dict:
        """Hàm thực hiện phân đoạn."""
        chunks = await self.chunk_segments(segments)
        return {"chunks": chunks}

    async def chunk_segments(self, segments: list) -> list:
        """Nhóm các segments thành các chunks dựa trên độ tương đồng và keywords."""
        if not segments:
            return []

        # Lấy embeddings cho tất cả các đoạn
        texts = [s["text"] for s in segments]
        embeddings = self.embedding_model.embed_documents(texts)
        
        chunks = []
        current_chunk_indices = [0]

        for i in range(1, len(segments)):
            # Tính độ dài hiện tại của chunk đang gom
            current_start = segments[current_chunk_indices[0]]["start"]
            current_end = segments[i-1]["end"]
            duration = current_end - current_start

            # 1. Kiểm tra Cosine Similarity
            sim = cosine_similarity([embeddings[i-1]], [embeddings[i]])[0][0]
            
            # 2. Kiểm tra Keywords (Chỉ ở đầu câu)
            first_words = " ".join(segments[i]["text"].lower().split()[:3])
            has_keyword = any(kw in first_words for kw in self.transition_keywords)
            
            # 3. Kiểm tra Time Gap (Im lặng lâu)
            time_gap = segments[i]["start"] - segments[i-1]["end"]
            
            # Chỉ tách chunk khi:
            # - Đã đủ độ dài tối thiểu (min_duration)
            # - VÀ (Nội dung quá khác biệt HOẶC có từ khóa chuyển cảnh HOẶC im lặng quá lâu HOẶC quá dài)
            if duration >= self.min_duration:
                if sim < self.threshold or has_keyword or time_gap > 5.0 or duration > 300.0:
                    chunks.append(self._create_chunk(segments, current_chunk_indices))
                    current_chunk_indices = [i]
                else:
                    current_chunk_indices.append(i)
            else:
                # Chưa đủ độ dài tối thiểu thì cứ gom tiếp
                current_chunk_indices.append(i)
        
        chunks.append(self._create_chunk(segments, current_chunk_indices))
        return chunks

    def _create_chunk(self, segments: list, indices: list) -> dict:
        selected = [segments[i] for i in indices]
        return {
            "start": selected[0]["start"],
            "end": selected[-1]["end"],
            "text": " ".join([s["text"] for s in selected])
        }
