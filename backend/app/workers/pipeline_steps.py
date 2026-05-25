import time
import asyncio
import os
import json
import uuid
import re
from sqlalchemy.orm import Session
from app.db.session import engine
from app.models.knowledge_items import KnowledgeItem
from app.models.summaries import Summary
from app.models.mindmaps import Mindmap
from app.models.lessons import Lesson
from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer

from app.workers.pipeline_utils import (
    clean_text, 
    track_job, 
    update_stage,
    create_multimodal_analyzer
)

async def step_ingestion(source_type, source_url, item_id, ai_options=None, user_id=None):
    """Bước 1: Trích xuất dữ liệu thô."""
    print(f"[PIPELINE][{item_id}] Bắt đầu Giai đoạn 1: INGESTION (Nguồn: {source_type})")
    update_stage(item_id, f"Đang trích xuất nội dung từ {source_type}...")
    t0 = time.time()
    with Session(engine) as session:
        track_job(session, item_id, "ingestion", "running")
    
    from app.processors.base import ingestion_registry
    processor = ingestion_registry.get_processor(source_type)
    extracted_data = await processor.process(
        source_url, 
        ai_options=ai_options, 
        user_id=user_id, 
        item_id=item_id
    )
    
    raw_content = extracted_data.get("content", "")
    with Session(engine) as session:
        row = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if row:
            row.raw_content = raw_content
            if "segments" in extracted_data:
                meta = row.metadata_ or {}
                meta["segments"] = extracted_data["segments"]
                row.metadata_ = meta
            session.commit()
            extracted_data["title"] = row.title

    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: INGESTION (Latency: {lat:.2f}s)")
    return extracted_data


async def step_media_enrichment(item_id, segments, title, source_type, source_url=None, ai_options=None, user_id=None, version_label="Phiên bản gốc"):
    from app.processors.video.audio_processing import AudioVideoProcessor
    from app.processors.chunking.semantic_chunker import SemanticChunker
    from app.core.config import settings
    from app.services.vector_search_service import search_service
    
    upload_dir = settings.UPLOAD_DIR    
    av_processor = AudioVideoProcessor(upload_dir)
    analyzer = create_multimodal_analyzer(ai_options)
    analyzer.set_context(user_id=user_id, item_id=item_id)
    chunker = SemanticChunker()
    
    media_label = "Video" if source_url else "Audio"
    print(f"[PIPELINE][{item_id}] Bắt đầu Giai đoạn 2: MULTIMODAL ENRICHMENT ({media_label})")
    update_stage(item_id, "Đang chia đoạn ngữ nghĩa (Semantic Chunking)...")
    t0 = time.time()
    chunk_data = await chunker.process(segments)
    chunks = chunk_data["chunks"]
    temp_lessons = [None] * len(chunks)
    
    update_stage(item_id, f"Đang phân tích chi tiết {len(chunks)} đoạn nội dung (Vision/Audio)...")
    print_lock = asyncio.Lock()

    async def enrich_chunk(i, chunk):
        duration = chunk.get('end', 0) - chunk.get('start', 0)
        frame_paths = []
        if source_type == "video" and source_url:
            frame_paths = av_processor.extract_scene_frames(source_url, chunk.get("start", 0), duration, max_frames=3)
        try:
            analysis = await analyzer.process(chunk["text"], frame_paths=frame_paths)
            for p in frame_paths:
                if os.path.exists(p): os.remove(p)
            temp_lessons[i] = {
                "title": analysis.get("title", f"Phần {i+1}"),
                "keyConcept": analysis.get("keyConcept", ""),
                "example": analysis.get("example", ""),
                "difficulty": analysis.get("difficulty", "beginner"),
                "quizzes": analysis.get("quizzes", []),
                "start": chunk["start"], "end": chunk["end"], "content": chunk["text"]
            }
        except Exception as e:
            async with print_lock:
                print(f"[CHUNK {i+1}/{len(chunks)}] ❌ LỖI: {e} - Dùng fallback")
            temp_lessons[i] = {"title": f"Phần {i+1}", "keyConcept": chunk["text"], "example": "", "difficulty": "beginner", "start": chunk["start"], "end": chunk["end"], "content": chunk["text"]}

    chunk_tasks = [enrich_chunk(idx, chunks[idx]) for idx in range(len(chunks))]
    await asyncio.gather(*chunk_tasks)
    
    pre_chunked_texts = []
    chunk_metadatas = []
    lessons = []
    lesson_type = "video_lesson" if source_type in ("video", "youtube") else "audio_lesson"
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki:
            return []

        for idx, l in enumerate(temp_lessons):
            lid = uuid.uuid4()
            session.add(Lesson(
                id=lid, item_id=uuid.UUID(str(item_id)), 
                title=clean_text(l["title"]),
                content=clean_text(l["keyConcept"]), 
                example=clean_text(l["example"]), 
                order_index=idx,
                start_time=int(l["start"]), end_time=int(l["end"]),
                metadata_json=json.dumps({"difficulty": l["difficulty"]}, ensure_ascii=False),
                version_label=version_label
            ))
            lessons.append({"lesson_id": lid, "data": l})
            pre_chunked_texts.append(f"Chủ đề: {l['title']}\nNội dung: {l['keyConcept']}")
            chunk_metadatas.append({"lesson_id": str(lid), "start_time": l["start"], "end_time": l["end"], "type": lesson_type})
        session.commit()

    await search_service.index_document(item_id, chunks=pre_chunked_texts, chunk_metadatas=chunk_metadatas, metadata={"title": title, "source_type": source_type})
    with Session(engine) as session: track_job(session, item_id, "ingestion", "done")
    
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: MULTIMODAL ENRICHMENT (Latency: {lat:.2f}s)")
    return lessons

async def step_indexing(item_id, content, title, source_type):
    from app.services.vector_search_service import search_service
    from app.processors.chunking.text_chunker import TextChunker
    
    print(f"[PIPELINE][{item_id}] Bắt đầu: INDEXING (song song với Summarization)")
    update_stage(item_id, "Đang lập chỉ mục tài liệu (Embedding)...")
    t0 = time.time()

    text_chunker = TextChunker()
    chunk_data = await text_chunker.process(content)
    await search_service.index_document(item_id, chunks=chunk_data["chunks"], metadata={"title": title, "source_type": source_type})
    with Session(engine) as session: track_job(session, item_id, "ingestion", "done")

    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: INDEXING (Latency: {lat:.2f}s)")


async def step_lesson_and_quiz_generation(item_id, summary_data, extractor, difficulty="intermediate", version_label="Phiên bản gốc", generate_quiz=True):
    from app.services.vector_search_service import search_service

    print(f"[PIPELINE][{item_id}] Bắt đầu: LESSON + QUIZ GENERATION")
    update_stage(item_id, "Đang lập dàn ý cấu trúc bài học...")
    t0 = time.time()

    outline = await extractor.generate_outline(summary_data)
    print(f"[PIPELINE][{item_id}] Đã lập xong dàn ý: {len(outline)} bài học.")

    async def process_lesson_and_quiz(idx, item):
        ctx_chunks = await search_service.search_chunks(
            f"{item['title']} {item['description']}", top_k=3, item_id=item_id
        )
        ctx_text = "\n".join(ctx_chunks)

        l_data = await extractor.write_lesson(item['title'], item['description'], ctx_text)

        lid = uuid.uuid4()
        d = l_data
        with Session(engine) as session:
            ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
            if not ki: return

            session.add(Lesson(
                id=lid, item_id=uuid.UUID(str(item_id)),
                title=clean_text(d.get("title", "")), 
                content=clean_text(d.get("keyConcept", "")),
                example=clean_text(d.get("example", "")), 
                order_index=idx,
                version_label=version_label
            ))
            session.commit()

        if generate_quiz:
            try:
                quiz_data = await extractor.generate_quizzes(l_data, difficulty=difficulty)
                if quiz_data:
                    with Session(engine) as session:
                        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
                        if not ki: return

                        qid = uuid.uuid4()
                        session.add(Quiz(id=qid, lesson_id=lid, title=version_label))
                        for q_idx, q in enumerate(quiz_data):
                            q_id = uuid.uuid4()
                            q_type = "single_choice" if q.get("question_type", "mcq") == "mcq" else q.get("question_type")

                            session.add(QuizQuestion(
                                id=q_id, quiz_id=qid,
                                question=clean_text(q.get("question", "")),
                                question_type=q_type,
                                explanation=clean_text(q.get("explanation", "")),
                                order_index=q_idx
                            ))
                            options = q.get("options", [])
                            try: correct_idx = int(q.get("correct_index", 0))
                            except: correct_idx = 0

                            for a_idx, opt in enumerate(options):
                                session.add(QuizAnswer(
                                    id=uuid.uuid4(), question_id=q_id,
                                    content=clean_text(opt), is_correct=(a_idx == correct_idx), order_index=a_idx
                                ))
                        session.commit()
            except Exception as e:
                print(f"[LESSON+QUIZ] Bài {idx+1}: Lỗi lưu quiz: {e}")

        return {"lesson_id": lid, "data": d, "idx": idx}

    results = await asyncio.gather(*[
        process_lesson_and_quiz(i, item)
        for i, item in enumerate(outline)
    ])
    final_lessons = sorted([r for r in results if r], key=lambda x: x["idx"])

    with Session(engine) as session: track_job(session, item_id, "quiz", "done")
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: LESSON + QUIZ GENERATION (Latency: {lat:.2f}s)")
    return final_lessons

async def step_summarization(item_id, content, extractor, lessons=None, source_type=None, target="both", version_label="Phiên bản gốc"):
    print(f"[PIPELINE][{item_id}] Bắt đầu: SUMMARIZATION & MINDMAP (Target: {target})")
    t0 = time.time()
    with Session(engine) as session: track_job(session, item_id, "summary", "running")
    update_stage(item_id, f"Đang tổng hợp thông tin & tạo sơ đồ tư duy ({target})...")

    if target == "summary" and lessons:
        from app.ai.prompts import PROMPT_SYNTHESIS_SUMMARY
        lesson_texts = "\n".join([f"Bài {l['data'].get('title')}: {l['data'].get('keyConcept')}" for l in lessons if 'data' in l])
        prompt_text = PROMPT_SYNTHESIS_SUMMARY.format(data=lesson_texts)
        raw_result = await extractor.struct_summary_only.ainvoke(prompt_text)
        res, _, _ = extractor._unpack(raw_result)
        summary_data = {"summary": res.summary.model_dump()}

    elif target == "both" and lessons:
        lesson_texts = [f"Bài {l['data'].get('title')}: {l['data'].get('keyConcept')}" for l in lessons if 'data' in l]
        if lesson_texts:
            if len(content) < 200:
                enrichment_text = "\n".join(lesson_texts)
            else:
                enrichment_text = f"NỘI DUNG GỐC:\n{content}\n\nNỘI DUNG CHI TIẾT TỪ CÁC BÀI HỌC:\n" + "\n".join(lesson_texts)
        else:
            enrichment_text = content
        summary_data = await extractor.analyze_long_text(enrichment_text, target=target)
    else:
        summary_data = await extractor.analyze_long_text(content, target=target)

    s = summary_data.get("summary", {})
    highlights = s.get("highlights", [])

    if source_type != 'pdf':
        for h in highlights:
            if isinstance(h, dict) and not h.get("media_timestamp"):
                kw = h.get("keyword", "")
                if kw:
                    idx = content.lower().find(kw.lower())
                    if idx != -1:
                        prefix = content[:idx]
                        matches = re.findall(r'\[(\d{2}:\d{2}(?::\d{2})?)\]', prefix)
                        if matches: h["media_timestamp"] = matches[-1]
    else:
        for h in highlights:
            if isinstance(h, dict):
                h["media_timestamp"] = None
                if not h.get("page_number"):
                    kw = h.get("keyword", "")
                    if kw:
                        idx = content.lower().find(kw.lower())
                        if idx != -1:
                            prefix = content[:idx]
                            page_matches = re.findall(r'\[P(\d+)\]', prefix)
                            if page_matches: h["page_number"] = int(page_matches[-1])

    unique_highlights = {}
    for h in highlights:
        if isinstance(h, dict):
            kw = h.get("keyword", "").strip()
            if not kw: continue
            key = kw.lower()
            if key in unique_highlights:
                if h.get("media_timestamp") and not unique_highlights[key].get("media_timestamp"):
                    unique_highlights[key] = h
            else:
                unique_highlights[key] = h
    final_highlights = list(unique_highlights.values())

    with Session(engine) as session:
        ki_exists = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki_exists: return summary_data

        if target in ("both", "summary") and "summary" in summary_data:
            s = summary_data["summary"]
            new_title = s.get("title")
            if new_title and ki_exists:
                ki_exists.title = clean_text(new_title)

            session.add(Summary(
                id=uuid.uuid4(),
                item_id=uuid.UUID(str(item_id)),
                content=clean_text(s.get("detailed", "")),
                tldr=[clean_text(t) for t in s.get("tldr", [])],
                highlights=final_highlights,
                version_label=version_label
            ))

        if target in ("both", "mindmap") and "mindmap" in summary_data:
            mindmap_data = summary_data["mindmap"]
            if isinstance(mindmap_data, dict) and mindmap_data.get("children"):
                session.add(Mindmap(
                    id=uuid.uuid4(), 
                    item_id=uuid.UUID(str(item_id)), 
                    data=mindmap_data,
                    version_label=version_label
                ))
        session.commit()

    with Session(engine) as session: track_job(session, item_id, "summary", "done")
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: SUMMARIZATION (Latency: {lat:.2f}s)")
    return summary_data


async def step_quiz_generation(item_id, lessons, extractor, difficulty="intermediate", version_label=None):
    print(f"[PIPELINE][{item_id}] Bắt đầu Giai đoạn 4: QUIZ GENERATION (Độ khó: {difficulty})")
    t0 = time.time()
    with Session(engine) as session: track_job(session, item_id, "quiz", "running")
    update_stage(item_id, f"Đang sinh câu hỏi trắc nghiệm ({difficulty}) cho {len(lessons)} bài học...")
    
    from datetime import datetime
    run_time_str = datetime.now().strftime("%d/%m %H:%M:%S")
    if difficulty in ["intermediate", "normal"]: run_label = f"Phiên bản {run_time_str} (Trung bình)"
    elif difficulty in ["advanced", "expert"]: run_label = f"Phiên bản {run_time_str} (Nâng cao)"
    elif difficulty in ["easy", "beginner"]: run_label = f"Phiên bản {run_time_str} (Cơ bản)"
    else: run_label = f"Phiên bản {run_time_str} ({difficulty})"

    final_label = version_label if version_label else run_label

    async def make_quiz(lesson_id, l_data):
        try:
            quiz_data = await extractor.generate_quizzes(l_data, difficulty=difficulty)
            if not quiz_data: return
            with Session(engine) as session:
                ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
                if not ki: return

                qid = uuid.uuid4()
                session.add(Quiz(id=qid, lesson_id=lesson_id, title=final_label))
                for q_idx, q in enumerate(quiz_data):
                    q_id = uuid.uuid4()
                    q_type = "single_choice" if q.get("question_type", "mcq") == "mcq" else q.get("question_type")
                    session.add(QuizQuestion(
                        id=q_id, quiz_id=qid,
                        question=clean_text(q.get("question", "")),
                        question_type=q_type,
                        explanation=clean_text(q.get("explanation", "")),
                        order_index=q_idx
                    ))
                    options = q.get("options", [])
                    try: correct_idx = int(q.get("correct_index", 0))
                    except: correct_idx = 0
                    for a_idx, opt in enumerate(options):
                        session.add(QuizAnswer(
                            id=uuid.uuid4(), question_id=q_id,
                            content=clean_text(opt), is_correct=(a_idx == correct_idx), order_index=a_idx
                        ))
                session.commit()
        except Exception as e: print(f"Lỗi lưu quiz: {e}")

    await asyncio.gather(*[make_quiz(l["lesson_id"], l["data"]) for l in lessons])
    with Session(engine) as session: track_job(session, item_id, "quiz", "done")
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: QUIZ GENERATION (Latency: {lat:.2f}s)")
