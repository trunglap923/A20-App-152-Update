from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import shutil
import re

from app.db.session import get_db
from app.models.knowledge_items import KnowledgeItem
from app.api import schemas
from app.workers.enrichment_pipeline import (
    process_enrichment_task, 
    regenerate_summary_task,
    regenerate_mindmap_task,
    regenerate_lessons_task,
    regenerate_quiz_task
)
from app.api.deps import get_current_user, UserInfo
from app.config import settings
from app.search.service import search_service
from app.services.item_service import ItemService
from app.core.logging import logger

from app.api.routes import items_stream, items_live

router = APIRouter(prefix="/items", tags=["items"])

# Mount sub-routers
router.include_router(items_stream.router)
router.include_router(items_live.router)

@router.post("/process", response_model=dict)
async def trigger_processing(
    request: Request,
    background_tasks: BackgroundTasks,
    source_type: str = Form(...),
    source_url: Optional[str] = Form(None),
    source_title: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user_ai_provider: Optional[str] = Form(None),
    user_ai_model: Optional[str] = Form(None),
    user_ai_key: Optional[str] = Form(None),
    user_vision_provider: Optional[str] = Form(None),
    user_vision_model: Optional[str] = Form(None),
    user_vision_key: Optional[str] = Form(None),
    user_stt_model: Optional[str] = Form(None),
    user_stt_key: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    final_source_url = source_url

    if file:
        upload_dir = settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join(upload_dir, filename)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        final_source_url = filepath

    if not final_source_url:
        raise HTTPException(status_code=400, detail="Thiếu nguồn dữ liệu (URL hoặc File).")

    item_id = str(uuid.uuid4())

    def _clean_filename(name: str) -> str:
        stem = name.rsplit('.', 1)[0] if '.' in name else name
        return re.sub(r'[_\-]+', ' ', stem).strip()

    if source_title and source_title.strip():
        initial_title = _clean_filename(source_title.strip())
    elif source_type == "youtube":
        initial_title = "YouTube"
    elif file and file.filename:
        initial_title = _clean_filename(file.filename)
    else:
        raw = (final_source_url or "").split('/')[-1].split('?')[0]
        raw = re.sub(r'^\d+_', '', raw)
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

    def _get_field(form_val, header_name):
        return (form_val or request.headers.get(header_name) or "").strip()

    text_provider = _get_field(user_ai_provider, "x-user-ai-provider").lower() or "openai"
    text_model    = _get_field(user_ai_model,    "x-user-ai-model")          or "gpt-4o-mini"
    text_key      = _get_field(user_ai_key,      "x-user-ai-key")            or None

    vision_provider = _get_field(user_vision_provider, "x-user-vision-provider").lower() or text_provider
    vision_model    = _get_field(user_vision_model,    "x-user-vision-model")          or text_model
    vision_key      = _get_field(user_vision_key,      "x-user-vision-key")            or text_key

    stt_model = _get_field(user_stt_model, "x-user-stt-model") or "whisper-1"
    stt_key   = _get_field(user_stt_key,   "x-user-stt-key")   or text_key

    ai_options = {
        "text":   {"provider": text_provider,   "model": text_model,   "api_key": text_key},
        "vision": {"provider": vision_provider, "model": vision_model, "api_key": vision_key},
        "stt":    {"provider": "openai",        "model": stt_model,    "api_key": stt_key},
    }

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
    return ItemService.get_user_items_list(db, current_user.id)

@router.get("/{item_id}", response_model=schemas.ItemResponse)
def get_item_detail(
    item_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user)
):
    base_url = str(request.base_url).rstrip("/")
    return ItemService.get_item_detail(db, item_id, current_user.id, base_url)

@router.patch("/{item_id}", response_model=dict)
async def rename_item(
    item_id: str,
    body: schemas.RenameItemRequest,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Tên không được để trống")

    item.title = title
    db.commit()

    await search_service.update_item_metadata(item_id, {"title": title})
    return {"id": item_id, "title": title}

@router.delete("/{item_id}", response_model=dict)
async def delete_item(
    item_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    from app.utils.cleanup import delete_item_completely

    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    source_url = item.source_url or ""
    background_tasks.add_task(delete_item_completely, item_id, source_url)
    return {"id": item_id, "deleted": True}

# ========== REGENERATION ENDPOINTS ==========

@router.post("/{item_id}/regenerate-summary")
async def trigger_regenerate_summary(
    item_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item or str(item.user_id) != str(current_user.id): 
        raise HTTPException(status_code=404, detail="Item not found")

    item.status = "running"
    item.processing_stage = "Đang tạo lại Tóm tắt..."
    db.commit()

    def _get_field(header_name): return (request.headers.get(header_name) or "").strip()
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
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item or str(item.user_id) != str(current_user.id): 
        raise HTTPException(status_code=404, detail="Item not found")

    item.status = "running"
    item.processing_stage = "Đang tạo lại Sơ đồ tư duy..."
    db.commit()

    def _get_field(header_name): return (request.headers.get(header_name) or "").strip()
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
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item or str(item.user_id) != str(current_user.id): 
        raise HTTPException(status_code=404, detail="Item not found")

    item.status = "running"
    item.processing_stage = "Đang tạo lại toàn bộ Bài học..."
    db.commit()

    def _get_field(header_name): return (request.headers.get(header_name) or "").strip()
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
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item or str(item.user_id) != str(current_user.id): 
        raise HTTPException(status_code=404, detail="Item not found")

    item.status = "running"
    item.processing_stage = f"Đang tạo lại Câu hỏi ({difficulty})..."
    db.commit()

    def _get_field(header_name): return (request.headers.get(header_name) or "").strip()
    ai_options = {
        "text": {"provider": _get_field("x-user-ai-provider") or "openai", "model": _get_field("x-user-ai-model") or "gpt-4o-mini", "api_key": _get_field("x-user-ai-key") or None},
    }

    background_tasks.add_task(regenerate_quiz_task, item_id, difficulty, ai_options)
    return {"status": "running", "message": "Regeneration started"}
