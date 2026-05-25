"""
TEST PHASE 1: Kiểm tra Database Schema & Ingestion
===================================================
Chạy: python tests/test_phase1_db_ingestion.py

Kiểm tra:
  1. Kết nối Database & pgvector extension
  2. Tất cả 16 bảng đã tồn tại
  3. Processor (PDF/YouTube) hoạt động
  4. Chunking, Embedding và lưu vào Postgres
"""
import sys
import os
import time
import asyncio
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
os.chdir(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import dotenv
dotenv.load_dotenv()

# ──────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────
PASS = "✅"
FAIL = "❌"
SEP  = "=" * 60

def section(title: str):
    print(f"\n{SEP}")
    print(f"  {title}")
    print(SEP)

def ok(msg: str, t: float = 0):
    suffix = f" ({t:.2f}s)" if t else ""
    print(f"  {PASS} {msg}{suffix}")

def fail(msg: str, err=""):
    print(f"  {FAIL} {msg}")
    if err:
        print(f"      => {err}")


# ══════════════════════════════════════════
# 1. Kiểm tra kết nối database & pgvector
# ══════════════════════════════════════════
async def test_db_connection():
    section("TEST 1: Kết nối Database & pgvector")
    from sqlalchemy import text
    from app.db.session import engine

    t0 = time.monotonic()
    try:
        from app.db.base import Base  # noqa: F401 – import toàn bộ models
        Base.metadata.create_all(engine)
        ok("Khởi tạo schema thành công", time.monotonic() - t0)
    except Exception as e:
        fail("Khởi tạo schema thất bại", str(e))
        return False

    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector'"))
            row = result.fetchone()
            if row:
                ok("pgvector extension đã cài đặt")
            else:
                fail("pgvector chưa được cài, cần chạy: CREATE EXTENSION vector;")
                return False
    except Exception as e:
        fail("Không thể kiểm tra extension", str(e))
        return False

    return True


# ══════════════════════════════════════════
# 2. Kiểm tra 16 bảng tồn tại
# ══════════════════════════════════════════
async def test_tables_exist():
    section("TEST 2: Kiểm tra 16 bảng trong schema")
    from sqlalchemy import inspect
    from app.db.session import engine

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    REQUIRED_TABLES = [
        "knowledge_items", "item_chunks", "embeddings", "enrichment_jobs",
        "summaries", "mindmaps", "lessons", "quizzes", "quiz_questions",
        "quiz_answers", "tags", "item_tags", "quiz_attempts", "user_answers",
        "lesson_progress", "llm_cache",
    ]

    all_ok = True
    for table in REQUIRED_TABLES:
        if table in existing:
            ok(f"Bảng '{table}' tồn tại")
        else:
            fail(f"Bảng '{table}' KHÔNG tồn tại")
            all_ok = False
    return all_ok


# ══════════════════════════════════════════
# 3. Kiểm tra PDF Processor
# ══════════════════════════════════════════
async def test_pdf_processor():
    section("TEST 3: PDF Processor (Chunking)")

    # Tìm bất kỳ file pdf nào trong thư mục data/
    pdf_file = None
    data_dir = os.path.join(os.getcwd(), "data")
    if os.path.isdir(data_dir):
        for f in os.listdir(data_dir):
            if f.endswith(".pdf"):
                pdf_file = os.path.join(data_dir, f)
                break

    if not pdf_file:
        print(f"  ⚠️  Không tìm thấy file PDF trong ./data/ — bỏ qua test này")
        return True

    print(f"  📄 Dùng file: {os.path.basename(pdf_file)}")

    t0 = time.monotonic()
    try:
        from app.processors.base import ingestion_registry
        processor = ingestion_registry.get_processor("pdf")
        data = await processor.process(pdf_file)
        elapsed = time.monotonic() - t0

        content = data.get("content", "")
        ok(f"Trích xuất thành công: {len(content)} ký tự", elapsed)
        ok(f"Tiêu đề: {data.get('title', '(không có)')}")
        return True
    except Exception as e:
        fail("Processor thất bại", str(e))
        return False


# ══════════════════════════════════════════
# 4. Kiểm tra Indexing vào Postgres (pgvector)
# ══════════════════════════════════════════
async def test_indexing():
    section("TEST 4: Indexing & Vector Search (pgvector)")

    item_id = str(uuid.uuid4())
    dummy_content = (
        "RAG (Retrieval-Augmented Generation) giúp mô hình ngôn ngữ lớn "
        "truy xuất tri thức bên ngoài thay vì chỉ dùng tham số đã được huấn luyện. "
        "Điều này giúp giảm hallucination và cải thiện độ chính xác đáng kể. " * 5
    )

    # Tạo KnowledgeItem trước để thoả mãn FK constraint
    from app.db.session import engine
    from sqlalchemy.orm import Session
    from app.models.knowledge_items import KnowledgeItem
    with Session(engine) as s:
        s.add(KnowledgeItem(
            id=item_id,
            user_id="00000000-0000-0000-0000-000000000000",
            title="[TEST] RAG Test",
            source_type="pdf",
            status="pending",
            processing_stage="ingestion",
            language="vi",
        ))
        s.commit()

    t0 = time.monotonic()
    try:
        from app.search.service import search_service
        count = await search_service.index_document(item_id, dummy_content, metadata={"title": "RAG Test"})
        ok(f"Đã index {count} chunks", time.monotonic() - t0)
    except Exception as e:
        fail("index_document thất bại", str(e))
        return False

    # Vector Search
    t1 = time.monotonic()
    try:
        results = await search_service.search_chunks("retrieval augmented generation", top_k=3)
        ok(f"Vector search trả về {len(results)} kết quả", time.monotonic() - t1)
        for i, r in enumerate(results[:2], 1):
            print(f"     [{i}] {r[:80]}…")
    except Exception as e:
        fail("search_chunks thất bại", str(e))
        return False

    return True


# ══════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════
async def main():
    print(f"\n{'=' * 60}")
    print("  🧪 PHASE 1: DATABASE & INGESTION TESTS")
    print(f"{'=' * 60}")

    results = []
    results.append(await test_db_connection())
    results.append(await test_tables_exist())
    results.append(await test_pdf_processor())
    results.append(await test_indexing())

    passed = sum(results)
    total  = len(results)

    print(f"\n{SEP}")
    print(f"  KẾT QUẢ: {passed}/{total} tests passed")
    print(SEP)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    asyncio.run(main())
