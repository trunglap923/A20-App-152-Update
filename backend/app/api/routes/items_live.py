import os
import shutil
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.knowledge_items import KnowledgeItem
from app.api.deps import get_current_user, UserInfo
from app.workers.enrichment_pipeline import process_live_recording_task_sync
from app.core.logging import logger

router = APIRouter()

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
    from app.processors.media.audio_processing import AudioVideoProcessor
    from app.processors.media.transcription import Transcriber

    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data"))
    session_dir = os.path.join(upload_dir, f"live_{session_id}")
    os.makedirs(session_dir, exist_ok=True)
    av_processor = AudioVideoProcessor(session_dir)

    # 1. Lưu file webm gốc
    raw_path = os.path.join(session_dir, f"chunk_{chunk_index}.webm")
    with open(raw_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 2. Convert sang MP3
    mp3_path = os.path.join(session_dir, f"chunk_{chunk_index}.mp3")
    try:
        av_processor.convert_to_mp3(raw_path, output_path=mp3_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FFmpeg error: {e}")

    # 3. Đo chính xác độ dài chunk
    chunk_duration = av_processor.get_duration(mp3_path)

    # 4. Kiểm tra Volume
    mean_volume = av_processor.get_mean_volume(mp3_path)
    segments = []
    
    if mean_volume < -50:
        logger.info(f"Chunk {chunk_index} im lặng hoặc quá nhỏ ({mean_volume} dB). Bỏ qua STT.")
    else:
        # 5. Transcribe bằng Whisper API
        transcriber = Transcriber()
        transcribe_data = await transcriber.process(mp3_path)
        raw_segments = transcribe_data.get("segments", [])
        
        # 6. Lọc ảo giác
        hallucination_keywords = [
            "ĐĂNG KÝ KÊNH", "SUBSCRIBE", "XEM VIDEO MỚI", "LIKE VIDEO", 
            "CẢM ƠN CÁC BẠN", "THANK YOU FOR WATCHING"
        ]
        
        for s in raw_segments:
            txt_upper = s["text"].upper()
            is_junk = any(kw in txt_upper for kw in hallucination_keywords)
            if is_junk and len(s["text"]) < 100:
                logger.info(f"Đã lọc ảo giác: {s['text']}")
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

    # 8. Dọn dẹp file tạm
    for p in [mp3_path]:
        if os.path.exists(p):
            try: os.remove(p)
            except: pass

    logger.info(f"Session {session_id} | Chunk {chunk_index} | {len(segments)} segments | {chunk_duration:.2f}s")
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

    # 2. Hợp nhất segments với Timestamp Shifting
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
            
            m, s = divmod(int(abs_start), 60)
            ts_str = f"[{m:02d}:{s:02d}]"
            full_texts.append(f"{ts_str} {seg['text']}")

        time_offset += chunk_data.get("duration", 180.0)

    full_content = "\n".join(full_texts)

    # 2.5 Ghép audio & Upload lên Supabase
    from app.processors.media.audio_processing import AudioVideoProcessor
    from app.utils.supabase_storage import upload_file_to_supabase
    
    av_processor = AudioVideoProcessor(session_dir)
    webm_files = sorted(
        [os.path.join(session_dir, f) for f in os.listdir(session_dir) if f.endswith(".webm")],
        key=lambda x: int(os.path.basename(x).replace("chunk_", "").replace(".webm", ""))
    )
    
    item_id = str(uuid.uuid4())
    supabase_url = source_url 
    
    if webm_files:
        final_audio_path = os.path.join(session_dir, f"final_{item_id}.mp3")
        merged_path = av_processor.merge_audio_chunks(webm_files, final_audio_path)
        
        if merged_path and os.path.exists(merged_path):
            logger.info("Đang upload file MP3 đã fix lên Supabase...")
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

    # 5. Kick off enrichment pipeline
    process_live_recording_task_sync.delay(
        item_id,
        full_content,
        all_segments,
        title,
        ai_options,
    )

    # 6. Dọn dẹp thư mục session
    try:
        shutil.rmtree(session_dir)
    except: pass

    logger.info(f"Session {session_id} FINISHED | {len(all_segments)} segments | {time_offset:.1f}s total")
    return {"item_id": item_id, "status": "processing", "total_segments": len(all_segments), "total_duration": time_offset}
