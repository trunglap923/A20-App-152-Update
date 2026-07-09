import time
import uuid
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.db.session import engine
from app.models.knowledge_items import KnowledgeItem
from app.models.enrichment import EnrichmentJob

def clean_key(value: Any) -> str | None:
    if value is None:
        return None
    key = str(value).strip().strip('"').strip("'").strip()
    return key or None

def clean_text(text: Any) -> str:
    """Loại bỏ ký tự null (\x00) và các ký tự điều khiển lạ gây lỗi DB Postgres."""
    if not text:
        return ""
    if not isinstance(text, str):
        text = str(text)
    return text.replace("\x00", "").strip()

def normalize_ai_options(ai_options: Dict[str, Any] | None, task: str = "text") -> Dict[str, Any]:
    if not ai_options:
        return {"provider": "openai", "model": "gpt-4o-mini", "api_key": None}

    if task in ai_options and isinstance(ai_options[task], dict):
        raw = ai_options[task]
    elif "provider" in ai_options:
        raw = ai_options
    else:
        raw = {}

    provider = str(raw.get("provider", "openai")).strip().lower()
    model = str(raw.get("model", "")).strip()
    raw_key = raw.get("api_key")
    api_key = clean_key(raw_key)

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

def create_extractor(ai_options: Dict[str, Any] | None):
    from app.ai.extractor import KnowledgeExtractor
    options = normalize_ai_options(ai_options, task="text")
    print(
        f"[AI-RUNTIME][text] provider={options['provider']} model={options['model']} "
        f"source={'user-key' if options['api_key'] else 'system-default'}"
    )
    return KnowledgeExtractor(
        provider=options["provider"],
        model=options["model"],
        api_key=options["api_key"]
    )

def create_multimodal_analyzer(ai_options: Dict[str, Any] | None):
    from app.ai.multimodal import MultimodalAnalyzer
    options = normalize_ai_options(ai_options, task="vision")
    print(
        f"[AI-RUNTIME][vision] provider={options['provider']} model={options['model']} "
        f"source={'user-key' if options['api_key'] else 'system-default'}"
    )
    return MultimodalAnalyzer(
        provider=options["provider"],
        model_name=options["model"],
        api_key=options["api_key"]
    )

def create_transcriber(ai_options: Dict[str, Any] | None):
    from app.processors.media.transcription import Transcriber
    options = normalize_ai_options(ai_options, task="stt")
    return Transcriber(
        model_name=options["model"] or "whisper-1",
        api_key=options["api_key"]
    )

def track_job(session: Session, item_id_str: str, job_type: str, status: str):
    item_uuid = uuid.UUID(str(item_id_str))
    rows_updated = session.query(EnrichmentJob).filter_by(
        item_id=item_uuid, job_type=job_type
    ).update({"status": status}, synchronize_session=False)

    if rows_updated == 0:
        session.add(EnrichmentJob(
            id=uuid.uuid4(), item_id=item_uuid, job_type=job_type, status=status
        ))
    session.commit()

import redis
import json
from app.core.config import settings

# Tạo client redis đồng bộ để publish event từ worker
try:
    redis_kwargs = {"decode_responses": True}
    if settings.REDIS_URL.startswith("rediss://"):
        redis_kwargs["ssl_cert_reqs"] = "none"
    redis_sync = redis.from_url(settings.REDIS_URL, **redis_kwargs)
except Exception:
    redis_sync = None

def update_stage(item_id: str, stage: str):
    try:
        with Session(engine) as session:
            session.query(KnowledgeItem).filter(
                KnowledgeItem.id == uuid.UUID(str(item_id))
            ).update({"processing_stage": stage})
            session.commit()
        
        # Bắn event qua Redis Pub/Sub để frontend nhận ngay (SSE)
        if redis_sync:
            redis_sync.publish(f"item:{item_id}", json.dumps({"stage": stage}))
    except Exception as e:
        print(f"[STAGE] WARNING: Không thể cập nhật stage '{stage}': {e}")
