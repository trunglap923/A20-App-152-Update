from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
import json
from sqlalchemy.orm import Session
from typing import List
import uuid
import re
from difflib import SequenceMatcher
from xml.sax.saxutils import escape
import httpx

from app.db.session import get_db
from app.api import schemas
from app.api.deps import get_current_user, UserInfo
from app.search.service import search_service
from app.ai.providers import get_chat_provider
from app.ai.prompts import PROMPT_CHAT_RAG
from app.models.chat_messages import ChatMessage
from app.models.knowledge_items import KnowledgeItem
from app.models.chunks import ItemChunk
from app.models.summaries import Summary
from app.models.lessons import Lesson
from app.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])

AZURE_TTS_PRESETS: dict[str, dict[str, str]] = {
    "auto": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "0%",
        "pitch": "0%",
        "region": "neutral",
    },
    "preset:nu_mien_bac": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "-16%",
        "pitch": "+3st",
        "region": "north",
    },
    "preset:nu_mien_nam": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "+8%",
        "pitch": "-1st",
        "region": "south",
    },
    "preset:nm_mien_bac": {
        "voice": "vi-VN-NamMinhNeural",
        "rate": "-12%",
        "pitch": "-3st",
        "region": "north",
    },
    "preset:nm_mien_nam": {
        "voice": "vi-VN-NamMinhNeural",
        "rate": "+10%",
        "pitch": "-1st",
        "region": "south",
    },
    "azure:vi-VN-HoaiMyNeural": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "0%",
        "pitch": "0%",
        "region": "neutral",
    },
    "azure:vi-VN-NamMinhNeural": {
        "voice": "vi-VN-NamMinhNeural",
        "rate": "0%",
        "pitch": "0%",
        "region": "neutral",
    },
}


def _resolve_azure_tts_profile(selection: str | None) -> dict[str, str]:
    safe_selection = (selection or "auto").strip()
    if safe_selection in AZURE_TTS_PRESETS:
        return AZURE_TTS_PRESETS[safe_selection]

    if safe_selection.startswith("azure:"):
        voice_name = safe_selection.split(":", 1)[1].strip()
        if re.fullmatch(r"[A-Za-z0-9-]+", voice_name):
            return {
                "voice": voice_name,
                "rate": "0%",
                "pitch": "0%",
                "region": "neutral",
            }

    return AZURE_TTS_PRESETS["auto"]


def _regionalize_tts_text(text: str, region: str | None) -> str:
    safe_text = (text or "").strip()
    if not safe_text:
        return ""

    if region == "south":
        replacements = [
            (r"\bvâng\b", "dạ"),
            (r"\bVâng\b", "Dạ"),
            (r"\bkhông\b", "hông"),
            (r"\bKhông\b", "Hông"),
            (r"\bđấy\b", "đó"),
            (r"\bĐấy\b", "Đó"),
        ]
        for pattern, replacement in replacements:
            safe_text = re.sub(pattern, replacement, safe_text)
        return safe_text

    if region == "north":
        replacements = [
            (r"\bdạ\b", "vâng"),
            (r"\bDạ\b", "Vâng"),
            (r"\bhông\b", "không"),
            (r"\bHông\b", "Không"),
            (r"\bđó\b", "đấy"),
            (r"\bĐó\b", "Đấy"),
        ]
        for pattern, replacement in replacements:
            safe_text = re.sub(pattern, replacement, safe_text)
        if not re.search(r"\b(vâng|ạ)\b", safe_text.lower()):
            safe_text = f"Vâng, {safe_text}"
        return safe_text

    return safe_text


def _build_azure_ssml(text: str, selection: str | None) -> str:
    profile = _resolve_azure_tts_profile(selection)
    regional_text = _regionalize_tts_text(text, profile.get("region"))
    safe_text = escape(regional_text)
    return f"""
<speak version="1.0" xml:lang="vi-VN">
  <voice name="{profile["voice"]}">
    <prosody rate="{profile["rate"]}" pitch="{profile["pitch"]}">{safe_text}</prosody>
  </voice>
</speak>
""".strip()

def _validate_item_ownership(db: Session, current_user: UserInfo, item_id: str | None) -> uuid.UUID | None:
    if not item_id:
        return None
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="item_id không hợp lệ")

    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
    if not item or str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Không có quyền truy cập item này")
    return item_uuid


from app.models.chat_summaries import ChatSummary

def _get_history_with_long_term_memory(history: list[dict] | None, db: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> list[tuple[str, str]]:
    """
    Lấy Short-term memory (4 tin nhắn cuối) và Long-term memory từ DB.
    Zero-latency, không chặn luồng chat chính.
    """
    if not history:
        return []
        
    recent = history[-4:] # Short-term memory
    compacted: list[tuple[str, str]] = []
    
    # Kéo Long-term memory từ DB
    summary_record = db.query(ChatSummary).filter(
        ChatSummary.user_id == user_id,
        ChatSummary.item_id == item_id
    ).first()
    
    if summary_record and summary_record.summary:
        compacted.append(("ai", f"[Long-term Memory]: {summary_record.summary}"))
            
    # Thêm Short-term memory
    for msg in recent:
        role = "human" if msg.get("role") == "user" else "ai"
        content = (msg.get("content") or "").strip()
        if len(content) > 1000:
            content = content[:1000] + "..."
        compacted.append((role, content))
        
    return compacted


def _normalize_text(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _canonicalize_question(text: str) -> str:
    """
    Chuẩn hóa câu hỏi để tăng tỷ lệ bắt câu hỏi lặp:
    - bỏ dấu câu
    - loại các cụm lịch sự/phụ trợ hay gây nhiễu
    """
    normalized = _normalize_text(text)
    normalized = re.sub(r"[^\wÀ-ỹ\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return ""

    filler_phrases = [
        "ban co the",
        "bạn có thể",
        "co the",
        "có thể",
        "cho toi",
        "cho mình",
        "cho minh",
        "giup toi",
        "giúp tôi",
        "giup minh",
        "giúp mình",
        "duoc khong",
        "được không",
        "duoc ko",
        "được ko",
        "khong",
        "không",
        "nhe",
        "nhé",
    ]
    for phrase in filler_phrases:
        normalized = normalized.replace(phrase, " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _tokenize_keywords(text: str) -> list[str]:
    stopwords = {
        "la", "là", "va", "và", "cua", "của", "cho", "toi", "tôi", "ban", "bạn",
        "minh", "mình", "nay", "này", "kia", "the", "thế", "nao", "nào", "sao",
        "duoc", "được", "khong", "không", "voi", "với", "gi", "gì", "nhu", "như",
        "mot", "một", "cac", "các", "ve", "về", "trong", "tai", "tại", "cau", "câu",
        "hoi", "hỏi", "and", "the", "is", "are", "what", "how", "why", "when",
    }
    words = re.findall(r"[a-zA-ZÀ-ỹ0-9_]+", _normalize_text(text))
    return [w for w in words if len(w) >= 3 and w not in stopwords]


def _keyword_overlap_ratio(a: set[str], b: set[str]) -> float:
    """
    Độ phủ keyword của câu ngắn hơn so với câu dài hơn.
    Dùng để bắt case cùng ý nhưng thêm/bớt ít từ.
    """
    if not a or not b:
        return 0.0
    common = len(a & b)
    return common / max(min(len(a), len(b)), 1)


def _detect_question_intent(text: str) -> str:
    """
    Phân loại intent mức đơn giản để chặn reuse sai nghĩa.
    """
    canonical = _canonicalize_question(text)
    if not canonical:
        return "other"

    def has_any(phrases: list[str]) -> bool:
        return any(phrase in canonical for phrase in phrases)

    if has_any(["la gi", "là gì", "dinh nghia", "định nghĩa", "khai niem", "khái niệm"]):
        return "definition"
    if has_any(["ke hoach", "kế hoạch", "lo trinh", "lộ trình", "tranh", "tránh", "giam", "giảm"]):
        return "planning"
    if has_any(["nhu the nao", "như thế nào", "lam sao", "làm sao", "cach", "cách", "huong dan", "hướng dẫn"]):
        return "how_to"
    if has_any(["tai sao", "tại sao", "vi sao", "vì sao", "nguyen nhan", "nguyên nhân"]):
        return "cause"
    if has_any(["so sanh", "so với", "khac nhau", "khác nhau"]):
        return "comparison"
    return "other"


def _extract_intent_markers(text: str, intent: str) -> set[str]:
    canonical = _canonicalize_question(text)
    if not canonical:
        return set()

    markers_by_intent: dict[str, list[str]] = {
        "definition": ["la gi", "là gì", "dinh nghia", "định nghĩa", "khai niem", "khái niệm"],
        "planning": ["ke hoach", "kế hoạch", "lo trinh", "lộ trình", "tranh", "tránh", "giam", "giảm"],
        "how_to": ["cach", "cách", "huong dan", "hướng dẫn", "lam sao", "làm sao", "nhu the nao", "như thế nào"],
        "cause": ["tai sao", "tại sao", "vi sao", "vì sao", "nguyen nhan", "nguyên nhân"],
        "comparison": ["so sanh", "so với", "khac nhau", "khác nhau"],
    }
    markers = markers_by_intent.get(intent, [])
    return {m for m in markers if m in canonical}


def _is_conversational_message(text: str) -> bool:
    """
    Nhận diện câu chào, câu cảm thán, hoặc câu tự sự ngắn không phải câu hỏi kiến thức.
    """
    normalized = _normalize_text(text)
    if not normalized:
        return False
    
    # Nếu có dấu hỏi chấm ở cuối, ưu tiên coi là câu hỏi kiến thức (cần RAG/Scope check)
    if normalized.endswith("?") or "?" in normalized:
        # Ngoại trừ các câu hỏi thăm xã giao ngắn
        social_questions = {"khỏe không", "khoe khong", "sao roi", "sao rồi", "on khong", "ổn không"}
        if not any(q in normalized for q in social_questions):
            return False

    cleaned = re.sub(r"[^\wÀ-ỹ\s]", " ", normalized)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return False

    # 1) Chào hỏi
    greetings = {
        "hi", "hello", "hey", "xin chào", "xin chao", "chào", "chao",
        "chào bạn", "chao ban", "helo", "alo", "Ura ơi", "Ura oi"
    }
    if cleaned in greetings or any(g in cleaned for g in ["xin chào", "chào bạn"]):
        return True

    # 2) Câu cảm thán / Khen ngợi
    exclamations = {
        "tuyệt", "tuyệt vời", "tuyet voi", "hay quá", "hay qua", "thú vị", "thu vi",
        "giỏi quá", "gioi qua", "wow", "ồ", "ooh", "ghê vậy", "ghe vay"
    }
    if cleaned in exclamations or any(e in cleaned for e in ["hay quá", "tuyệt vời"]):
        return True

    # 3) Xác nhận / Tâm sự / Tự sự ngắn
    narratives = {
        "được rồi", "duoc roi", "hiểu rồi", "hieu roi", "mình hiểu rồi", "minh hieu roi",
        "ok", "okay", "vâng", "vang", "dạ", "da", "cảm ơn", "cam on", "thanks",
        "mình biết rồi", "minh biet roi", "vậy sao", "vay sao", "thế à", "the a",
        "khó quá", "kho qua", "hơi khó", "hoi kho", "rắc rối quá", "rac roi qua",
        "mình đang nghe", "minh dang nghe", "tiếp đi", "tiep di", "nói tiếp đi", "noi tiep di"
    }
    if cleaned in narratives or any(n in cleaned for n in ["hiểu rồi", "được rồi", "khó quá"]):
        return True

    # 4) Các câu tự sự bắt đầu bằng "mình thấy", "tôi thấy", "Ura ơi"
    intro_markers = ["mình thấy", "minh thay", "tôi thấy", "toi thay", "Ura ơi", "Ura oi", "cho mình hỏi chút"]
    if any(cleaned.startswith(m) for m in intro_markers):
        return True

    return False


def _friendly_conversational_reply(text: str = "") -> str:
    normalized = _normalize_text(text)
    
    # 1. Cảm ơn
    if any(word in normalized for word in ["cảm ơn", "cam on", "thanks"]):
        return "Không có gì nè! Ura luôn sẵn sàng đồng hành cùng bạn. Bạn cần hỗ trợ gì thêm không?"
    
    # 2. Khen ngợi
    if any(word in normalized for word in ["tuyệt vời", "hay quá", "thú vị", "giỏi"]):
        return "Ura rất vui khi bạn thấy thú vị! Hy vọng những kiến thức này sẽ giúp ích nhiều cho bạn."

    # 3. Than khó / Tâm sự
    if any(word in normalized for word in ["khó quá", "hơi khó", "rắc rối", "chưa hiểu"]):
        return "Đừng lo lắng nhé! Kiến thức này lúc đầu có thể hơi lạ lẫm. Bạn muốn Ura giải thích lại phần nào một cách đơn giản hơn không?"

    # 4. Xác nhận đã hiểu
    if any(word in normalized for word in ["được rồi", "hiểu rồi", "biết rồi", "ok"]):
        return "Tuyệt vời! Khi bạn đã nắm vững phần này, chúng ta có thể chuyển sang nội dung tiếp theo hoặc làm một bài quiz nhỏ nhé?"

    # 5. Chào hỏi hoặc gọi tên
    if any(word in normalized for word in ["chào", "hello", "hi", "Ura"]):
        return "Ura đây! Rất vui được trò chuyện cùng bạn. Bạn muốn tóm tắt bài học, giải thích khái niệm hay thử sức với quiz nào?"

    return (
        "Ura vẫn đang lắng nghe bạn đây. Bạn có muốn mình hỗ trợ sâu hơn về nội dung bài học này không?"
    )


def _is_in_scope_question(db: Session, item_uuid: uuid.UUID, question: str) -> bool:
    """
    Chặn câu hỏi hoàn toàn không liên quan trước khi gọi model.
    Nới lỏng để tránh chặn nhầm các câu hỏi có ngữ cảnh gián tiếp.
    """
    q_keywords = _tokenize_keywords(question)
    question_lower = question.lower()
    
    # LUÔN cho qua các câu hỏi rõ ràng về nội dung/bài học/tài liệu
    context_words = {"bài học", "nội dung", "tài liệu", "phần này", "câu chuyện", "đoạn này", 
                    "chủ đề", "đề tài", "nội dung chính", "bài này", "học này", "sách này",
                    "tóm tắt", "tóm tắt lại", "tóm lược", "nội dung chính"}
    if any(word in question_lower for word in context_words):
        return True
    
    if not q_keywords:
        # Nếu câu hỏi quá ngắn hoặc không có keyword rõ ràng, cho phép đi tiếp để LLM tự xử lý
        return True

    sample_chunks = (
        db.query(ItemChunk.content)
        .filter(ItemChunk.item_id == item_uuid)
        .order_by(ItemChunk.chunk_index.asc())
        .limit(50)  # Tăng lên 50 chunks để lấy nhiều ngữ cảnh hơn
        .all()
    )
    corpus_text = " ".join([c[0] for c in sample_chunks if c and c[0]])
    corpus_text = _normalize_text(corpus_text)
    if not corpus_text:
        return True

    matched = 0
    for kw in q_keywords:
        if kw in corpus_text:
            matched += 1

    # Nới lỏng ngưỡng chặn:
    # 1. Chỉ cần match 1 keyword quan trọng (thay vì 2)
    # 2. Hoặc tỷ lệ match chỉ cần >= 15% (thay vì 35%)
    
    if matched >= 1 or (matched / max(len(q_keywords), 1)) >= 0.15:
        return True

    return False


def _find_reusable_answer(
    db: Session,
    user_id: uuid.UUID,
    item_id: uuid.UUID | None,
    question: str,
    similarity_threshold: float = 0.92,
) -> str | None:
    """
    Nếu người dùng hỏi lặp lại, trả lại câu trả lời cũ để không gọi LLM lần nữa.
    """
    question_lower = question.lower()
    is_about_content = any(word in question_lower for word in [
        "bài học", "nội dung", "tài liệu", "chủ đề", "đề tài", 
        "nội dung chính", "tóm tắt", "tóm lược"
    ])
    
    query = db.query(ChatMessage).filter(ChatMessage.user_id == user_id)
    if item_id:
        query = query.filter(ChatMessage.item_id == item_id)
    # Chỉ xét hội thoại gần đây để giảm tải DB và vẫn đủ cho case hỏi lặp.
    recent_messages = (
        query.order_by(ChatMessage.created_at.desc())
        .limit(200)
        .all()
    )
    messages = list(reversed(recent_messages))

    # Ghép cặp (user -> assistant)
    qa_pairs: list[tuple[str, str]] = []
    last_user_text: str | None = None
    for m in messages:
        if m.role == "user":
            last_user_text = m.content or ""
        elif m.role == "assistant" and last_user_text:
            qa_pairs.append((last_user_text, m.content or ""))
            last_user_text = None

    if not qa_pairs:
        return None

    q_norm = _normalize_text(question)
    q_canonical = _canonicalize_question(question)
    q_keywords = set(_tokenize_keywords(question))
    q_intent = _detect_question_intent(question)
    q_intent_markers = _extract_intent_markers(question, q_intent)
    best_score = 0.0
    best_answer: str | None = None

    for old_q, old_a in reversed(qa_pairs[-50:]):  # chỉ xét 50 cặp gần nhất
        old_q_norm = _normalize_text(old_q)
        old_q_canonical = _canonicalize_question(old_q)
        old_q_keywords = set(_tokenize_keywords(old_q))
        old_intent = _detect_question_intent(old_q)
        old_intent_markers = _extract_intent_markers(old_q, old_intent)

        # Nếu intent khác nhau thì không reuse để tránh trùng sai nghĩa.
        if q_intent != old_intent:
            continue

        if q_norm == old_q_norm:
            # Nếu câu hỏi về nội dung và câu trả lời cũ là "không biết", không reuse
            if is_about_content:
                old_a_lower = old_a.lower()
                skip_phrases = [
                    "không biết", "không hiểu", "không thể trả lời", 
                    "không rõ", "xin lỗi", "không có thông tin",
                    "ngoài phạm vi", "không liên quan"
                ]
                if any(phrase in old_a_lower for phrase in skip_phrases):
                    continue
            return old_a

        if q_canonical and old_q_canonical and q_canonical == old_q_canonical:
            if is_about_content:
                old_a_lower = old_a.lower()
                skip_phrases = [
                    "không biết", "không hiểu", "không thể trả lời", 
                    "không rõ", "xin lỗi", "không có thông tin",
                    "ngoài phạm vi", "không liên quan"
                ]
                if any(phrase in old_a_lower for phrase in skip_phrases):
                    continue
            return old_a

        # Cùng intent nhưng marker không giao nhau => coi như khác mục tiêu câu hỏi.
        if q_intent != "other" and q_intent_markers and old_intent_markers:
            if not (q_intent_markers & old_intent_markers):
                continue

        common_keywords = len(q_keywords & old_q_keywords)
        min_keywords = min(len(q_keywords), len(old_q_keywords))

        # Câu quá ngắn/generic rất dễ reuse nhầm: chỉ cho qua nếu match gần như tuyệt đối.
        if min_keywords <= 2:
            seq_score_short = SequenceMatcher(None, q_canonical or q_norm, old_q_canonical or old_q_norm).ratio()
            if seq_score_short >= 0.97:
                if is_about_content:
                    old_a_lower = old_a.lower()
                    skip_phrases = [
                        "không biết", "không hiểu", "không thể trả lời", 
                        "không rõ", "xin lỗi", "không có thông tin",
                        "ngoài phạm vi", "không liên quan"
                    ]
                    if any(phrase in old_a_lower for phrase in skip_phrases):
                        continue
                return old_a
            continue

        # Chỉ cho phép "containment reuse" khi cả hai câu đều có đủ ngữ nghĩa.
        # Tránh false-positive kiểu: "thu nhập là gì" vs "kế hoạch tránh bẫy thu nhập".
        if min_keywords >= 3:
            overlap_ratio = _keyword_overlap_ratio(q_keywords, old_q_keywords)
            if common_keywords >= 4 and overlap_ratio >= 0.92:
                if is_about_content:
                    old_a_lower = old_a.lower()
                    skip_phrases = [
                        "không biết", "không hiểu", "không thể trả lời", 
                        "không rõ", "xin lỗi", "không có thông tin",
                        "ngoài phạm vi", "không liên quan"
                    ]
                    if any(phrase in old_a_lower for phrase in skip_phrases):
                        continue
                return old_a

        # Kết hợp 2 metric để bắt câu gần giống nhưng khác cấu trúc câu.
        seq_score = SequenceMatcher(None, q_canonical or q_norm, old_q_canonical or old_q_norm).ratio()
        union_size = len(q_keywords | old_q_keywords)
        jaccard_score = (common_keywords / union_size) if union_size else 0.0
        score = (0.7 * seq_score) + (0.3 * jaccard_score)
        if score > best_score:
            best_score = score
            best_answer = old_a

    # Intent cùng loại nhưng "other" rất mơ hồ, chỉ reuse khi gần như trùng hẳn.
    required_threshold = similarity_threshold + 0.05 if q_intent == "other" else similarity_threshold
    if best_score >= required_threshold and best_answer:
        # Kiểm tra lại trước khi trả về best_answer
        if is_about_content:
            old_a_lower = best_answer.lower()
            skip_phrases = [
                "không biết", "không hiểu", "không thể trả lời", 
                "không rõ", "xin lỗi", "không có thông tin",
                "ngoài phạm vi", "không liên quan"
            ]
            if any(phrase in old_a_lower for phrase in skip_phrases):
                return None
        return best_answer
    return None


@router.get("", response_model=List[schemas.ChatMessageResponse])
async def get_chat_history(
    item_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    item_uuid = _validate_item_ownership(db, current_user, item_id)
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
    from app.utils.credits import check_user_balance
    if not check_user_balance(str(current_user.id), 1):
        raise HTTPException(status_code=402, detail="Bạn đã hết credit, vui lòng nạp thêm.")

    message = (chat_req.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Tin nhắn không được để trống")

    item_uuid = _validate_item_ownership(db, current_user, chat_req.item_id)
    if not item_uuid:
        raise HTTPException(status_code=400, detail="Vui lòng chọn tài liệu trước khi chat.")

    async def event_generator():
        try:
            # 1) Trả lời thân thiện nếu là câu giao tiếp xã giao
            if _is_conversational_message(message):
                greeting_answer = _friendly_conversational_reply(message)
                db.add(ChatMessage(
                    user_id=current_user.id,
                    item_id=item_uuid,
                    role="user",
                    content=message,
                ))
                db.add(ChatMessage(
                    user_id=current_user.id,
                    item_id=item_uuid,
                    role="assistant",
                    content=greeting_answer,
                ))
                db.commit()
                yield f"data: {json.dumps({'answer': greeting_answer, 'sources': []})}\n\n"
                return

            # 2) Chuẩn bị cho Agent chạy
            item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
            doc_summary = ""
            if item:
                print(f"🔍 [DEBUG] Đang tìm bản tóm tắt mới nhất cho Item ID: {item_uuid}")
                summary_obj = db.query(Summary).filter(Summary.item_id == item_uuid).order_by(Summary.created_at.desc()).first()
                if summary_obj:
                    print(f"✅ [DEBUG] Tìm thấy bản tóm tắt. TLDR: {len(summary_obj.tldr) if summary_obj.tldr else 0} points, Content: {len(summary_obj.content) if summary_obj.content else 0} chars")
                    # Tạo bản tóm tắt gọn gàng để lưu vào state
                    parts = []
                    if summary_obj.tldr and len(summary_obj.tldr) > 0:
                        parts.append("Tóm tắt nhanh:\n" + "\n".join([f"- {p}" for p in summary_obj.tldr[:5]]))
                    if summary_obj.content:
                        parts.append("\nChi tiết:\n" + summary_obj.content[:1500])
                    doc_summary = "\n".join(parts)
                else:
                    print(f"❌ [DEBUG] KHÔNG tìm thấy bản tóm tắt nào trong DB cho Item này.")
            
            provider = (request.headers.get("x-user-ai-provider") or "openai").strip()
            model = (request.headers.get("x-user-ai-model") or "gpt-4o-mini").strip()
            api_key = (request.headers.get("x-user-ai-key") or "").strip() or None
            llm = get_chat_provider(provider=provider, model=model, api_key=api_key)
            
            history = _get_history_with_long_term_memory(chat_req.history, db, current_user.id, item_uuid)

            from app.agent.graph import agent_app
            from langchain_core.messages import HumanMessage
            
            initial_state = {
                "messages": [HumanMessage(content=message)],
                "item_id": str(item_uuid),
                "llm": llm,
                "history_tuples": history,
                "context_text": "", # Không nhồi nhét sẵn nữa
                "doc_summary": doc_summary, # Để dành ở đây
                "documents": [],
                "web_search_needed": False,
                "final_answer": ""
            }

            yield f"data: {json.dumps({'status': '🧠 Đang phân tích câu hỏi...'})}\n\n"
            
            final_state = initial_state
            # Sử dụng astream_events để bắt được token-level streaming
            async for event in agent_app.astream_events(initial_state, version="v2"):
                kind = event["event"]
                node_name = event.get("metadata", {}).get("langgraph_node")
                
                # 1. Bắt sự kiện chuyển Node để cập nhật trạng thái
                if kind == "on_chain_start" and node_name:
                    print(f"🧠 [AGENT] Node: {node_name}")
                    if node_name == "analyze_intent":
                        yield f"data: {json.dumps({'status': '🔍 Đang phân tích ý định...'})}\n\n"
                    elif node_name == "retrieve":
                        yield f"data: {json.dumps({'status': '📚 Đang truy xuất tài liệu...'})}\n\n"
                    elif node_name == "grade":
                        yield f"data: {json.dumps({'status': '⚖️ Đang đánh giá chất lượng...'})}\n\n"
                    elif node_name == "web_search":
                        yield f"data: {json.dumps({'status': '🌐 Đang tìm kiếm thêm trên Internet...'})}\n\n"
                    elif node_name == "generate":
                        yield f"data: {json.dumps({'status': '✍️ Đang soạn câu trả lời...'})}\n\n"

                # 2. Bắt từng Token - CHỈ lấy từ node 'generate' để tránh hiện rác logic
                elif kind == "on_chat_model_stream" and node_name == "generate":
                    content = event["data"]["chunk"].content
                    if content:
                        # In ra terminal để bạn kiểm tra
                        import sys
                        sys.stdout.write(content)
                        sys.stdout.flush()
                        
                        yield f"data: {json.dumps({'token': content})}\n\n"

                # 3. Cập nhật state cuối cùng
                elif kind == "on_chain_end":
                    node_name = event.get("metadata", {}).get("langgraph_node")
                    if node_name:
                        node_output = event["data"].get("output")
                        if isinstance(node_output, dict):
                            final_state = {**final_state, **node_output}
                            
                            # Thông báo thêm nếu phát hiện ý định tóm tắt
                            if node_name == "analyze_intent" and node_output.get("intent") == "summary_query":
                                yield f"data: {json.dumps({'status': '📋 Đang truy xuất bản tóm tắt bài học...'})}\n\n"

            assistant_answer = final_state.get("final_answer", "Xin lỗi, tôi gặp lỗi khi tạo câu trả lời.")
            context_chunks = final_state.get("documents", [])

            # 3) Credit deduction
            try:
                final_msg_obj = final_state.get("messages", [])[-1] if final_state.get("messages") else None
                usage = getattr(final_msg_obj, "usage_metadata", None) or {} if final_msg_obj else {}
                input_tokens = usage.get("input_tokens", 0) or 0
                output_tokens = usage.get("output_tokens", 0) or 0
                if input_tokens + output_tokens > 0:
                    from app.utils.credits import deduct_credits_for_ai
                    item_title = item.title if item else None
                    deduct_credits_for_ai(
                        user_id=str(current_user.id),
                        task_type="Chat",
                        model_name=model,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        item_title=item_title,
                    )
            except Exception as credit_err:
                print(f"[CHAT] Credit deduction skipped: {credit_err}")

            # 4) Lưu DB
            db.add(ChatMessage(
                user_id=current_user.id,
                item_id=item_uuid,
                role="user",
                content=message,
            ))
            db.add(ChatMessage(
                user_id=current_user.id,
                item_id=item_uuid,
                role="assistant",
                content=assistant_answer,
                sources=context_chunks,
            ))
            db.commit()

            # 5) Summary background task
            from app.services.memory_service import update_chat_summary_bg
            total_messages_count = len(chat_req.history) + 2
            background_tasks.add_task(update_chat_summary_bg, str(current_user.id), str(item_uuid), total_messages_count, api_key)

            # 6) Gửi kết quả cuối cùng
            yield f"data: {json.dumps({'answer': assistant_answer, 'sources': context_chunks})}\n\n"

        except Exception as e:
            print(f"❌ Chat Error in Stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/tts")
async def synthesize_chat_tts(
    tts_req: schemas.ChatTtsRequest,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    text = (tts_req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Nội dung TTS không được để trống")

    if len(text) > 2200:
        text = text[:2200].rstrip() + "..."

    _validate_item_ownership(db, current_user, tts_req.item_id)

    if not settings.AZURE_SPEECH_KEY or not settings.AZURE_SPEECH_REGION:
        raise HTTPException(
            status_code=503,
            detail="Azure TTS chưa được cấu hình. Hãy thêm AZURE_SPEECH_KEY và AZURE_SPEECH_REGION vào môi trường backend.",
        )

    endpoint = f"https://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
    ssml = _build_azure_ssml(text, tts_req.voice_selection)
    headers = {
        "Ocp-Apim-Subscription-Key": settings.AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        "User-Agent": "Nexus-Chat-TTS",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(endpoint, content=ssml.encode("utf-8"), headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối Azure TTS: {exc}") from exc

    if response.status_code >= 400:
        detail = response.text.strip() or f"Azure TTS lỗi HTTP {response.status_code}"
        raise HTTPException(status_code=502, detail=detail)

    return Response(
        content=response.content,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-TTS-Voice": _resolve_azure_tts_profile(tts_req.voice_selection).get("voice", "unknown"),
        },
    )
