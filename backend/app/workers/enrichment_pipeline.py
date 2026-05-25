import time
import warnings
# Ẩn các cảnh báo Pydantic v2 dư thừa (xảy ra khi LangChain/LangGraph serialize state)
warnings.filterwarnings("ignore", message="PydanticSerializationUnexpectedValue")
import uuid
import asyncio
from typing import Dict, Any

from app.processors.base import ingestion_registry
from app.search.service import search_service
from app.db.session import engine
from sqlalchemy.orm import Session
from app.models.knowledge_items import KnowledgeItem
from app.models.enrichment import EnrichmentJob
from app.models.summaries import Summary
from app.models.mindmaps import Mindmap
from app.models.lessons import Lesson
from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer

# ===== GLOBAL RATE LIMITER =====
from app.ai.rate_limiter import GLOBAL_LLM_SEMAPHORE

def _clean_key(value: Any) -> str | None:
    if value is None:
        return None
    key = str(value).strip().strip('"').strip("'").strip()
    return key or None

def _clean_text(text: Any) -> str:
    """Loại bỏ ký tự null (\x00) và các ký tự điều khiển lạ gây lỗi DB Postgres."""
    if not text:
        return ""
    if not isinstance(text, str):
        text = str(text)
    return text.replace("\x00", "").strip()

def _normalize_ai_options(ai_options: Dict[str, Any] | None, task: str = "text") -> Dict[str, Any]:
    """
    Chuẩn hóa ai_options cho 1 loại tác vụ cụ thể.
    ai_options có thể là:
    - Dict mới: {"text": {...}, "vision": {...}, "stt": {...}}
    - Dict cũ: {"provider": ..., "model": ..., "api_key": ...}  (backward compat)
    """
    if not ai_options:
        return {"provider": "openai", "model": "gpt-4o-mini", "api_key": None}

    # Mới: nested theo task
    if task in ai_options and isinstance(ai_options[task], dict):
        raw = ai_options[task]
    elif "provider" in ai_options:
        # Cũ: flat dict
        raw = ai_options
    else:
        raw = {}

    provider = str(raw.get("provider", "openai")).strip().lower()
    model = str(raw.get("model", "")).strip()
    raw_key = raw.get("api_key")
    api_key = _clean_key(raw_key)

    # Map frontend provider id -> backend provider id + model mặc định
    provider_map = {
        "openai":    ("openai",    "gpt-4o-mini"),
        "gemini":    ("google",    "gemini-2.0-flash"),
        "google":    ("google",    "gemini-2.0-flash"),
        "anthropic": ("anthropic", "claude-3-haiku-20240307"),
        "grok":      ("grok",      "grok-3"),
    }

    if provider not in provider_map:
        print(f"[AI-RUNTIME] Provider '{provider}' không hỗ trợ, fallback -> openai/gpt-4o-mini")
        return {"provider": "openai", "model": "gpt-4o-mini", "api_key": None}

    backend_provider, default_model = provider_map[provider]
    return {
        "provider": backend_provider,
        "model": model or default_model,
        "api_key": api_key
    }


def _create_extractor(ai_options: Dict[str, Any] | None):
    """Tạo KnowledgeExtractor dùng config text task."""
    from app.ai.extractor import KnowledgeExtractor
    options = _normalize_ai_options(ai_options, task="text")
    print(
        f"[AI-RUNTIME][text] provider={options['provider']} model={options['model']} "
        f"source={'user-key' if options['api_key'] else 'system-default'}"
    )
    return KnowledgeExtractor(
        provider=options["provider"],
        model=options["model"],
        api_key=options["api_key"]
    )

def _create_multimodal_analyzer(ai_options: Dict[str, Any] | None):
    """Tạo MultimodalAnalyzer dùng config vision task."""
    from app.processors.ai.multimodal_analyzer import MultimodalAnalyzer
    options = _normalize_ai_options(ai_options, task="vision")
    print(
        f"[AI-RUNTIME][vision] provider={options['provider']} model={options['model']} "
        f"source={'user-key' if options['api_key'] else 'system-default'}"
    )
    return MultimodalAnalyzer(
        provider=options["provider"],
        model_name=options["model"],
        api_key=options["api_key"]
    )

def _create_transcriber(ai_options: Dict[str, Any] | None):
    """Tạo Transcriber (STT) dùng config stt task."""
    from app.processors.video.transcription import Transcriber
    options = _normalize_ai_options(ai_options, task="stt")
    return Transcriber(
        model_name=options["model"] or "whisper-1",
        api_key=options["api_key"]
    )


async def _generate_title_from_content(content: str, fallback_title: str, ai_options=None) -> str:
    """Dùng LLM để sinh tiêu đề ngắn gọn, có nghĩa từ nội dung đã trích xuất.
    Chỉ lấy ~500 từ đầu để tiết kiệm token và giữ tốc độ nhanh.
    Trả về fallback_title nếu xảy ra lỗi.
    """
    try:
        from app.ai.providers import get_chat_provider
        from langchain_core.messages import HumanMessage, SystemMessage

        options = _normalize_ai_options(ai_options, task="text")

        # Cắt ngắn chỉ lấy 500 từ đầu — đủ để LLM hiểu chủ đề
        words = content.split()
        snippet = " ".join(words[:500])

        llm = get_chat_provider(
            provider=options["provider"],
            model=options["model"],
            api_key=options["api_key"]
        )

        messages = [
            SystemMessage(content=(
                "Bạn là trợ lý đặt tiêu đề tài liệu. "
                "Hãy đọc đoạn văn bản sau và trả lời CHỈ MỘT dòng tiêu đề ngắn gọn (tối đa 10 từ), "
                "phản ánh đúng nội dung chính. Không giải thích, không dấu ngoặc kép."
            )),
            HumanMessage(content=f"Nội dung:\n{snippet}")
        ]

        t0 = time.time()
        response = await llm.ainvoke(messages)
        generated = response.content.strip().strip('"').strip("'")
        lat = time.time() - t0

        # Kiểm tra kết quả hợp lệ (không rỗng, không quá dài)
        if generated and len(generated) <= 150:
            print(f"[TITLE-GEN] Sinh tiêu đề thành công (Latency: {lat:.2f}s): '{generated}'")
            return generated
        else:
            print(f"[TITLE-GEN] Kết quả không hợp lệ, dùng fallback: '{fallback_title}'")
            return fallback_title

    except Exception as e:
        print(f"[TITLE-GEN] Lỗi khi sinh tiêu đề (dùng fallback): {e}")
        return fallback_title


def track_job(session, item_id_str, job_type, status):
    """Cập nhật trạng thái EnrichmentJob an toàn khi nhiều session chạy song song.
    Dùng raw UPDATE thay vì ORM load→modify→commit để tránh StaleDataError."""
    item_uuid = uuid.UUID(str(item_id_str))
    # Thực thi UPDATE trực tiếp — không load object vào ORM cache, an toàn với concurrent sessions
    rows_updated = session.query(EnrichmentJob).filter_by(
        item_id=item_uuid, job_type=job_type
    ).update({"status": status}, synchronize_session=False)

    if rows_updated == 0:
        # Chưa có row → INSERT mới
        session.add(EnrichmentJob(
            id=uuid.uuid4(), item_id=item_uuid, job_type=job_type, status=status
        ))
    session.commit()


def update_stage(item_id: str, stage: str):
    """Cập nhật processing_stage để Frontend polling có thể hiển thị tiến trình chi tiết."""
    try:
        with Session(engine) as session:
            session.query(KnowledgeItem).filter(
                KnowledgeItem.id == uuid.UUID(str(item_id))
            ).update({"processing_stage": stage})
            session.commit()
    except Exception as e:
        print(f"[STAGE] WARNING: Không thể cập nhật stage '{stage}': {e}")

async def _step_ingestion(source_type, source_url, item_id, ai_options=None, user_id=None):
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
    
    # Sinh tiêu đề bằng LLM từ nội dung vừa trích xuất
    raw_content = extracted_data.get("content", "")
    # fallback_title = extracted_data.get("title") or f"Document {item_id}"
    
    # update_stage(item_id, "Đang đặt tiêu đề tài liệu...")
    # generated_title = await _generate_title_from_content(
    #     content=raw_content,
    #     fallback_title=fallback_title,
    #     ai_options=ai_options
    # )

    # Cập nhật KnowledgeItem với title do LLM sinh ra và lưu segments vào metadata
    with Session(engine) as session:
        row = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if row:
            row.raw_content = raw_content
            
            # Lưu segments vào metadata để tái sử dụng khi regenerate
            if "segments" in extracted_data:
                meta = row.metadata_ or {}
                meta["segments"] = extracted_data["segments"]
                row.metadata_ = meta
                
            session.commit()
            # Trả lại title gốc đã lưu trong DB để các bước sau (indexing/search) sử dụng thống nhất
            extracted_data["title"] = row.title

    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: INGESTION (Latency: {lat:.2f}s)")
    return extracted_data

async def _step_media_enrichment(item_id, segments, title, source_type, source_url=None, ai_options=None, user_id=None, version_label="Phiên bản gốc"):
    """Bước chung cho Video/Audio: Chia đoạn ngữ nghĩa + Multimodal Analysis.
    
    Args:
        source_url: Đường dẫn file video để trích xuất frames. Nếu None → audio-only (không có frames).
        ai_options: Cấu hình AI đa tác vụ (được truyền từ orchestrator).
    """
    from app.processors.video.audio_processing import AudioVideoProcessor
    from app.processors.chunking.semantic_chunker import SemanticChunker
    import os, json
    from app.config import settings
    
    upload_dir = settings.UPLOAD_DIR    
    av_processor = AudioVideoProcessor(upload_dir)
    analyzer = _create_multimodal_analyzer(ai_options)   # <-- Dùng vision config
    analyzer.set_context(user_id=user_id, item_id=item_id) # <-- Gán context để ghi log user
    chunker = SemanticChunker()
    
    media_label = "Video" if source_url else "Audio"
    print(f"[PIPELINE][{item_id}] Bắt đầu Giai đoạn 2: MULTIMODAL ENRICHMENT ({media_label})")
    update_stage(item_id, "Đang chia đoạn ngữ nghĩa (Semantic Chunking)...")
    t0 = time.time()
    print(f"[{item_id}] Đang chia đoạn ngữ nghĩa cho {media_label}...")
    chunk_data = await chunker.process(segments)
    chunks = chunk_data["chunks"]
    temp_lessons = [None] * len(chunks)
    
    print(f"[PIPELINE][{item_id}] Đã chia được {len(chunks)} chunks. Bắt đầu Multimodal Analysis (chạy song song)...")
    update_stage(item_id, f"Đang phân tích chi tiết {len(chunks)} đoạn nội dung (Vision/Audio)...")

    print_lock = asyncio.Lock()

    async def enrich_chunk(i, chunk):
        t_chunk = time.time()
        duration = chunk.get('end', 0) - chunk.get('start', 0)
        async with print_lock:
            print(f"[CHUNK {i+1}/{len(chunks)}] Bắt đầu | [{chunk.get('start', 0):.0f}s - {chunk.get('end', 0):.0f}s] ({duration:.0f}s) | {len(chunk.get('text',''))} ký tự")
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
            async with print_lock:
                print(f"[CHUNK {i+1}/{len(chunks)}] ✅ HOÀN TẤT | Tiêu đề: '{temp_lessons[i]['title']}' (Latency: {time.time()-t_chunk:.2f}s)")
        except Exception as e:
            async with print_lock:
                print(f"[CHUNK {i+1}/{len(chunks)}] ❌ LỖI: {e} - Dùng fallback")
            temp_lessons[i] = {"title": f"Phần {i+1}", "keyConcept": chunk["text"], "example": "", "difficulty": "beginner", "start": chunk["start"], "end": chunk["end"], "content": chunk["text"]}

    chunk_tasks = [enrich_chunk(idx, chunks[idx]) for idx in range(len(chunks))]
    await asyncio.gather(*chunk_tasks)
    print(f"[PIPELINE][{item_id}] Đã hoàn tất phân tích tất cả {len(chunks)} chunks. Đang lưu vào Database...")
    
    # Lưu Lessons vào DB và Index
    pre_chunked_texts = []
    chunk_metadatas = []
    lessons = []
    lesson_type = "video_lesson" if source_type in ("video", "youtube") else "audio_lesson"
    with Session(engine) as session:
        # Kiểm tra existence trước khi insert (đề phòng bị xóa khi đang xử lý)
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki:
            print(f"[PIPELINE][{item_id}] ⚠ Item không tồn tại. Hủy lưu lessons.")
            return []

        for idx, l in enumerate(temp_lessons):
            lid = uuid.uuid4()
            session.add(Lesson(
                id=lid, item_id=uuid.UUID(str(item_id)), 
                title=_clean_text(l["title"]),
                content=_clean_text(l["keyConcept"]), 
                example=_clean_text(l["example"]), 
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

async def _step_indexing(item_id, content, title, source_type):
    """Bước Index: Text chunking + Embedding + Lưu vào Chroma/Postgres.
    Tách riêng để có thể chạy SONG SONG với Summarization."""
    from app.search.service import search_service
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


async def _step_lesson_and_quiz_generation(item_id, summary_data, extractor, difficulty="intermediate", version_label="Phiên bản gốc", generate_quiz=True):
    """Gộp Lesson + Quiz với 2 semaphore riêng (lesson_semaphore + quiz_semaphore).
    Cách 2: Pre-fetch tất cả search_chunks song song trước khi bắt đầu viết bài.
    Cách 3: lesson và quiz dùng semaphore riêng — không tranh slot, không bị block."""
    from app.search.service import search_service

    print(f"[PIPELINE][{item_id}] Bắt đầu: LESSON + QUIZ GENERATION (Pre-fetch + 2 semaphore riêng)")
    update_stage(item_id, "Đang lập dàn ý cấu trúc bài học...")
    t0 = time.time()

    outline = await extractor.generate_outline(summary_data)
    # AI tự quyết định số lượng bài dựa trên độ phức tạp của tài liệu
    print(f"[PIPELINE][{item_id}] Đã lập xong dàn ý: {len(outline)} bài học.")

    async def process_lesson_and_quiz(idx, item):
        """Mỗi task tự Search -> AI Write Lesson -> AI Write Quiz. Xong đâu chạy đấy!"""
        # 1. Tìm kiến thức riêng cho bài này
        from app.search.service import search_service
        print(f"[LESSON+QUIZ] Bài {idx+1}: '{item['title']}' — Đang tìm kiếm kiến thức...")
        ctx_chunks = await search_service.search_chunks(
            f"{item['title']} {item['description']}", top_k=3, item_id=item_id
        )
        ctx_text = "\n".join(ctx_chunks)

        # 2. Bước 1: Write lesson (dùng lesson_semaphore riêng)
        print(f"[LESSON+QUIZ] Bài {idx+1}: '{item['title']}' — AI đang soạn nội dung bài học...")
        l_data = await extractor.write_lesson(item['title'], item['description'], ctx_text)

        # 3. Bước 2: Lưu lesson vào DB
        lid = uuid.uuid4()
        d = l_data
        with Session(engine) as session:
            # Kiểm tra existence trước khi insert
            ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
            if not ki:
                print(f"[LESSON+QUIZ] [{item_id}] ⚠ Item không tồn tại. Hủy lưu lesson.")
                return

            session.add(Lesson(
                id=lid, item_id=uuid.UUID(str(item_id)),
                title=_clean_text(d.get("title", "")), 
                content=_clean_text(d.get("keyConcept", "")),
                example=_clean_text(d.get("example", "")), 
                order_index=idx,
                version_label=version_label
            ))
            session.commit()
        print(f"[LESSON+QUIZ] Bài {idx+1}: '{d.get('title','?')}' — Lesson saved.")

        if generate_quiz:
            print(f"[LESSON+QUIZ] Bài {idx+1}: '{d.get('title','?')}' — Bắt đầu Quiz...")
            # 4. Bước 3: Sinh quiz NGAY (dùng quiz_semaphore riêng)
            try:
                quiz_data = await extractor.generate_quizzes(l_data, difficulty=difficulty)
                if quiz_data:
                    with Session(engine) as session:
                        # Kiểm tra existence
                        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
                        if not ki:
                            print(f"[LESSON+QUIZ] [{item_id}] ⚠ Item không tồn tại. Hủy lưu quiz.")
                            return

                        qid = uuid.uuid4()
                        session.add(Quiz(id=qid, lesson_id=lid, title=version_label))
                        for q_idx, q in enumerate(quiz_data):
                            q_id = uuid.uuid4()
                            q_type = q.get("question_type", "mcq")
                            if q_type == "mcq": q_type = "single_choice"

                            session.add(QuizQuestion(
                                id=q_id, quiz_id=qid,
                                question=_clean_text(q.get("question", "")),
                                question_type=q_type,
                                explanation=_clean_text(q.get("explanation", "")),
                                order_index=q_idx
                            ))
                            options = q.get("options", [])
                            try:
                                correct_idx = int(q.get("correct_index", 0))
                            except (ValueError, TypeError):
                                correct_idx = 0

                            for a_idx, opt in enumerate(options):
                                is_correct = (a_idx == correct_idx)
                                session.add(QuizAnswer(
                                    id=uuid.uuid4(), question_id=q_id,
                                    content=_clean_text(opt), is_correct=is_correct, order_index=a_idx
                                ))
                        session.commit()
                    print(f"[LESSON+QUIZ] Bài {idx+1}: Quiz saved ({len(quiz_data)} câu)")
            except Exception as e:
                print(f"[LESSON+QUIZ] Bài {idx+1}: Lỗi lưu quiz: {e}")

        return {"lesson_id": lid, "data": d, "idx": idx}

    # Chạy TẤT CẢ các bài học cùng một lúc (Search + Write gộp làm 1)
    results = await asyncio.gather(*[
        process_lesson_and_quiz(i, item)
        for i, item in enumerate(outline)
    ])
    final_lessons = sorted(results, key=lambda x: x["idx"])

    with Session(engine) as session: track_job(session, item_id, "quiz", "done")
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: LESSON + QUIZ GENERATION (Latency: {lat:.2f}s)")
    return final_lessons




async def _step_summarization(item_id, content, extractor, lessons=None, source_type=None, target="both", version_label="Phiên bản gốc"):
    """Tổng hợp Summary và/hoặc Mindmap. Có 3 luồng:
    - CASE 1: target='summary' + có lessons → Fast Path (dùng lessons làm input synthesis, 1 LLM call)
    - CASE 2: target='both' + có lessons (video/audio) → Ghép raw + lessons rồi phân tích
    - CASE 3: target='mindmap' hoặc không có lessons → Dùng thẳng raw content
    """
    print(f"[PIPELINE][{item_id}] Bắt đầu: SUMMARIZATION & MINDMAP (Target: {target})")
    t0 = time.time()
    with Session(engine) as session: track_job(session, item_id, "summary", "running")
    update_stage(item_id, f"Đang tổng hợp thông tin & tạo sơ đồ tư duy ({target})...")

    # ── CASE 1: Tạo lại Summary khi đã có Lessons ──────────────────────────────
    # Bỏ qua bước Map hoàn toàn — gọi thẳng Synthesis từ nội dung các bài học.
    if target == "summary" and lessons:
        print(f"[PIPELINE][{item_id}] [CASE 1] Fast Path: Tổng hợp Summary từ {len(lessons)} bài học")
        from app.ai.prompts import PROMPT_SYNTHESIS_SUMMARY
        lesson_texts = "\n".join([
            f"Bài {l['data'].get('title')}: {l['data'].get('keyConcept')}"
            for l in lessons if 'data' in l
        ])
        prompt_text = PROMPT_SYNTHESIS_SUMMARY.format(data=lesson_texts)
        raw_result = await extractor.struct_summary_only.ainvoke(prompt_text)
        res, in_t, out_t = extractor._unpack(raw_result)
        summary_data = {"summary": res.summary.model_dump()}

    # ── CASE 2: Luồng Video/Audio (target='both', có lessons từ Multimodal) ─────
    # Ghép raw transcript + nội dung lessons để tăng chất lượng phân tích.
    elif target == "both" and lessons:
        lesson_texts = [
            f"Bài {l['data'].get('title')}: {l['data'].get('keyConcept')}"
            for l in lessons if 'data' in l
        ]
        if lesson_texts:
            if len(content) < 200:
                # Transcript gốc quá ngắn (video không tiếng) → chỉ dùng lessons
                enrichment_text = "\n".join(lesson_texts)
                print(f"[PIPELINE][{item_id}] [CASE 2a] Transcript ngắn — chỉ dùng {len(lesson_texts)} lessons")
            else:
                # Ghép cả 2 nguồn để LLM có đầy đủ ngữ cảnh
                enrichment_text = f"NỘI DUNG GỐC:\n{content}\n\nNỘI DUNG CHI TIẾT TỪ CÁC BÀI HỌC:\n" + "\n".join(lesson_texts)
                print(f"[PIPELINE][{item_id}] [CASE 2b] Ghép raw ({len(content):,} ký tự) + {len(lesson_texts)} lessons")
        else:
            enrichment_text = content
            print(f"[PIPELINE][{item_id}] [CASE 2c] Không có lesson text — dùng raw content")
        summary_data = await extractor.analyze_long_text(enrichment_text, target=target)

    # ── CASE 3: Mặc định — chỉ dùng raw content ────────────────────────────────
    # Áp dụng khi: tạo lại Mindmap, hoặc tạo mới từ PDF/URL (không có lessons sẵn).
    else:
        print(f"[PIPELINE][{item_id}] [CASE 3] Dùng raw content ({len(content):,} ký tự), target={target}")
        summary_data = await extractor.analyze_long_text(content, target=target)

    # --- FALLBACK: Tìm kiếm thủ công mốc thời gian nếu AI bỏ sót ---
    import re
    s = summary_data.get("summary", {})
    highlights = s.get("highlights", [])

    if source_type != 'pdf':
        # Với video/audio: bổ sung timestamp nếu AI không tìm thấy
        for h in highlights:
            if isinstance(h, dict) and not h.get("media_timestamp"):
                kw = h.get("keyword", "")
                if not kw: continue
                idx = content.lower().find(kw.lower())
                if idx != -1:
                    prefix = content[:idx]
                    matches = re.findall(r'\[(\d{2}:\d{2}(?::\d{2})?)\]', prefix)
                    if matches:
                        h["media_timestamp"] = matches[-1]
    else:
        # Với PDF: xóa mọi timestamp do AI "bịa" ra và bổ sung fallback cho page_number
        for h in highlights:
            if isinstance(h, dict):
                h["media_timestamp"] = None
                # Fallback: Nếu AI không lấy được page_number, tìm kiếm dựa trên marker [PAGE X]
                if not h.get("page_number"):
                    kw = h.get("keyword", "")
                    if kw:
                        idx = content.lower().find(kw.lower())
                        if idx != -1:
                            prefix = content[:idx]
                            page_matches = re.findall(r'\[P(\d+)\]', prefix)
                            if page_matches:
                                h["page_number"] = int(page_matches[-1])

    # --- DEDUPLICATION: Lọc bỏ các từ khóa bị trùng lặp ---
    unique_highlights = {}
    for h in highlights:
        if isinstance(h, dict):
            kw = h.get("keyword", "").strip()
            if not kw: continue
            key = kw.lower()
            if key in unique_highlights:
                # Ưu tiên giữ bản có media_timestamp
                if h.get("media_timestamp") and not unique_highlights[key].get("media_timestamp"):
                    unique_highlights[key] = h
            else:
                unique_highlights[key] = h
    final_highlights = list(unique_highlights.values())

    # --- LƯU VÀO DB ---
    print(f"[PIPELINE][{item_id}] Đang lưu kết quả vào DB...")
    t_db = time.time()
    with Session(engine) as session:
        # Kiểm tra sự tồn tại của KnowledgeItem trước khi insert (đề phòng bị xóa khi đang xử lý)
        ki_exists = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki_exists:
            print(f"[PIPELINE][{item_id}] ⚠ KnowledgeItem không tồn tại (có thể đã bị xóa). Hủy lưu DB.")
            return summary_data

        if target in ("both", "summary") and "summary" in summary_data:
            s = summary_data["summary"]
            
            # Cập nhật Title tài liệu tự động từ nội dung (chỉ thực hiện ở version gốc hoặc khi target là both)
            new_title = s.get("title")
            if new_title and ki_exists:
                ki_exists.title = _clean_text(new_title)
                print(f"[PIPELINE][{item_id}] Đã cập nhật Title mới: {new_title}")

            # Bỏ delete để lưu lịch sử phiên bản
            # session.query(Summary).filter(Summary.item_id == uuid.UUID(str(item_id))).delete()
            session.add(Summary(
                id=uuid.uuid4(),
                item_id=uuid.UUID(str(item_id)),
                content=_clean_text(s.get("detailed", "")),
                tldr=[_clean_text(t) for t in s.get("tldr", [])],
                highlights=final_highlights,
                version_label=version_label
            ))
            print(f"[PIPELINE][{item_id}] Đã cập nhật Summary (version: {version_label})")

        if target in ("both", "mindmap") and "mindmap" in summary_data:
            mindmap_data = summary_data["mindmap"]
            # Chỉ lưu nếu mindmap có nội dung thực sự (có children)
            if isinstance(mindmap_data, dict) and mindmap_data.get("children"):
                print(f"[PIPELINE][{item_id}] Mindmap JSON size: {len(str(mindmap_data)):,} bytes")
                session.add(Mindmap(
                    id=uuid.uuid4(), 
                    item_id=uuid.UUID(str(item_id)), 
                    data=mindmap_data,
                    version_label=version_label
                ))
                print(f"[PIPELINE][{item_id}] Đã cập nhật Mindmap (version: {version_label})")
            else:
                print(f"[PIPELINE][{item_id}] ⚠ Mindmap rỗng — bỏ qua, không lưu vào DB")

        if summary_data.get("_mindmap_failed"):
            print(f"[PIPELINE][{item_id}] ⚠ Mindmap không thể tạo được (timeout/lỗi) — người dùng có thể tạo lại thủ công")

        session.commit()
    print(f"[PIPELINE][{item_id}] Lưu DB xong (Latency: {time.time()-t_db:.2f}s)")

    with Session(engine) as session: track_job(session, item_id, "summary", "done")
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: SUMMARIZATION (Latency: {lat:.2f}s)")
    return summary_data


async def _step_quiz_generation(item_id, lessons, extractor, difficulty="intermediate", version_label=None):
    """Bước chung: Tạo Quiz cho các bài học."""
    print(f"[PIPELINE][{item_id}] Bắt đầu Giai đoạn 4: QUIZ GENERATION (Độ khó: {difficulty})")
    t0 = time.time()
    with Session(engine) as session: track_job(session, item_id, "quiz", "running")
    update_stage(item_id, f"Đang sinh câu hỏi trắc nghiệm ({difficulty}) cho {len(lessons)} bài học...")
    from datetime import datetime
    run_time_str = datetime.now().strftime("%d/%m %H:%M:%S")
    if difficulty in ["intermediate", "normal"]:
        run_label = f"Phiên bản {run_time_str} (Trung bình)"
    elif difficulty in ["advanced", "expert"]:
        run_label = f"Phiên bản {run_time_str} (Nâng cao)"
    elif difficulty in ["easy", "beginner"]:
        run_label = f"Phiên bản {run_time_str} (Cơ bản)"
    else:
        run_label = f"Phiên bản {run_time_str} ({difficulty})"

    final_label = version_label if version_label else run_label

    async def make_quiz(lesson_id, l_data):
        try:
            quiz_data = await extractor.generate_quizzes(l_data, difficulty=difficulty)
            if not quiz_data:
                print(f"[QUIZ] Không có câu hỏi nào được tạo cho bài học '{l_data.get('title', 'Lesson')}'")
                return
            with Session(engine) as session:
                # Kiểm tra item tồn tại trước khi lưu Quiz
                ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
                if not ki:
                    print(f"[QUIZ] [{item_id}] ⚠ Item không tồn tại. Hủy lưu quiz.")
                    return

                qid = uuid.uuid4()
                session.add(Quiz(id=qid, lesson_id=lesson_id, title=final_label))
                for q_idx, q in enumerate(quiz_data):
                    q_id = uuid.uuid4()
                    q_type = q.get("question_type", "mcq")  # 'mcq' hoặc 'true_false'
                    if q_type == "mcq":
                        q_type = "single_choice"
                    session.add(QuizQuestion(
                        id=q_id, quiz_id=qid,
                        question=_clean_text(q.get("question", "")),
                        question_type=q_type,                          # ← lưu vào DB
                        explanation=_clean_text(q.get("explanation", "")),
                        order_index=q_idx
                    ))
                    options = q.get("options", [])
                    try:
                        correct_idx = int(q.get("correct_index", 0))
                    except (ValueError, TypeError):
                        correct_idx = 0
                    for a_idx, opt in enumerate(options):
                        is_correct = (a_idx == correct_idx)            # ← chính xác tuyệt đối
                        session.add(QuizAnswer(
                            id=uuid.uuid4(),
                            question_id=q_id,
                            content=_clean_text(opt),
                            is_correct=is_correct,
                            order_index=a_idx
                        ))
                session.commit()
        except Exception as e: print(f"Lỗi lưu quiz: {e}")

    # Chạy SONG SONG tất cả quiz — semaphore trong extractor giới hạn concurrency
    await asyncio.gather(*[make_quiz(l["lesson_id"], l["data"]) for l in lessons])
    with Session(engine) as session: track_job(session, item_id, "quiz", "done")
    lat = time.time() - t0
    print(f"[PIPELINE][{item_id}] HOÀN TẤT: QUIZ GENERATION (Latency: {lat:.2f}s)")

async def process_enrichment_task(source_type: str, source_url: str, item_id: str = None, ai_options: Dict[str, Any] | None = None):
    """Orchestrator: Điều phối toàn bộ quy trình làm giàu dữ liệu."""
    pipeline_start_time = time.time()
    if not item_id: item_id = str(uuid.uuid4())
    print(f"\n=============================================")
    print(f"[{item_id}] BẮT ĐẦU PIPELINE ({source_type})")
    print(f"=============================================")
    extractor = _create_extractor(ai_options)
    
    # Lấy user_id từ KnowledgeItem để gán vào log context
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).first()
        user_id_str = str(ki.user_id) if ki and ki.user_id else None
    extractor.set_context(user_id=user_id_str, item_id=item_id)
    
    # 1. Ingestion
    extracted_data = await _step_ingestion(source_type, source_url, item_id, ai_options=ai_options, user_id=user_id_str)
    content = extracted_data["content"]
    title = extracted_data.get("title", "Untitled")
    
    # --- Pre-flight Check: Cost Estimation & Credit Check ---
    if user_id_str:
        import math
        from app.utils.credits import check_user_balance
        
        # Heuristic: ~20,000 chars = 1 credit + 20% safe margin
        char_count = len(content)
        estimated_credits = math.ceil((char_count / 20000) * 1.2)
        estimated_credits = max(1, estimated_credits)  # Minimum 1
        
        if not check_user_balance(user_id_str, estimated_credits):
            print(f"[{item_id}] ❌ INSUFFICIENT CREDITS: Đã quá quota và kết thúc phiên (Cần khoảng ~{estimated_credits} credits. Chiều dài: {char_count} ký tự).")
            # Xóa item hoàn toàn để không hiển thị phiên lỗi trên sidebar
            from app.utils.cleanup import delete_item_completely
            source_url_for_cleanup = extracted_data.get("source_url", "")
            await delete_item_completely(item_id, source_url_for_cleanup)
            print(f"[{item_id}] 🗑 Đã xóa item do hết credit.")
            return item_id
        
        print(f"[{item_id}] ✅ CREDIT CHECK PASSED: Estimated {estimated_credits} credits for {char_count} chars.")
    
    # 2. Xử lý luồng riêng cho từng loại nguồn
    if "segments" in extracted_data:
        # LUỒNG VIDEO/AUDIO: Enrichment (Vision) -> Summarization -> Quizzes
        lessons = await _step_media_enrichment(item_id, extracted_data["segments"], title, source_type, source_url=source_url, ai_options=ai_options, user_id=user_id_str, version_label="Phiên bản gốc")
        summary_data = await _step_summarization(item_id, content, extractor=extractor, lessons=lessons, source_type=source_type, version_label="Phiên bản gốc")
        await _step_quiz_generation(item_id, lessons, extractor, difficulty="intermediate", version_label="Phiên bản gốc")
    else:
        # LUỒNG DOCUMENT: Summarization ∥ Indexing (song song) → Lesson+Quiz (gộp, pre-fetch, 2 semaphore riêng)
        summary_data, _ = await asyncio.gather(
            _step_summarization(item_id, content, extractor=extractor, source_type=source_type),
            _step_indexing(item_id, content, title, source_type)
        )
        lessons = await _step_lesson_and_quiz_generation(item_id, summary_data, extractor)
    # KẾT THÚC
    try:
        with Session(engine) as session:
            track_job(session, item_id, "lessons_generation", "done")
            session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({
                "status": "done", "processing_stage": "done"
            })
            session.commit()
    finally:
        # Cleanup file nội bộ nếu đây là bản upload trực tiếp (bypassed Supabase)
        if source_url and not source_url.startswith("http"):
            import os
            if os.path.exists(source_url):
                try:
                    os.remove(source_url)
                    print(f"[{item_id}] Đã xóa file tạm sau xử lý: {source_url}")
                    # Xóa source_url trong DB vì file vật lý không còn nữa (tránh link chết trên UI)
                    from app.db.session import SessionLocal
                    with SessionLocal() as session:
                        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({
                            "source_url": ""
                        })
                        session.commit()
                except Exception as cleanup_err:
                    print(f"[{item_id}] Lỗi khi dọn dẹp file tạm: {cleanup_err}")

    # ─── Deduct total credits for this pipeline ───
    if user_id_str:
        from app.utils.credits import deduct_total_pipeline_cost
        from datetime import datetime, timezone
        pipeline_start_dt = datetime.fromtimestamp(pipeline_start_time, tz=timezone.utc)
        deduct_total_pipeline_cost(
            item_id, 
            user_id_str, 
            pipeline_start_dt, 
            pipeline_name="Tạo bài học & Quiz",
            item_title=title
        )

    total_lat = time.time() - pipeline_start_time
    print(f"=============================================")
    print(f"[{item_id}] HOÀN TẤT TOÀN BỘ PIPELINE! ✅ (Total Time: {total_lat:.2f}s)")
    print(f"=============================================\n")
    return item_id


async def process_live_recording_task(
    item_id: str,
    full_content: str,
    segments: list,
    title: str = "Bản ghi âm trực tiếp",
    ai_options: Dict[str, Any] | None = None,
):
    """
    Orchestrator cho Live Recording: Bỏ qua bước Ingestion (đã có transcript),
    tái sử dụng _step_media_enrichment (audio-only) → Summarization → Quiz.
    """
    pipeline_start_time = time.time()
    print(f"\n=============================================")
    print(f"[{item_id}] BẮT ĐẦU PIPELINE LIVE RECORDING ({len(segments)} segments)")
    print(f"=============================================")
    extractor = _create_extractor(ai_options)

    # Lấy user_id từ KnowledgeItem và LƯU segments vào metadata (giống bước Ingestion của upload)
    with Session(engine) as session:
        row = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).first()
        if row:
            user_id_str = str(row.user_id) if row.user_id else None
            # Lưu segments để tái sử dụng khi regenerate
            meta = row.metadata_ or {}
            meta["segments"] = segments
            row.metadata_ = meta
            session.commit()
        else:
            user_id_str = None
    
    extractor.set_context(user_id=user_id_str, item_id=item_id)

    # --- Pre-flight Check: Cost Estimation & Credit Check ---
    if user_id_str:
        import math
        from app.utils.credits import check_user_balance
        
        char_count = len(full_content)
        estimated_credits = math.ceil((char_count / 20000) * 1.2)
        estimated_credits = max(1, estimated_credits)
        
        if not check_user_balance(user_id_str, estimated_credits):
            print(f"[{item_id}] ❌ INSUFFICIENT CREDITS (LIVE RECORDING): Đã quá quota và kết thúc phiên (Cần khoảng ~{estimated_credits} credits. Chiều dài: {char_count} ký tự).")
            # Xóa item hoàn toàn để không hiển thị phiên lỗi trên sidebar
            from app.utils.cleanup import delete_item_completely
            await delete_item_completely(item_id)
            print(f"[{item_id}] 🗑 Đã xóa item do hết credit.")
            return item_id
        
        print(f"[{item_id}] ✅ CREDIT CHECK PASSED: Estimated {estimated_credits} credits for {char_count} chars.")

    # Tái sử dụng hàm chung (source_url=None → audio-only, không trích xuất frames)
    lessons = await _step_media_enrichment(item_id, segments, title, "audio", ai_options=ai_options, version_label="Phiên bản gốc")

    # Summarization + Mindmap
    await _step_summarization(item_id, full_content, extractor=extractor, lessons=lessons, version_label="Phiên bản gốc")

    # Quiz
    await _step_quiz_generation(item_id, lessons, extractor, difficulty="intermediate", version_label="Phiên bản gốc")

    # KẾT THÚC
    with Session(engine) as session:
        track_job(session, item_id, "lessons_generation", "done")
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({
            "status": "done", "processing_stage": "done"
        })
        session.commit()

    # ─── Deduct total credits for this pipeline ───
    if user_id_str:
        from app.utils.credits import deduct_total_pipeline_cost
        from datetime import datetime, timezone
        pipeline_start_dt = datetime.fromtimestamp(pipeline_start_time, tz=timezone.utc)
        deduct_total_pipeline_cost(
            item_id, 
            user_id_str, 
            pipeline_start_dt, 
            pipeline_name="Xử lý Ghi âm trực tiếp",
            item_title=title
        )

    total_lat = time.time() - pipeline_start_time
    print(f"=============================================")
    print(f"[{item_id}] HOÀN TẤT TOÀN BỘ PIPELINE LIVE RECORDING! ✅ (Total Time: {total_lat:.2f}s)")
    print(f"=============================================\n")
    return item_id


# ========== REGENERATION TASKS ==========

async def regenerate_lessons_task(item_id: str, ai_options: Dict[str, Any] | None = None):
    """Tạo lại toàn bộ bài học và quiz."""
    print(f"[REGENERATE][{item_id}] Bắt đầu tạo lại toàn bộ Lessons & Quizzes")
    extractor = _create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        user_id_str = str(ki.user_id) if ki.user_id else None
        extractor.set_context(user_id=user_id_str, item_id=item_id)
        
        # Bỏ xóa để giữ lại lịch sử các phiên bản
        # 1. Xóa bài học cũ
        # session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id))).delete()
        
        # 2. Xóa Chunks cũ trong Postgres (để tránh lặp index)
        # from app.models.chunks import ItemChunk
        # session.query(ItemChunk).filter(ItemChunk.item_id == uuid.UUID(str(item_id))).delete()
        
        # session.commit()

        # 3. Xóa Vectors cũ trong ChromaDB
        # from app.search.service import search_service
        # await search_service.delete_item(item_id)

        content = ki.raw_content
        title = ki.title
        source_type = ki.source_type
        source_url = ki.source_url
        
        # Lấy summary data để làm đầu vào cho outline (nếu có)
        summary_rec = session.query(Summary).filter(Summary.item_id == uuid.UUID(str(item_id))).first()
        summary_data = {}
        if summary_rec:
            summary_data = {"summary": {"detailed": summary_rec.content, "tldr": summary_rec.tldr}}

    from datetime import datetime
    version_label = f"Phiên bản {datetime.now().strftime('%d/%m %H:%M:%S')}"

    # SỬ DỤNG LUỒNG TỐI ƯU MỚI: Indexing ∥ (Outline) → Lesson+Quiz
    if source_type in ("video", "audio", "youtube"):
        # Ưu tiên lấy lại segments gốc từ metadata để giữ mốc thời gian chuẩn
        saved_segments = (ki.metadata_ or {}).get("segments")
        
        if saved_segments:
            print(f"[REGENERATE][{item_id}] Tìm thấy {len(saved_segments)} segments gốc. Đang chia lại bài học...")
            from app.processors.chunking.semantic_chunker import SemanticChunker
            chunker = SemanticChunker()
            # SemanticChunker.process nhận segments làm input
            chunks_data = await chunker.process(content, segments=saved_segments)
            input_segments = chunks_data["chunks"]
        else:
            print(f"[REGENERATE][{item_id}] Không tìm thấy segments gốc. Fallback dùng SemanticChunker trên text...")
            from app.processors.chunking.semantic_chunker import SemanticChunker
            chunker = SemanticChunker()
            chunks_data = await chunker.process(content)
            # Nếu không có segments gốc, tạo fake segments để _step_media_enrichment hoạt động
            input_segments = [{"start": 0, "end": 0, "text": c} for c in chunks_data["chunks"]]

        lessons = await _step_media_enrichment(item_id, input_segments, title, source_type, source_url=source_url, ai_options=ai_options, user_id=user_id_str, version_label=version_label)
        # Chỉ tạo lesson, không tạo quiz
    else:
        # Với DOCUMENT: Indexing và Lesson (đã tối ưu pre-fetch + 2 semaphore)
        await _step_indexing(item_id, content, title, source_type)
        lessons = await _step_lesson_and_quiz_generation(item_id, summary_data, extractor, version_label=version_label, generate_quiz=False)

    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(item_id)).update({"status": "done", "processing_stage": "done"})
        session.commit()
    print(f"[REGENERATE][{item_id}] HOÀN TẤT tạo lại Lessons & Quizzes (version: {version_label})")


async def regenerate_quiz_task(item_id: str, difficulty: str = "intermediate", ai_options: Dict[str, Any] | None = None):
    """Tạo lại bộ câu hỏi trắc nghiệm với độ khó mong muốn."""
    print(f"[REGENERATE][{item_id}] Bắt đầu tạo lại Quiz (Difficulty: {difficulty})")
    extractor = _create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        user_id_str = str(ki.user_id) if ki.user_id else None
        extractor.set_context(user_id=user_id_str, item_id=item_id)
        
        # Lấy danh sách lessons hiện có (chỉ lấy phiên bản mới nhất)
        latest_lesson = session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id))).order_by(Lesson.created_at.desc()).first()
        if not latest_lesson:
            print(f"[REGENERATE][{item_id}] LỖI: Không tìm thấy bài học nào để tạo Quiz.")
            return
            
        latest_version = latest_lesson.version_label
        lessons_q = session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id)), Lesson.version_label == latest_version).order_by(Lesson.order_index).all()
        if not lessons_q:
            print(f"[REGENERATE][{item_id}] LỖI: Không tìm thấy bài học nào để tạo Quiz.")
            return

        # Xoá logic xoá quiz cũ để giữ lại các phiên bản
        # session.query(Quiz).filter(Quiz.lesson_id == l.id).delete()

        lessons_list = []
        for l in lessons_q:
            lessons_list.append({
                "lesson_id": l.id,
                "data": {"title": l.title, "keyConcept": l.content, "example": l.example}
            })

    await _step_quiz_generation(item_id, lessons_list, extractor, difficulty=difficulty)
    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({"status": "done", "processing_stage": "done"})
        session.commit()
    print(f"[REGENERATE][{item_id}] HOÀN TẤT tạo lại Quiz")


async def regenerate_summary_task(item_id: str, ai_options: Dict[str, Any] | None = None):
    """Tạo lại duy nhất phần Tóm tắt (TLDR + Highlights)."""
    print(f"[REGENERATE][{item_id}] Bắt đầu tạo lại Tóm tắt")
    extractor = _create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        user_id_str = str(ki.user_id) if ki.user_id else None
        extractor.set_context(user_id=user_id_str, item_id=item_id)
        
        content = ki.raw_content
        source_type = ki.source_type
        
        # Lấy lessons để làm giàu summary
        lessons_list = []
        lessons_q = session.query(Lesson).filter(Lesson.item_id == uuid.UUID(str(item_id))).order_by(Lesson.order_index).all()
        for l in lessons_q:
            lessons_list.append({"data": {"title": l.title, "keyConcept": l.content}})

    from datetime import datetime
    version_label = f"Phiên bản {datetime.now().strftime('%d/%m %H:%M:%S')}"

    # Gọi lại bước summarization (mặc định target là summary)
    await _step_summarization(item_id, content, extractor, lessons=lessons_list, source_type=source_type, target="summary", version_label=version_label)
    
    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({"status": "done", "processing_stage": "done"})
        session.commit()
    print(f"[REGENERATE][{item_id}] HOÀN TẤT tạo lại Tóm tắt (version: {version_label})")


async def regenerate_mindmap_task(item_id: str, ai_options: Dict[str, Any] | None = None):
    """Tạo lại Sơ đồ tư duy — chỉ dùng raw content gốc (giống lần tạo đầu tiên)."""
    print(f"[REGENERATE][{item_id}] Bắt đầu tạo lại Mindmap")
    extractor = _create_extractor(ai_options)
    
    with Session(engine) as session:
        ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
        if not ki: return
        user_id_str = str(ki.user_id) if ki.user_id else None
        extractor.set_context(user_id=user_id_str, item_id=item_id)
        
        content = ki.raw_content
        source_type = ki.source_type

        # Bỏ xóa Mindmap cũ để lưu phiên bản
        # session.query(Mindmap).filter(Mindmap.item_id == uuid.UUID(str(item_id))).delete()
        # session.commit()

    from datetime import datetime
    version_label = f"Phiên bản {datetime.now().strftime('%d/%m %H:%M:%S')}"
    await _step_summarization(item_id, content, extractor, source_type=source_type, target="mindmap", version_label=version_label)
    
    with Session(engine) as session:
        session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).update({"status": "done", "processing_stage": "done"})
        session.commit()
    print(f"[REGENERATE][{item_id}] HOÀN TẤT tạo lại Mindmap")

