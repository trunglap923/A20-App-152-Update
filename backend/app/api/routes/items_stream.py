import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
import urllib.parse
import os
from datetime import datetime

from app.db.session import SessionLocal
from app.models.knowledge_items import KnowledgeItem
from app.models.summaries import Summary
from app.models.mindmaps import Mindmap
from app.models.lessons import Lesson
from app.models.quizzes import Quiz, QuizQuestion
from app.api.deps import get_current_user_sse, UserInfo
from app.core.logging import logger

router = APIRouter()

@router.get("/{item_id}/stream")
async def stream_item_status(
    item_id: str,
    request: Request,
    token: str | None = None,
    current_user: UserInfo = Depends(get_current_user_sse)
):
    """
    Server-Sent Events endpoint: Backend chủ động PUSH trạng thái về Frontend.
    Thay thế Polling, giúp giảm số lượng request từ O(N×T) xuống O(N).
    """
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

            with SessionLocal() as db:
                try:
                    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
                    
                    if not item:
                        yield f"data: {json.dumps({'error': 'Item deleted'})}\n\n"
                        break

                    stage = item.processing_stage or item.status
                    
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

                    # ─── Kiểm tra Summary ───
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

                    # ─── Kiểm tra Lessons ───
                    if not pushed_lessons:
                        lesson_count = db.query(Lesson).filter(Lesson.item_id == item_id).count()
                        if lesson_count > 0:
                            pushed_lessons = True
                            has_new_data = True
                            lessons_q = db.query(Lesson).filter(Lesson.item_id == item_id).all()
                            lessons_data = []
                            for l in sorted(lessons_q, key=lambda x: x.order_index or 0):
                                key_points = []
                                if l.metadata_json:
                                    try: key_points = json.loads(l.metadata_json).get("key_points", [])
                                    except: pass
                                lessons_data.append({
                                    "id": str(l.id), "title": l.title,
                                    "keyConcept": l.content,
                                    "example": l.example or "",
                                    "start": l.start_time, "end": l.end_time,
                                    "key_points": key_points
                                })
                            payload["lessons"] = lessons_data

                    # ─── Khi done: Push TOÀN BỘ data ───
                    if item.status == 'done':
                        has_new_data = True
                        full = db.query(KnowledgeItem).options(
                            selectinload(KnowledgeItem.summaries),
                            selectinload(KnowledgeItem.mindmaps),
                            selectinload(KnowledgeItem.lessons).selectinload(Lesson.quizzes)
                                .selectinload(Quiz.questions).selectinload(QuizQuestion.answers)
                        ).filter(KnowledgeItem.id == item_id).first()
                        
                        summary_versions = []
                        if full.summaries:
                            sorted_sums = sorted(full.summaries, key=lambda x: x.created_at or datetime.min, reverse=True)
                            s = sorted_sums[0]
                            payload["summary"] = {
                                "tldr": s.tldr if isinstance(s.tldr, list) else [],
                                "detailed": s.content,
                                "highlights": [(h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"}) for h in (s.highlights or [])]
                            }
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

                        lessons_list = []
                        quiz_list = []
                        from collections import defaultdict
                        lesson_groups = defaultdict(list)
                        lesson_created_ats = {}
                        quiz_groups = defaultdict(list)
                        quiz_created_ats = {}

                        for l in sorted(full.lessons, key=lambda x: x.order_index or 0):
                            kp = []
                            if l.metadata_json:
                                try: kp = json.loads(l.metadata_json).get("key_points", [])
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

                    if stage != last_stage or has_new_data:
                        last_stage = stage
                        yield f"data: {json.dumps(payload)}\n\n"

                    if item.status == 'done' or item.status == 'failed':
                        break

                except Exception as e:
                    import traceback
                    logger.error(f"[SSE-ERROR] {traceback.format_exc()}")
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
