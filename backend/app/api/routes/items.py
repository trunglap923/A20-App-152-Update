from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import shutil
import json

from app.db.session import get_db, SessionLocal
from app.models.knowledge_items import KnowledgeItem
from app.models.summaries import Summary
from app.models.mindmaps import Mindmap
from app.models.lessons import Lesson
from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer

from app.api import schemas
from app.workers.enrichment_pipeline import (
    process_enrichment_task, 
    process_live_recording_task,
    regenerate_summary_task,
    regenerate_mindmap_task,
    regenerate_lessons_task,
    regenerate_quiz_task
)
from app.api.deps import get_current_user, get_current_user_sse, UserInfo
from app.config import settings
from app.search.service import search_service

router = APIRouter(prefix="/items", tags=["items"])

@router.post("/process", response_model=dict)
async def trigger_processing(
    request: Request,
    background_tasks: BackgroundTasks,
    source_type: str = Form(...),
    source_url: Optional[str] = Form(None),
    source_title: Optional[str] = Form(None),  # Tên file gốc sạch từ frontend
    file: Optional[UploadFile] = File(None),
    # --- Cấu hình AI cho tác vụ văn bản ---
    user_ai_provider: Optional[str] = Form(None),
    user_ai_model: Optional[str] = Form(None),
    user_ai_key: Optional[str] = Form(None),
    # --- Cấu hình AI cho vision (video frames) ---
    user_vision_provider: Optional[str] = Form(None),
    user_vision_model: Optional[str] = Form(None),
    user_vision_key: Optional[str] = Form(None),
    # --- Cấu hình AI cho STT (audio-to-text) ---
    user_stt_model: Optional[str] = Form(None),
    user_stt_key: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Trigger pipeline xử lý tài liệu. Trả về message ngay lập tức.
    Nhận cấu hình AI riêng cho từng loại tác vụ: text, vision, stt.
    """
    final_source_url = source_url

    if file:
        # Trỏ vào backend/app/data
        upload_dir = settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        
        filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join(upload_dir, filename)

        print(f"[UPLOAD] Saving file to: {filepath}")
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Chỉ lưu tên file vào DB để tránh lỗi đường dẫn tuyệt đối
        final_source_url = filepath

    if not final_source_url:
        raise HTTPException(status_code=400, detail="Thiếu nguồn dữ liệu (URL hoặc File).")

    item_id = str(uuid.uuid4())

    # Ưu tiên source_title từ FE (tên file gốc sạch), fallback theo thứ tự hợp lý
    def _clean_filename(name: str) -> str:
        """Bỏ phần extension và thay dấu gạch dưới/gạch nối bằng khoảng trắng."""
        import re
        stem = name.rsplit('.', 1)[0] if '.' in name else name
        return re.sub(r'[_\-]+', ' ', stem).strip()

    if source_title and source_title.strip():
        initial_title = _clean_filename(source_title.strip())
    elif source_type == "youtube":
        initial_title = "YouTube"
    elif file and file.filename:
        initial_title = _clean_filename(file.filename)
    else:
        # Lấy từ URL, bỏ tiền tố timestamp nếu có (ví dụ: 1746500000_ten_file.pdf)
        raw = (final_source_url or "").split('/')[-1].split('?')[0]
        import re
        raw = re.sub(r'^\d+_', '', raw)  # Bỏ timestamp prefix
        initial_title = _clean_filename(raw) if raw else "Đang xử lý..."


    placeholder = KnowledgeItem(
        id=item_id,
        user_id=current_user.id,
        title=initial_title,
        source_type=source_type,
        source_url=final_source_url,
        status="pending",
        processing_stage="ingestion",
        language="vi"
    )
    db.add(placeholder)
    db.commit()

    # --- Xây dựng ai_options đa tác vụ ---
    def _get_field(form_val, header_name):
        return (form_val or request.headers.get(header_name) or "").strip()

    # Text task
    text_provider = _get_field(user_ai_provider, "x-user-ai-provider").lower() or "openai"
    text_model    = _get_field(user_ai_model,    "x-user-ai-model")          or "gpt-4o-mini"
    text_key      = _get_field(user_ai_key,      "x-user-ai-key")            or None

    # Vision task (fallback về text config nếu không có vision config)
    vision_provider = _get_field(user_vision_provider, "x-user-vision-provider").lower() or text_provider
    vision_model    = _get_field(user_vision_model,    "x-user-vision-model")          or text_model
    vision_key      = _get_field(user_vision_key,      "x-user-vision-key")            or text_key

    # STT task (chỉ dùng OpenAI Whisper)
    stt_model = _get_field(user_stt_model, "x-user-stt-model") or "whisper-1"
    stt_key   = _get_field(user_stt_key,   "x-user-stt-key")   or text_key

    ai_options = {
        "text":   {"provider": text_provider,   "model": text_model,   "api_key": text_key   or None},
        "vision": {"provider": vision_provider, "model": vision_model, "api_key": vision_key or None},
        "stt":    {"provider": "openai",         "model": stt_model,   "api_key": stt_key    or None},
    }
    print(
        f"[items.process] user={current_user.id} "
        f"text={text_provider}/{text_model} "
        f"vision={vision_provider}/{vision_model} "
        f"stt=openai/{stt_model}"
    )

    background_tasks.add_task(
        process_enrichment_task,
        source_type,
        final_source_url,
        item_id,
        ai_options,
    )
    
    return {"item_id": item_id, "status": "processing", "message": "Pipeline started in background"}

@router.get("", response_model=List[schemas.ItemResponse])
def list_items(
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user)
):
    # print(f"[DEBUG] Fetching items for user_id: {current_user.id} (type: {type(current_user.id)})")
    
    # Tối ưu: Chỉ fetch các cột cần thiết cho trang danh sách, tránh load raw_content cực lớn
    items = db.query(
        KnowledgeItem.id,
        KnowledgeItem.title,
        KnowledgeItem.source_type,
        KnowledgeItem.source_url,
        KnowledgeItem.created_at,
        KnowledgeItem.status,
        KnowledgeItem.processing_stage
    ).filter(KnowledgeItem.user_id == current_user.id)\
     .order_by(KnowledgeItem.created_at.desc()).all()
    
    # print(f"[DEBUG] Found {len(items)} items for user {current_user.id}")
    results = []
    for item in items:
        # print(f"  [ITEM] {item.title[:50]} | Status: {item.status}")
        results.append(schemas.ItemResponse(
            id=str(item.id),
            title=item.title,
            source_type=item.source_type,
            source_url=item.source_url or "",
            created_at=item.created_at,
            status=item.status or "processing",
            processing_stage=item.processing_stage
        ))
    return results

@router.get("/{item_id}/stream")
async def stream_item_status(
    item_id: str,
    request: Request,
    token: Optional[str] = None,
    current_user: UserInfo = Depends(get_current_user_sse)
):
    """
    Server-Sent Events endpoint: Backend chủ động PUSH trạng thái về Frontend.
    Thay thế Polling, giúp giảm số lượng request từ O(N×T) xuống O(N).
    """
    import asyncio
    from fastapi.responses import StreamingResponse
    from sqlalchemy.orm import selectinload
    from app.models.summaries import Summary
    from app.models.mindmaps import Mindmap
    from app.models.lessons import Lesson
    from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer

    # 1. Kiểm tra quyền trước (dùng session ngắn hạn)
    with SessionLocal() as db:
        item_check = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
        if not item_check:
            raise HTTPException(status_code=404, detail="Item not found")
        if str(item_check.user_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

    async def event_generator():
        POLL_INTERVAL = 3   # Kiểm tra DB nội bộ mỗi 3 giây
        MAX_WAIT = 600      # Tối đa 10 phút

        elapsed = 0
        last_stage = None
        pushed_summary = False
        pushed_lessons = False

        while elapsed < MAX_WAIT:
            if await request.is_disconnected():
                break

            # 2. Sử dụng session riêng cho mỗi vòng lặp để tránh giữ connection pool quá lâu
            with SessionLocal() as db:
                try:
                    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
                    
                    if not item:
                        yield f"data: {json.dumps({'error': 'Item deleted'})}\n\n"
                        break

                    stage = item.processing_stage or item.status
                    
                    # Định dạng source_url để Frontend có thể truy cập ngay
                    import urllib.parse
                    import os
                    raw_url = item.source_url or ""
                    formatted_url = raw_url
                    if raw_url and not raw_url.startswith("http"):
                        fname = os.path.basename(raw_url)
                        base_url = str(request.base_url).rstrip("/")
                        formatted_url = f"{base_url}/data/{urllib.parse.quote(fname)}"

                    payload = {
                        "status": item.status, 
                        "processing_stage": stage,
                        "source_url": formatted_url,
                        "source_type": item.source_type,
                        "title": item.title
                    }
                    has_new_data = False

                    # ─── Kiểm tra Summary (Phase 2 xong) ───
                    # Dùng cờ pushed_summary, không dùng stage name
                    if not pushed_summary:
                        summary_rec = db.query(Summary).filter(Summary.item_id == item_id).first()
                        if summary_rec and summary_rec.content:
                            pushed_summary = True
                            has_new_data = True
                            raw_h = summary_rec.highlights if isinstance(summary_rec.highlights, list) else []
                            payload["summary"] = {
                                "tldr": summary_rec.tldr if isinstance(summary_rec.tldr, list) else [],
                                "detailed": summary_rec.content,
                                "highlights": [
                                    (h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"})
                                    for h in raw_h
                                ]
                            }
                            mindmap_rec = db.query(Mindmap).filter(Mindmap.item_id == item_id).first()
                            if mindmap_rec and mindmap_rec.data and mindmap_rec.data.get("id"):
                                payload["mindmap"] = mindmap_rec.data

                    # ─── Kiểm tra Lessons (Phase 3 xong) ───
                    if not pushed_lessons:
                        lesson_count = db.query(Lesson).filter(Lesson.item_id == item_id).count()
                        if lesson_count > 0:
                            pushed_lessons = True
                            has_new_data = True
                            lessons_q = db.query(Lesson).filter(Lesson.item_id == item_id).all()
                            lessons_data = []
                            for l in sorted(lessons_q, key=lambda x: x.order_index or 0):
                                import json as _json
                                key_points = []
                                if l.metadata_json:
                                    try: key_points = _json.loads(l.metadata_json).get("key_points", [])
                                    except: pass
                                lessons_data.append({
                                    "id": str(l.id), "title": l.title,
                                    "keyConcept": l.content,
                                    "example": l.example or "",
                                    "start": l.start_time, "end": l.end_time,
                                    "key_points": key_points
                                })
                            payload["lessons"] = lessons_data

                    # ─── Khi done: Push TOÀN BỘ data để đảm bảo đồng bộ cuối cùng ───
                    if item.status == 'done':
                        has_new_data = True
                        # Fresh query với đầy đủ relationships
                        full = db.query(KnowledgeItem).options(
                            selectinload(KnowledgeItem.summaries),
                            selectinload(KnowledgeItem.mindmaps),
                            selectinload(KnowledgeItem.lessons).selectinload(Lesson.quizzes)
                                .selectinload(Quiz.questions).selectinload(QuizQuestion.answers)
                        ).filter(KnowledgeItem.id == item_id).first()
                        
                        # 1. Mapping Summary Versions
                        summary_versions = []
                        if full.summaries:
                            from datetime import datetime
                            sorted_sums = sorted(full.summaries, key=lambda x: x.created_at or datetime.min, reverse=True)
                            s = sorted_sums[0]
                            payload["summary"] = {
                                "tldr": s.tldr if isinstance(s.tldr, list) else [],
                                "detailed": s.content,
                                "highlights": [(h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"}) for h in (s.highlights or [])]
                            }
                            from datetime import datetime
                            sorted_sums = sorted(full.summaries, key=lambda x: x.created_at or datetime.min, reverse=True)
                            for s_item in sorted_sums:
                                raw_h = s_item.highlights if isinstance(s_item.highlights, list) else []
                                summary_versions.append({
                                    "version_id": str(s_item.id),
                                    "label": getattr(s_item, "version_label", "Phiên bản gốc"),
                                    "summary": {
                                        "tldr": s_item.tldr if isinstance(s_item.tldr, list) else [],
                                        "detailed": s_item.content,
                                        "highlights": [(h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"}) for h in raw_h]
                                    }
                                })
                        payload["summary_versions"] = summary_versions

                        # 2. Mapping Mindmap Versions
                        mindmap_versions = []
                        if full.mindmaps:
                            m = full.mindmaps[0]
                            if m.data and m.data.get("id"):
                                payload["mindmap"] = m.data
                            sorted_minds = sorted(full.mindmaps, key=lambda x: x.created_at or datetime.min, reverse=True)
                            for m_item in sorted_minds:
                                if m_item.data and m_item.data.get("id"):
                                    mindmap_versions.append({
                                        "version_id": str(m_item.id),
                                        "label": getattr(m_item, "version_label", "Phiên bản gốc"),
                                        "mindmap": m_item.data
                                    })
                        payload["mindmap_versions"] = mindmap_versions

                        # 3. Mapping Lessons & Quiz
                        lessons_list = []
                        quiz_list = []
                        from collections import defaultdict
                        from datetime import datetime
                        lesson_groups = defaultdict(list)
                        lesson_created_ats = {}
                        quiz_groups = defaultdict(list)
                        quiz_created_ats = {}

                        for l in sorted(full.lessons, key=lambda x: x.order_index or 0):
                            # Lesson
                            import json as _json
                            kp = []
                            if l.metadata_json:
                                try: kp = _json.loads(l.metadata_json).get("key_points", [])
                                except: pass
                            l_item_dict = {
                                "id": str(l.id), "title": l.title,
                                "keyConcept": l.content, "example": l.example or "",
                                "start": l.start_time, "end": l.end_time, "key_points": kp
                            }
                            lessons_list.append(l_item_dict)
                            
                            l_label = getattr(l, "version_label", "Phiên bản gốc")
                            lesson_groups[l_label].append(l_item_dict)
                            if l_label not in lesson_created_ats:
                                lesson_created_ats[l_label] = l.created_at

                            # Quiz
                            for q in l.quizzes:
                                title_key = q.title or "Phiên bản gốc"
                                if title_key.startswith("Quiz: ") or title_key == "Phiên bản cũ":
                                    title_key = "Phiên bản gốc"
                                    
                                if title_key not in quiz_created_ats:
                                    quiz_created_ats[title_key] = q.created_at
                                    
                                for qq in sorted(q.questions, key=lambda x: x.order_index or 0):
                                    opts, ans = [], ""
                                    for a in sorted(qq.answers, key=lambda x: x.order_index or 0):
                                        opts.append(a.content)
                                        if a.is_correct: ans = a.content
                                    quiz_item = {
                                        "id": str(qq.id), "type": qq.question_type or "mcq", "question": qq.question,
                                        "options": opts, "answer": ans, "explanation": qq.explanation or ""
                                    }
                                    quiz_groups[title_key].append(quiz_item)
                                    quiz_list.append(quiz_item)
                                    
                        sorted_lesson_titles = sorted(lesson_groups.keys(), key=lambda t: lesson_created_ats.get(t) or datetime.min, reverse=True)
                        lesson_versions = []
                        for t in sorted_lesson_titles:
                            lesson_versions.append({
                                "version_id": t,
                                "label": t,
                                "lessons": lesson_groups[t]
                            })

                        sorted_quiz_titles = sorted(quiz_groups.keys(), key=lambda t: quiz_created_ats.get(t) or datetime.min, reverse=True)
                        quiz_versions = []
                        for t in sorted_quiz_titles:
                            quiz_versions.append({
                                "version_id": t,
                                "label": t,
                                "questions": quiz_groups[t]
                            })
                        
                        payload["lessons"] = lessons_list
                        payload["lesson_versions"] = lesson_versions
                        payload["quiz"] = quiz_list
                        payload["quiz_versions"] = quiz_versions
                        payload["done"] = True
                        payload["title"] = full.title

                    # Gửi nếu stage thay đổi HOẶC có dữ liệu mới từ DB
                    if stage != last_stage or has_new_data:
                        last_stage = stage
                        yield f"data: {json.dumps(payload)}\n\n"

                    if item.status == 'done' or item.status == 'failed':
                        break

                except Exception as e:
                    import traceback
                    print(f"[SSE-ERROR] {traceback.format_exc()}")
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    break

            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

        yield "data: {\"closed\": true}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/{item_id}", response_model=schemas.ItemResponse)
def get_item_detail(
    item_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Lấy chi tiết tài liệu với Eager Loading để tránh N+1 Query.
    Giúp giảm latency từ ~8s xuống < 1s khi dùng Cloud DB.
    """
    from sqlalchemy.orm import joinedload, selectinload
    from app.models.summaries import Summary
    from app.models.mindmaps import Mindmap
    from app.models.lessons import Lesson
    from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer

    # 1. TRUY VẤN TỐI ƯU: Lấy 1 lần ra hết toàn bộ cấu trúc phân cấp
    item = db.query(KnowledgeItem).options(
        selectinload(KnowledgeItem.summaries),
        selectinload(KnowledgeItem.mindmaps),
        selectinload(KnowledgeItem.lessons).selectinload(Lesson.quizzes).selectinload(Quiz.questions).selectinload(QuizQuestion.answers)
    ).filter(KnowledgeItem.id == item_id).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # 2. Map Summary Versions
    summary_versions = []
    summary_data = None
    if item.summaries:
        from datetime import datetime
        # 1. Sort versions to get the latest one as default
        sorted_sums = sorted(item.summaries, key=lambda x: x.created_at or datetime.min, reverse=True)
        s0 = sorted_sums[0]
        raw_h0 = s0.highlights if isinstance(s0.highlights, list) else []
        summary_data = {
            "tldr": s0.tldr if isinstance(s0.tldr, list) else [],
            "detailed": s0.content,
            "highlights": [(h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"}) for h in raw_h0]
        }
        
        # Build versions list
        for s in sorted_sums:
            raw_h = s.highlights if isinstance(s.highlights, list) else []
            summary_versions.append({
                "version_id": str(s.id),
                "label": getattr(s, "version_label", "Phiên bản gốc"),
                "summary": {
                    "tldr": s.tldr if isinstance(s.tldr, list) else [],
                    "detailed": s.content,
                    "highlights": [(h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"}) for h in raw_h]
                }
            })

    # 3. Map Mindmap Versions
    mindmap_versions = []
    mindmap_data = None
    if item.mindmaps and item.mindmaps[0].data and item.mindmaps[0].data.get("id"):
        mindmap_data = item.mindmaps[0].data
        
        sorted_minds = sorted(item.mindmaps, key=lambda x: x.created_at or datetime.min, reverse=True)
        for m in sorted_minds:
            if m.data and m.data.get("id"):
                mindmap_versions.append({
                    "version_id": str(m.id),
                    "label": getattr(m, "version_label", "Phiên bản gốc"),
                    "mindmap": m.data
                })

    # 4. Map Lessons & Quizzes (Toàn bộ đã nằm trong bộ nhớ, không tốn thêm query nào)
    lesson_versions = []
    lessons_data = []
    quiz_data = [] # backward compat
    import json
    from collections import defaultdict
    lesson_groups = defaultdict(list)
    lesson_created_ats = {}
    
    quiz_groups = defaultdict(list)
    quiz_created_ats = {}

    for l in sorted(item.lessons, key=lambda x: x.order_index or 0):
        # Lesson
        key_points = []
        if l.metadata_json:
            try:
                meta = json.loads(l.metadata_json)
                key_points = meta.get("key_points", [])
            except: pass

        l_item = {
            "id": str(l.id),
            "title": l.title,
            "keyConcept": l.content,
            "example": l.example or "Chưa có ví dụ.",
            "start": l.start_time,
            "end": l.end_time,
            "key_points": key_points
        }
        
        l_label = getattr(l, "version_label", "Phiên bản gốc")
        lesson_groups[l_label].append(l_item)
        if l_label not in lesson_created_ats:
            lesson_created_ats[l_label] = l.created_at
            
        # backward compat: keep all lessons in flat list
        lessons_data.append(l_item)

        # Quizzes thuộc Lesson này
        for q in l.quizzes:
            title_key = q.title or "Phiên bản gốc"
            if title_key.startswith("Quiz: ") or title_key == "Phiên bản cũ":
                title_key = "Phiên bản gốc"
                
            if title_key not in quiz_created_ats:
                quiz_created_ats[title_key] = q.created_at
            
            for qq in sorted(q.questions, key=lambda x: x.order_index or 0):
                options = []
                correct_ans = ""
                for a in sorted(qq.answers, key=lambda x: x.order_index or 0):
                    options.append(a.content)
                    if a.is_correct:
                        correct_ans = a.content
                
                quiz_item = {
                    "id": str(qq.id),
                    "type": qq.question_type or "mcq",
                    "question": qq.question,
                    "options": options,
                    "answer": correct_ans,
                    "explanation": qq.explanation or ""
                }
                quiz_groups[title_key].append(quiz_item)
                quiz_data.append(quiz_item) # keep for backward compatibility if needed

    # Build lesson_versions list
    sorted_lesson_titles = sorted(lesson_groups.keys(), key=lambda t: lesson_created_ats.get(t) or datetime.min, reverse=True)
    for t in sorted_lesson_titles:
        lesson_versions.append({
            "version_id": t,
            "label": t,
            "lessons": lesson_groups[t]
        })

    # Sắp xếp các phiên bản theo thời gian tạo (mới nhất lên đầu)
    sorted_titles = sorted(quiz_groups.keys(), key=lambda t: quiz_created_ats.get(t) or datetime.min, reverse=True)
    quiz_versions = []
    for t in sorted_titles:
        quiz_versions.append({
            "version_id": t,
            "label": t,
            "questions": quiz_groups[t]
        })

    # 5. Xử lý Source URL
    import urllib.parse
    import os
    return_source_url = item.source_url or ""
    if return_source_url and not return_source_url.startswith("http"):
        fname = os.path.basename(return_source_url)
        base_url = str(request.base_url).rstrip("/")
        return_source_url = f"{base_url}/data/{urllib.parse.quote(fname)}"

    print(f"GET /items/{item_id}: returning {len(quiz_versions)} quiz_versions")
    item_data = {
        "id": str(item.id),
        "title": item.title,
        "source_type": item.source_type,
        "source_url": return_source_url,
        "created_at": item.created_at,
        "status": item.status or "processing",
        "processing_stage": item.processing_stage,
        "summary": summary_data,
        "lessons": lessons_data,
        "quiz": quiz_data, # backward compat
        "mindmap": mindmap_data,
        "summary_versions": summary_versions,
        "mindmap_versions": mindmap_versions,
        "lesson_versions": lesson_versions,
        "quiz_versions": quiz_versions
    }
            
    return schemas.ItemResponse(**item_data)


# ========== RENAME & DELETE ENDPOINTS ==========

@router.patch("/{item_id}", response_model=dict)
async def rename_item(
    item_id: str,
    body: schemas.RenameItemRequest,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Đổi tên tài liệu và cập nhật metadata trong VectorDB."""
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Tên không được để trống")

    # 1. Cập nhật SQL DB
    item.title = title
    db.commit()

    # 2. Cập nhật VectorDB Metadata (Chroma + Postgres metadata)
    await search_service.update_item_metadata(item_id, {"title": title})

    print(f"[RENAME] Item {item_id} -> '{title}' (SQL & Vector sync)")
    return {"id": item_id, "title": title}



@router.delete("/{item_id}", response_model=dict)
async def delete_item(
    item_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Xoá tài liệu: Phản hồi cực nhanh, dọn dẹp hoàn toàn không gây block."""
    from app.utils.cleanup import delete_item_completely

    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    source_url = item.source_url or ""

    # Dọn dẹp hoàn toàn (SQL, VectorDB, Supabase) trong background task
    background_tasks.add_task(delete_item_completely, item_id, source_url)

    print(f"[DELETE] Đã tiếp nhận yêu cầu xóa {item_id}. Đang dọn dẹp ngầm...")
    return {"id": item_id, "deleted": True}


# ========== LIVE RECORDING ENDPOINTS ==========

@router.post("/{session_id}/audio-chunk")
async def receive_audio_chunk(
    session_id: str,
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Nhận 1 chunk audio (~3 phút), convert sang MP3, transcribe ngay bằng Whisper,
    và lưu kết quả JSON ra đĩa để endpoint finish-audio ghép lại.
    """
    from app.processors.video.audio_processing import AudioVideoProcessor
    from app.processors.video.transcription import Transcriber

    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data"))
    session_dir = os.path.join(upload_dir, f"live_{session_id}")
    os.makedirs(session_dir, exist_ok=True)
    av_processor = AudioVideoProcessor(session_dir)

    # 1. Lưu file webm gốc
    raw_path = os.path.join(session_dir, f"chunk_{chunk_index}.webm")
    with open(raw_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 2. Convert sang MP3 (tái sử dụng AudioVideoProcessor)
    mp3_path = os.path.join(session_dir, f"chunk_{chunk_index}.mp3")
    try:
        av_processor.convert_to_mp3(raw_path, output_path=mp3_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FFmpeg error: {e}")

    # 3. Đo chính xác độ dài chunk (tái sử dụng AudioVideoProcessor)
    chunk_duration = av_processor.get_duration(mp3_path)

    # 4. Kiểm tra Volume (Lớp bảo vệ 1: Chặn đoạn im lặng)
    mean_volume = av_processor.get_mean_volume(mp3_path)
    segments = []
    
    if mean_volume < -50:
        print(f"[LIVE-REC] Chunk {chunk_index} im lặng hoặc quá nhỏ ({mean_volume} dB). Bỏ qua STT.")
    else:
        # 5. Transcribe bằng Whisper API (tái sử dụng Transcriber)
        transcriber = Transcriber()
        transcribe_data = await transcriber.process(mp3_path)
        raw_segments = transcribe_data.get("segments", [])
        
        # 6. Lọc ảo giác (Lớp bảo vệ 2: Chặn text rác lặp lại)
        hallucination_keywords = [
            "ĐĂNG KÝ KÊNH", "SUBSCRIBE", "XEM VIDEO MỚI", "LIKE VIDEO", 
            "CẢM ƠN CÁC BẠN", "THANK YOU FOR WATCHING"
        ]
        
        for s in raw_segments:
            txt_upper = s["text"].upper()
            # Nếu segment chứa keyword rác và cực ngắn (hallucination thường ngắn)
            is_junk = any(kw in txt_upper for kw in hallucination_keywords)
            if is_junk and len(s["text"]) < 100:
                print(f"[LIVE-REC] Đã lọc ảo giác: {s['text']}")
                continue
            segments.append(s)

    # 7. Lưu kết quả JSON
    result = {
        "chunk_index": chunk_index,
        "duration": chunk_duration,
        "segments": segments,
        "text": " ".join([s["text"] for s in segments])
    }
    json_path = os.path.join(session_dir, f"chunk_{chunk_index}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    # 6. Dọn dẹp file tạm (chỉ xóa mp3, giữ lại webm để ghép cuối session)
    for p in [mp3_path]:
        if os.path.exists(p):
            try: os.remove(p)
            except: pass

    print(f"[LIVE-REC] Session {session_id} | Chunk {chunk_index} | {len(segments)} segments | {chunk_duration:.2f}s")
    print(f"[LIVE-REC] 📝 TEXT: {result['text']}")
    return {"status": "ok", "chunk_index": chunk_index, "segments_count": len(segments), "duration": chunk_duration, "text": result["text"]}


@router.post("/{session_id}/finish-audio")
async def finish_audio_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    title: str = Form("Bản ghi âm trực tiếp"),
    source_url: str = Form(None),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Chốt sổ phiên ghi âm: đọc tất cả chunk JSON, cộng dồn timestamp chính xác,
    hợp nhất thành một transcript đầy đủ, rồi đẩy vào pipeline làm giàu.
    """
    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data"))
    session_dir = os.path.join(upload_dir, f"live_{session_id}")

    if not os.path.exists(session_dir):
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên ghi âm.")

    # 1. Đọc tất cả chunk JSON, sắp xếp theo index
    chunk_files = sorted(
        [f for f in os.listdir(session_dir) if f.endswith(".json")],
        key=lambda x: int(x.replace("chunk_", "").replace(".json", ""))
    )

    if not chunk_files:
        raise HTTPException(status_code=400, detail="Phiên ghi âm không có dữ liệu.")

    # 2. Hợp nhất segments với Timestamp Shifting chính xác
    all_segments = []
    full_texts = []
    time_offset = 0.0

    for cf in chunk_files:
        with open(os.path.join(session_dir, cf), "r", encoding="utf-8") as f:
            chunk_data = json.load(f)

        for seg in chunk_data.get("segments", []):
            abs_start = seg["start"] + time_offset
            abs_end = seg["end"] + time_offset
            all_segments.append({
                "start": abs_start,
                "end": abs_end,
                "text": seg["text"]
            })
            
            # Tạo chuỗi [MM:SS] để LLM và regex có thể bắt được mốc thời gian (GIỐNG BÊN UPLOAD)
            m, s = divmod(int(abs_start), 60)
            ts_str = f"[{m:02d}:{s:02d}]"
            full_texts.append(f"{ts_str} {seg['text']}")

        # Dùng duration thực tế (đo bằng ffprobe) thay vì cộng cứng 180s
        time_offset += chunk_data.get("duration", 180.0)

    full_content = "\n".join(full_texts)

    # 2.5 Ghép audio & Upload lên Supabase (Mới: Fix lỗi duration/seekable)
    from app.processors.video.audio_processing import AudioVideoProcessor
    from app.utils.supabase_storage import upload_file_to_supabase
    
    av_processor = AudioVideoProcessor(session_dir)
    webm_files = sorted(
        [os.path.join(session_dir, f) for f in os.listdir(session_dir) if f.endswith(".webm")],
        key=lambda x: int(os.path.basename(x).replace("chunk_", "").replace(".webm", ""))
    )
    
    item_id = str(uuid.uuid4())
    supabase_url = source_url # Mặc định dùng của FE gửi lên nếu có
    
    if webm_files:
        final_audio_path = os.path.join(session_dir, f"final_{item_id}.mp3")
        merged_path = av_processor.merge_audio_chunks(webm_files, final_audio_path)
        
        if merged_path and os.path.exists(merged_path):
            # Ưu tiên dùng file đã fix duration từ BE
            print(f"[LIVE-REC] Đang upload file MP3 đã fix lên Supabase...")
            new_url = await upload_file_to_supabase(merged_path)
            if new_url:
                supabase_url = new_url

    # 3. Tạo bản ghi KnowledgeItem
    placeholder = KnowledgeItem(
        id=item_id,
        user_id=current_user.id,
        title=title,
        source_type="audio",
        source_url=supabase_url or "",
        status="pending",
        processing_stage="ingestion",
        language="vi",
        raw_content=full_content
    )
    db.add(placeholder)
    db.commit()

    # 4. Lấy AI options từ request headers
    def _get_field(header_name):
        return (request.headers.get(header_name) or "").strip()

    text_provider = _get_field("x-user-ai-provider").lower() or "openai"
    text_model    = _get_field("x-user-ai-model")          or "gpt-4o-mini"
    text_key      = _get_field("x-user-ai-key")            or None

    vision_provider = _get_field("x-user-vision-provider").lower() or text_provider
    vision_model    = _get_field("x-user-vision-model")          or text_model
    vision_key      = _get_field("x-user-vision-key")            or text_key

    stt_model = _get_field("x-user-stt-model") or "whisper-1"
    stt_key   = _get_field("x-user-stt-key")   or text_key

    ai_options = {
        "text":   {"provider": text_provider,   "model": text_model,   "api_key": text_key   or None},
        "vision": {"provider": vision_provider, "model": vision_model, "api_key": vision_key or None},
        "stt":    {"provider": "openai",         "model": stt_model,   "api_key": stt_key    or None},
    }

    # 5. Kick off enrichment pipeline (bỏ qua bước Ingestion vì đã có transcript)
    background_tasks.add_task(
        process_live_recording_task,
        item_id=item_id,
        full_content=full_content,
        segments=all_segments,
        title=title,
        ai_options=ai_options,
    )

    # 6. Dọn dẹp thư mục session
    try:
        shutil.rmtree(session_dir)
    except: pass

    print(f"[LIVE-REC] Session {session_id} FINISHED | {len(all_segments)} segments | {time_offset:.1f}s total")
    return {"item_id": item_id, "status": "processing", "total_segments": len(all_segments), "total_duration": time_offset}


# ========== REGENERATION ENDPOINTS ==========

@router.post("/{item_id}/regenerate-summary")
async def trigger_regenerate_summary(
    item_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Tạo lại Tóm tắt."""
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id): raise HTTPException(status_code=403, detail="Not authorized")

    item.status = "running"
    item.processing_stage = "Đang tạo lại Tóm tắt..."
    db.commit()

    def _get_field(header_name):
        return (request.headers.get(header_name) or "").strip()
    
    ai_options = {
        "text": {"provider": _get_field("x-user-ai-provider") or "openai", "model": _get_field("x-user-ai-model") or "gpt-4o-mini", "api_key": _get_field("x-user-ai-key") or None},
    }

    background_tasks.add_task(regenerate_summary_task, item_id, ai_options)
    return {"status": "running", "message": "Regeneration started"}


@router.post("/{item_id}/regenerate-mindmap")
async def trigger_regenerate_mindmap(
    item_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Tạo lại Sơ đồ tư duy."""
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id): raise HTTPException(status_code=403, detail="Not authorized")

    item.status = "running"
    item.processing_stage = "Đang tạo lại Sơ đồ tư duy..."
    db.commit()

    def _get_field(header_name):
        return (request.headers.get(header_name) or "").strip()
    
    ai_options = {
        "text": {"provider": _get_field("x-user-ai-provider") or "openai", "model": _get_field("x-user-ai-model") or "gpt-4o-mini", "api_key": _get_field("x-user-ai-key") or None},
    }

    background_tasks.add_task(regenerate_mindmap_task, item_id, ai_options)
    return {"status": "running", "message": "Regeneration started"}


@router.post("/{item_id}/regenerate-lessons")
async def trigger_regenerate_lessons(
    item_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Tạo lại toàn bộ bài học và quiz."""
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id): raise HTTPException(status_code=403, detail="Not authorized")

    item.status = "running"
    item.processing_stage = "Đang tạo lại toàn bộ Bài học..."
    db.commit()

    def _get_field(header_name):
        return (request.headers.get(header_name) or "").strip()
    
    ai_options = {
        "text": {"provider": _get_field("x-user-ai-provider") or "openai", "model": _get_field("x-user-ai-model") or "gpt-4o-mini", "api_key": _get_field("x-user-ai-key") or None},
        "vision": {"provider": _get_field("x-user-vision-provider") or "openai", "model": _get_field("x-user-vision-model") or "gpt-4o-mini", "api_key": _get_field("x-user-vision-key") or None},
    }

    background_tasks.add_task(regenerate_lessons_task, item_id, ai_options)
    return {"status": "running", "message": "Regeneration started"}


@router.post("/{item_id}/regenerate-quiz")
async def trigger_regenerate_quiz(
    item_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    difficulty: str = Form("intermediate"),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Tạo lại bộ câu hỏi trắc nghiệm."""
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id): raise HTTPException(status_code=403, detail="Not authorized")

    item.status = "running"
    item.processing_stage = f"Đang tạo lại Câu hỏi ({difficulty})..."
    db.commit()

    def _get_field(header_name):
        return (request.headers.get(header_name) or "").strip()
    
    ai_options = {
        "text": {"provider": _get_field("x-user-ai-provider") or "openai", "model": _get_field("x-user-ai-model") or "gpt-4o-mini", "api_key": _get_field("x-user-ai-key") or None},
    }

    background_tasks.add_task(regenerate_quiz_task, item_id, difficulty, ai_options)
    return {"status": "running", "message": "Regeneration started"}
