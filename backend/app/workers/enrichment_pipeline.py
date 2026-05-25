import time
import warnings
warnings.filterwarnings("ignore", message="PydanticSerializationUnexpectedValue")
import uuid
import asyncio
from typing import Dict, Any

from sqlalchemy.orm import Session
from app.db.session import engine
from app.models.knowledge_items import KnowledgeItem
from app.models.lessons import Lesson
from app.models.summaries import Summary

from app.workers.pipeline_utils import (
    create_extractor,
    track_job
)
from app.workers.pipeline_steps import (
    step_ingestion,
    step_media_enrichment,
    step_indexing,
    step_lesson_and_quiz_generation,
    step_summarization,
    step_quiz_generation
)
from app.core.logging import logger

async def process_enrichment_task(source_type: str, source_url: str, item_id: str = None, ai_options: Dict[str, Any] | None = None):
    pipeline_start_time = time.time()
    if not item_id: item_id = str(uuid.uuid4())
    logger.info(f"[{item_id}] BẮT ĐẦU PIPELINE ({source_type})")
    
    extractor = create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).first()
        user_id_str = str(ki.user_id) if ki and ki.user_id else None
    extractor.set_context(user_id=user_id_str, item_id=item_id)
    
    extracted_data = await step_ingestion(source_type, source_url, item_id, ai_options=ai_options, user_id=user_id_str)
    content = extracted_data["content"]
    title = extracted_data.get("title", "Untitled")
    
    if user_id_str:
        import math
        from app.services.credit_service import check_user_balance
        char_count = len(content)
        estimated_credits = max(1, math.ceil((char_count / 20000) * 1.2))
        
        if not check_user_balance(user_id_str, estimated_credits):
            logger.error(f"[{item_id}] INSUFFICIENT CREDITS (Cần ~{estimated_credits} credits)")
            from app.utils.cleanup import delete_item_completely
            await delete_item_completely(item_id, extracted_data.get("source_url", ""))
            return item_id
    
    if "segments" in extracted_data:
        lessons = await step_media_enrichment(item_id, extracted_data["segments"], title, source_type, source_url=source_url, ai_options=ai_options, user_id=user_id_str)
        summary_data = await step_summarization(item_id, content, extractor=extractor, lessons=lessons, source_type=source_type)
        await step_quiz_generation(item_id, lessons, extractor)
    else:
        summary_data, _ = await asyncio.gather(
            step_summarization(item_id, content, extractor=extractor, source_type=source_type),
            step_indexing(item_id, content, title, source_type)
        )
        lessons = await step_lesson_and_quiz_generation(item_id, summary_data, extractor)

    try:
        with Session(engine) as session:
            track_job(session, item_id, "lessons_generation", "done")
            session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({
                "status": "done", "processing_stage": "done"
            })
            session.commit()
    finally:
        if source_url and not source_url.startswith("http"):
            import os
            if os.path.exists(source_url):
                try:
                    os.remove(source_url)
                    from app.db.session import SessionLocal
                    with SessionLocal() as session:
                        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({"source_url": ""})
                        session.commit()
                except Exception as e:
                    logger.error(f"[{item_id}] Lỗi xóa file tạm: {e}")

    if user_id_str:
        from app.services.credit_service import deduct_total_pipeline_cost
        from datetime import datetime, timezone
        deduct_total_pipeline_cost(item_id, user_id_str, datetime.fromtimestamp(pipeline_start_time, tz=timezone.utc), "Tạo bài học & Quiz", title)

    logger.info(f"[{item_id}] HOÀN TẤT TOÀN BỘ PIPELINE! (Time: {time.time() - pipeline_start_time:.2f}s)")
    return item_id

async def process_live_recording_task(
    item_id: str,
    full_content: str,
    segments: list,
    title: str = "Bản ghi âm trực tiếp",
    ai_options: Dict[str, Any] | None = None,
):
    pipeline_start_time = time.time()
    logger.info(f"[{item_id}] BẮT ĐẦU PIPELINE LIVE RECORDING")
    extractor = create_extractor(ai_options)

    with Session(engine) as session:
        row = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).first()
        if row:
            user_id_str = str(row.user_id) if row.user_id else None
            meta = row.metadata_ or {}
            meta["segments"] = segments
            row.metadata_ = meta
            session.commit()
        else:
            user_id_str = None
    
    extractor.set_context(user_id=user_id_str, item_id=item_id)

    if user_id_str:
        import math
        from app.services.credit_service import check_user_balance
        char_count = len(full_content)
        estimated_credits = max(1, math.ceil((char_count / 20000) * 1.2))
        if not check_user_balance(user_id_str, estimated_credits):
            from app.utils.cleanup import delete_item_completely
            await delete_item_completely(item_id)
            return item_id

    lessons = await step_media_enrichment(item_id, segments, title, "audio", ai_options=ai_options)
    await step_summarization(item_id, full_content, extractor=extractor, lessons=lessons)
    await step_quiz_generation(item_id, lessons, extractor)

    with Session(engine) as session:
        track_job(session, item_id, "lessons_generation", "done")
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({
            "status": "done", "processing_stage": "done"
        })
        session.commit()

    if user_id_str:
        from app.services.credit_service import deduct_total_pipeline_cost
        from datetime import datetime, timezone
        deduct_total_pipeline_cost(item_id, user_id_str, datetime.fromtimestamp(pipeline_start_time, tz=timezone.utc), "Xử lý Ghi âm trực tiếp", title)

    logger.info(f"[{item_id}] HOÀN TẤT LIVE RECORDING PIPELINE! (Time: {time.time() - pipeline_start_time:.2f}s)")
    return item_id

async def regenerate_lessons_task(item_id: str, ai_options: Dict[str, Any] | None = None):
    logger.info(f"[REGENERATE][{item_id}] Bắt đầu tạo lại toàn bộ Lessons & Quizzes")
    extractor = create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        user_id_str = str(ki.user_id) if ki.user_id else None
        extractor.set_context(user_id=user_id_str, item_id=item_id)
        
        content, title, source_type, source_url = ki.raw_content, ki.title, ki.source_type, ki.source_url
        summary_rec = session.query(Summary).filter(Summary.item_id == uuid.UUID(str(item_id))).first()
        summary_data = {"summary": {"detailed": summary_rec.content, "tldr": summary_rec.tldr}} if summary_rec else {}

    from datetime import datetime
    version_label = f"Phiên bản {datetime.now().strftime('%d/%m %H:%M:%S')}"

    if source_type in ("video", "audio", "youtube"):
        saved_segments = (ki.metadata_ or {}).get("segments")
        if saved_segments:
            from app.processors.chunking.semantic_chunker import SemanticChunker
            chunker = SemanticChunker()
            chunks_data = await chunker.process(content, segments=saved_segments)
            input_segments = chunks_data["chunks"]
        else:
            from app.processors.chunking.semantic_chunker import SemanticChunker
            chunker = SemanticChunker()
            chunks_data = await chunker.process(content)
            input_segments = [{"start": 0, "end": 0, "text": c} for c in chunks_data["chunks"]]

        lessons = await step_media_enrichment(item_id, input_segments, title, source_type, source_url=source_url, ai_options=ai_options, user_id=user_id_str, version_label=version_label)
    else:
        await step_indexing(item_id, content, title, source_type)
        lessons = await step_lesson_and_quiz_generation(item_id, summary_data, extractor, version_label=version_label, generate_quiz=False)

    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({"status": "done", "processing_stage": "done"})
        session.commit()
    logger.info(f"[REGENERATE][{item_id}] HOÀN TẤT tạo lại Lessons & Quizzes (version: {version_label})")

async def regenerate_quiz_task(item_id: str, difficulty: str = "intermediate", ai_options: Dict[str, Any] | None = None):
    logger.info(f"[REGENERATE][{item_id}] Bắt đầu tạo lại Quiz (Difficulty: {difficulty})")
    extractor = create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        extractor.set_context(user_id=str(ki.user_id) if ki.user_id else None, item_id=item_id)
        
        latest_lesson = session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id))).order_by(Lesson.created_at.desc()).first()
        if not latest_lesson: return
            
        lessons_q = session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id)), Lesson.version_label == latest_lesson.version_label).order_by(Lesson.order_index).all()
        lessons_list = [{"lesson_id": l.id, "data": {"title": l.title, "keyConcept": l.content, "example": l.example}} for l in lessons_q]

    await step_quiz_generation(item_id, lessons_list, extractor, difficulty=difficulty)
    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({"status": "done", "processing_stage": "done"})
        session.commit()

async def regenerate_summary_task(item_id: str, ai_options: Dict[str, Any] | None = None):
    logger.info(f"[REGENERATE][{item_id}] Bắt đầu tạo lại Tóm tắt")
    extractor = create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        extractor.set_context(user_id=str(ki.user_id) if ki.user_id else None, item_id=item_id)
        
        content, source_type = ki.raw_content, ki.source_type
        lessons_list = [{"data": {"title": l.title, "keyConcept": l.content}} for l in session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id))).order_by(Lesson.order_index).all()]

    from datetime import datetime
    version_label = f"Phiên bản {datetime.now().strftime('%d/%m %H:%M:%S')}"

    await step_summarization(item_id, content, extractor, lessons=lessons_list, source_type=source_type, target="summary", version_label=version_label)
    
    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({"status": "done", "processing_stage": "done"})
        session.commit()

async def regenerate_mindmap_task(item_id: str, ai_options: Dict[str, Any] | None = None):
    logger.info(f"[REGENERATE][{item_id}] Bắt đầu tạo lại Mindmap")
    extractor = create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        extractor.set_context(user_id=str(ki.user_id) if ki.user_id else None, item_id=item_id)
        content, source_type = ki.raw_content, ki.source_type

    from datetime import datetime
    version_label = f"Phiên bản {datetime.now().strftime('%d/%m %H:%M:%S')}"
    await step_summarization(item_id, content, extractor, source_type=source_type, target="mindmap", version_label=version_label)
    
    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({"status": "done", "processing_stage": "done"})
        session.commit()
