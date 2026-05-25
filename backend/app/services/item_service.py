from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException
import urllib.parse
import os
from datetime import datetime

from app.models.knowledge_items import KnowledgeItem
from app.models.summaries import Summary
from app.models.mindmaps import Mindmap
from app.models.lessons import Lesson
from app.models.quizzes import Quiz, QuizQuestion, QuizAnswer
from app.api import schemas
from app.core.logging import logger
import uuid

class ItemService:
    @staticmethod
    def get_user_items_list(db: Session, user_id: uuid.UUID):
        items = db.query(
            KnowledgeItem.id,
            KnowledgeItem.title,
            KnowledgeItem.source_type,
            KnowledgeItem.source_url,
            KnowledgeItem.created_at,
            KnowledgeItem.status,
            KnowledgeItem.processing_stage
        ).filter(KnowledgeItem.user_id == user_id)\
         .order_by(KnowledgeItem.created_at.desc()).all()
        
        results = []
        for item in items:
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

    @staticmethod
    def get_item_detail(db: Session, item_id: str, user_id: uuid.UUID, base_url: str) -> schemas.ItemResponse:
        item = db.query(KnowledgeItem).options(
            selectinload(KnowledgeItem.summaries),
            selectinload(KnowledgeItem.mindmaps),
            selectinload(KnowledgeItem.lessons).selectinload(Lesson.quizzes).selectinload(Quiz.questions).selectinload(QuizQuestion.answers)
        ).filter(KnowledgeItem.id == item_id).first()

        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        if str(item.user_id) != str(user_id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Map Summary Versions
        summary_versions = []
        summary_data = None
        if item.summaries:
            sorted_sums = sorted(item.summaries, key=lambda x: x.created_at or datetime.min, reverse=True)
            s0 = sorted_sums[0]
            raw_h0 = s0.highlights if isinstance(s0.highlights, list) else []
            summary_data = {
                "tldr": s0.tldr if isinstance(s0.tldr, list) else [],
                "detailed": s0.content,
                "highlights": [(h if isinstance(h, dict) else {"keyword": h, "source_quote": "N/A"}) for h in raw_h0]
            }
            
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

        # Map Mindmap Versions
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

        # Map Lessons & Quizzes
        lesson_versions = []
        lessons_data = []
        quiz_data = [] 
        import json
        from collections import defaultdict
        lesson_groups = defaultdict(list)
        lesson_created_ats = {}
        quiz_groups = defaultdict(list)
        quiz_created_ats = {}

        for l in sorted(item.lessons, key=lambda x: x.order_index or 0):
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
                
            lessons_data.append(l_item)

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
                    quiz_data.append(quiz_item) 

        sorted_lesson_titles = sorted(lesson_groups.keys(), key=lambda t: lesson_created_ats.get(t) or datetime.min, reverse=True)
        for t in sorted_lesson_titles:
            lesson_versions.append({
                "version_id": t,
                "label": t,
                "lessons": lesson_groups[t]
            })

        sorted_titles = sorted(quiz_groups.keys(), key=lambda t: quiz_created_ats.get(t) or datetime.min, reverse=True)
        quiz_versions = []
        for t in sorted_titles:
            quiz_versions.append({
                "version_id": t,
                "label": t,
                "questions": quiz_groups[t]
            })

        return_source_url = item.source_url or ""
        if return_source_url and not return_source_url.startswith("http"):
            fname = os.path.basename(return_source_url)
            return_source_url = f"{base_url}/data/{urllib.parse.quote(fname)}"

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
            "quiz": quiz_data, 
            "mindmap": mindmap_data,
            "summary_versions": summary_versions,
            "mindmap_versions": mindmap_versions,
            "lesson_versions": lesson_versions,
            "quiz_versions": quiz_versions
        }
                
        return schemas.ItemResponse(**item_data)

item_service = ItemService()
