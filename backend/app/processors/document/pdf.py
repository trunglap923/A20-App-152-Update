import fitz  # PyMuPDF
import os
import time
from app.processors.base import BaseProcessor, ingestion_registry

class PDFProcessor(BaseProcessor):
    async def process(self, file_path: str, **kwargs) -> dict:
        import httpx
        import anyio

        # Tắt log cảnh báo từ C-level của mupdf
        fitz.TOOLS.mupdf_display_errors(False)
        
        is_url = file_path.startswith("http")
        filename = file_path.split("/")[-1] if is_url else os.path.basename(file_path)
        
        if is_url:
            print(f"[PDF] Đang tải file từ URL: {file_path}")
            # Tăng timeout lên 30s để tránh bị treo khi mạng bận
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(file_path)
                response.raise_for_status()
                pdf_bytes = response.content
            size_mb = len(pdf_bytes) / (1024 * 1024)
            print(f"[PDF] Tải xong. Bắt đầu trích xuất '{filename}' ({size_mb:.2f}MB)")
            t0 = time.time()
            # Chạy việc mở và trích xuất PDF trong Thread Pool
            return await anyio.to_thread.run_sync(self._extract_text, pdf_bytes, filename, t0)
        else:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Không tìm thấy file: {file_path}")
            size_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"[PDF] Bắt đầu trích xuất '{filename}' ({size_mb:.2f}MB từ Local)")
            t0 = time.time()
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()
            return await anyio.to_thread.run_sync(self._extract_text, pdf_bytes, filename, t0)

    def _extract_text(self, pdf_bytes: bytes, filename: str, t0: float) -> dict:
        """Hàm trích xuất văn bản đồng bộ, chạy trong thread pool."""
        import time
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        metadata = doc.metadata
        total_pages = len(doc)
        
        full_text = ""
        pages_content = []
        
        for page_num in range(total_pages):
            page = doc.load_page(page_num)
            text = page.get_text()
            # Thêm marker [P X] vào mỗi đoạn văn để AI không bị lạc khi chunking
            lines = text.split('\n')
            marked_text = ""
            for line in lines:
                if line.strip():
                    marked_text += f"[P{page_num + 1}] {line}\n"
                else:
                    marked_text += "\n"
            
            full_text += f"\n--- START PAGE {page_num + 1} ---\n{marked_text}\n"
            pages_content.append({
                "page_num": page_num + 1,
                "content": text
            })
            if (page_num + 1) % 20 == 0 or page_num == total_pages - 1:
                print(f"[PDF][{filename}] Đã xử lý {page_num + 1}/{total_pages} trang...")

        doc.close()
        lat = time.time() - t0
        print(f"[PDF][{filename}] HOÀN TẤT (Latency: {lat:.2f}s | {len(full_text):,} ký tự)")

        return {
            "title": metadata.get("title") or filename,
            "author": metadata.get("author", "Unknown"),
            "subject": metadata.get("subject", ""),
            "total_pages": total_pages,
            "content": full_text.strip(),
            "pages": pages_content,
            "type": "pdf"
        }

# Đăng ký processor
ingestion_registry.register("pdf", PDFProcessor)
