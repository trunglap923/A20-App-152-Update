"""
TEST PHASE 2: Kiểm tra Agentic Enrichment Pipeline
====================================================
Chạy: python tests/test_phase2_pipeline.py

Kiểm tra:
  1. AI extractor (Summary / Mindmap / Outline)
  2. Lesson + Quiz generation (RAG + parallel)
  3. Tất cả enrichment_jobs = done sau khi chạy
  4. Dữ liệu được lưu vào DB đầy đủ
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
# 1. Test AI Extractor - Summary
# ══════════════════════════════════════════
async def test_ai_summary():
    section("TEST 1: AI Agent — Sinh Tóm tắt (Summary)")
    sample_text = (
        "RAG hay Retrieval-Augmented Generation kết hợp hai kỹ thuật: "
        "tìm kiếm ngữ nghĩa và sinh văn bản. Quy trình gồm 3 bước chính: "
        "Retrieval (truy xuất chunks liên quan), Augmentation (kết hợp vào prompt) "
        "và Generation (LLM sinh câu trả lời). Mô hình này giúp giảm hallucination "
        "và tăng độ chính xác khi trả lời các câu hỏi phức tạp." * 3
    )

    t0 = time.monotonic()
    try:
        from app.ai.extractor import agentic_extractor
        result = await agentic_extractor.generate_summary(sample_text)
        elapsed = time.monotonic() - t0

        if result and isinstance(result, dict):
            ok(f"Summary trả về đúng kiểu dict", elapsed)
            ok(f"Nội dung 'detailed': {len(str(result.get('detailed','')))} ký tự")
            return True
        else:
            fail("Summary rỗng hoặc sai kiểu")
            return False
    except Exception as e:
        fail("generate_summary thất bại", str(e))
        return False


# ══════════════════════════════════════════
# 2. Test AI Extractor - Outline
# ══════════════════════════════════════════
async def test_ai_outline():
    section("TEST 2: AI Agent — Sinh Dàn ý (Outline)")
    summary_text = (
        "RAG là kỹ thuật kết hợp tìm kiếm và sinh văn bản. "
        "Nó bao gồm: embedding, vector store, retrieval, augmentation, generation. "
        "Ứng dụng trong chatbot, tóm tắt tài liệu và trả lời câu hỏi."
    )

    t0 = time.monotonic()
    try:
        from app.ai.extractor import agentic_extractor
        result = await agentic_extractor.generate_outline(summary_text)
        elapsed = time.monotonic() - t0

        if result and isinstance(result, list) and len(result) > 0:
            ok(f"Outline trả về {len(result)} bài học", elapsed)
            for i, lesson in enumerate(result, 1):
                print(f"     [{i}] {lesson.get('title', '???')}")
            return True
        else:
            fail("Outline rỗng")
            return False
    except Exception as e:
        fail("generate_outline thất bại", str(e))
        return False


# ══════════════════════════════════════════
# 3. Test AI Extractor - Lesson + Quiz
# ══════════════════════════════════════════
async def test_ai_lesson_quiz():
    section("TEST 3: AI Agent — Viết Bài học & Quiz (RAG)")
    title       = "Giới thiệu về RAG"
    description = "Tổng quan về Retrieval-Augmented Generation và lợi ích"
    context     = (
        "RAG giúp LLM truy xuất thông tin chính xác từ cơ sở tri thức. "
        "Không cần fine-tune, chỉ cần cung cấp context phù hợp. "
        "Kết quả tốt hơn và ít hallucination hơn so với LLM thuần."
    )

    t0 = time.monotonic()
    try:
        from app.ai.extractor import agentic_extractor
        lesson = await agentic_extractor.write_lesson(title, description, context)
        elapsed = time.monotonic() - t0

        if lesson and lesson.get("content"):
            ok(f"Lesson viết xong: {len(lesson['content'])} ký tự", elapsed)
        else:
            fail("Lesson content rỗng")
            return False

        # Quiz
        t1 = time.monotonic()
        quizzes = await agentic_extractor.generate_quizzes(lesson["content"])
        if quizzes and isinstance(quizzes, list):
            ok(f"Quiz sinh ra {len(quizzes)} câu hỏi", time.monotonic() - t1)
            for i, q in enumerate(quizzes, 1):
                print(f"     [{i}] {q.get('question','???')[:70]}…")
            return True
        else:
            fail("Quiz rỗng")
            return False
    except Exception as e:
        fail("write_lesson / generate_quizzes thất bại", str(e))
        return False


# ══════════════════════════════════════════
# 4. Test Full Pipeline (End-to-End với file thật)
# ══════════════════════════════════════════
async def test_full_pipeline():
    section("TEST 4: Full Agentic Pipeline (End-to-End)")

    # Tìm file PDF
    pdf_file = None
    data_dir = os.path.join(os.getcwd(), "data")
    if os.path.isdir(data_dir):
        for f in os.listdir(data_dir):
            if f.endswith(".pdf"):
                pdf_file = os.path.join(data_dir, f)
                break

    if not pdf_file:
        print("  ⚠️  Không tìm thấy file PDF trong ./data/ — bỏ qua test này")
        return True

    print(f"  📄 File: {os.path.basename(pdf_file)}")

    from app.db.session import engine
    from sqlalchemy.orm import Session
    from app.models.knowledge_items import KnowledgeItem
    from app.models.enrichment import EnrichmentJob
    from app.models.lessons import Lesson
    from app.models.quizzes import Quiz

    item_id = str(uuid.uuid4())
    user_id = "00000000-0000-0000-0000-000000000000"

    with Session(engine) as s:
        s.add(KnowledgeItem(
            id=item_id, user_id=user_id,
            title="[TEST] Pipeline", source_type="pdf",
            source_url=pdf_file, status="pending",
            processing_stage="ingestion", language="vi"
        ))
        s.commit()

    t0 = time.monotonic()
    try:
        from app.workers.enrichment_pipeline import process_enrichment_task
        await process_enrichment_task("pdf", pdf_file, item_id)
        elapsed = time.monotonic() - t0
        ok(f"Pipeline hoàn tất", elapsed)
    except Exception as e:
        fail("Pipeline thất bại", str(e))
        return False

    # Verify DB
    with Session(engine) as s:
        jobs = s.query(EnrichmentJob).filter_by(item_id=uuid.UUID(item_id)).all()
        lessons = s.query(Lesson).filter_by(item_id=uuid.UUID(item_id)).all()
        quizzes = s.query(Quiz).join(Lesson, Quiz.lesson_id == Lesson.id).filter(Lesson.item_id == uuid.UUID(item_id)).all()

    all_done = all(j.status == "done" for j in jobs)
    ok(f"Enrichment jobs: {len(jobs)} jobs, tất cả = done: {all_done}")
    ok(f"Lessons trong DB: {len(lessons)}")
    ok(f"Quizzes trong DB: {len(quizzes)}")

    return all_done and len(lessons) > 0


# ══════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════
async def main():
    print(f"\n{'=' * 60}")
    print("  🤖 PHASE 2: AGENTIC PIPELINE TESTS")
    print(f"{'=' * 60}")

    results = []
    results.append(await test_ai_summary())
    results.append(await test_ai_outline())
    results.append(await test_ai_lesson_quiz())
    results.append(await test_full_pipeline())

    passed = sum(results)
    total  = len(results)

    print(f"\n{SEP}")
    print(f"  KẾT QUẢ: {passed}/{total} tests passed")
    print(SEP)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    asyncio.run(main())
