from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.processors.base import BaseProcessor

class TextChunker(BaseProcessor):
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        # Sử dụng Recursive Splitter để giữ ngữ cảnh câu tốt nhất
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ".", " ", ""]
        )

    async def process(self, text: str, **kwargs) -> dict:
        """Băm text thô thành các đoạn nhỏ tối ưu cho Vector DB."""
        if not text:
            return {"chunks": []}
            
        chunks = self.text_splitter.split_text(text)
        return {"chunks": chunks}
