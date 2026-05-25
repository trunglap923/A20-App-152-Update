from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
import json
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.api import schemas
from app.api.deps import get_current_user, UserInfo
from app.models.chat_messages import ChatMessage
from app.services.chat_service import ChatService
from app.services.tts_service import TTSService
from app.services.credit_service import check_user_balance

router = APIRouter(prefix="/chat", tags=["chat"])

@router.get("", response_model=List[schemas.ChatMessageResponse])
async def get_chat_history(
    item_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    item_uuid = ChatService.validate_item_ownership(db, current_user.id, item_id)
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id, ChatMessage.item_id == item_uuid)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return [
        schemas.ChatMessageResponse(
            id=str(m.id),
            role=m.role,
            content=m.content,
            sources=m.sources or [],
            created_at=m.created_at,
        )
        for m in messages
    ]

@router.post("")
async def chat_with_ai(
    chat_req: schemas.ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if not check_user_balance(str(current_user.id), 1):
        raise HTTPException(status_code=402, detail="Bạn đã hết credit, vui lòng nạp thêm.")

    message = (chat_req.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Tin nhắn không được để trống")

    item_uuid = ChatService.validate_item_ownership(db, current_user.id, chat_req.item_id)
    if not item_uuid:
        raise HTTPException(status_code=400, detail="Vui lòng chọn tài liệu trước khi chat.")

    provider = (request.headers.get("x-user-ai-provider") or "openai").strip()
    model = (request.headers.get("x-user-ai-model") or "gpt-4o-mini").strip()
    api_key = (request.headers.get("x-user-ai-key") or "").strip() or None

    # Try to find a reusable answer first
    reusable = ChatService.find_reusable_answer(db, current_user.id, item_uuid, message)
    if reusable:
        # Giả lập stream ngắn gọn
        async def mock_stream():
            yield f"data: {{'status': '🧠 Đã tìm thấy câu trả lời cũ...'}}\n\n"
            yield f"data: {{'answer': {json.dumps(reusable)}, 'sources': []}}\n\n"
        return StreamingResponse(mock_stream(), media_type="text/event-stream")

    return StreamingResponse(
        ChatService.stream_chat_response(
            message=message,
            item_uuid=item_uuid,
            db=db,
            current_user_id=current_user.id,
            history_req=chat_req.history,
            provider=provider,
            model=model,
            api_key=api_key,
            background_tasks=background_tasks
        ),
        media_type="text/event-stream"
    )

@router.post("/tts")
async def synthesize_chat_tts(
    tts_req: schemas.ChatTtsRequest,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    ChatService.validate_item_ownership(db, current_user.id, tts_req.item_id)
    
    audio_content, voice_used = await TTSService.synthesize(tts_req.text, tts_req.voice_selection)
    
    return Response(
        content=audio_content,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-TTS-Voice": voice_used,
        },
    )
