import json
import re
import uuid
from difflib import SequenceMatcher
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.chat_messages import ChatMessage
from app.models.knowledge_items import KnowledgeItem
from app.models.chunks import ItemChunk
from app.models.chat_summaries import ChatSummary
from app.models.summaries import Summary
from app.ai.providers import get_chat_provider
from app.agent.graph import agent_app
from langchain_core.messages import HumanMessage
from app.core.logging import logger

class ChatService:
    @staticmethod
    def validate_item_ownership(db: Session, user_id: uuid.UUID, item_id: str | None) -> uuid.UUID | None:
        if not item_id:
            return None
        try:
            item_uuid = uuid.UUID(item_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="item_id không hợp lệ")

        item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
        if not item or str(item.user_id) != str(user_id):
            raise HTTPException(status_code=403, detail="Không có quyền truy cập item này")
        return item_uuid

    @staticmethod
    def normalize_text(text: str) -> str:
        text = (text or "").lower().strip()
        text = re.sub(r"\s+", " ", text)
        return text

    @staticmethod
    def canonicalize_question(text: str) -> str:
        normalized = ChatService.normalize_text(text)
        normalized = re.sub(r"[^\wÀ-ỹ\s]", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if not normalized:
            return ""

        filler_phrases = [
            "ban co the", "bạn có thể", "co the", "có thể", "cho toi", "cho mình",
            "cho minh", "giup toi", "giúp tôi", "giup minh", "giúp mình", "duoc khong",
            "được không", "duoc ko", "được ko", "khong", "không", "nhe", "nhé",
        ]
        for phrase in filler_phrases:
            normalized = normalized.replace(phrase, " ")
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    @staticmethod
    def tokenize_keywords(text: str) -> list[str]:
        stopwords = {
            "la", "là", "va", "và", "cua", "của", "cho", "toi", "tôi", "ban", "bạn",
            "minh", "mình", "nay", "này", "kia", "the", "thế", "nao", "nào", "sao",
            "duoc", "được", "khong", "không", "voi", "với", "gi", "gì", "nhu", "như",
            "mot", "một", "cac", "các", "ve", "về", "trong", "tai", "tại", "cau", "câu",
            "hoi", "hỏi", "and", "the", "is", "are", "what", "how", "why", "when",
        }
        words = re.findall(r"[a-zA-ZÀ-ỹ0-9_]+", ChatService.normalize_text(text))
        return [w for w in words if len(w) >= 3 and w not in stopwords]

    @staticmethod
    def keyword_overlap_ratio(a: set[str], b: set[str]) -> float:
        if not a or not b:
            return 0.0
        common = len(a & b)
        return common / max(min(len(a), len(b)), 1)

    @staticmethod
    def detect_question_intent(text: str) -> str:
        canonical = ChatService.canonicalize_question(text)
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

    @staticmethod
    def extract_intent_markers(text: str, intent: str) -> set[str]:
        canonical = ChatService.canonicalize_question(text)
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

    @staticmethod
    def is_conversational_message(text: str) -> bool:
        normalized = ChatService.normalize_text(text)
        if not normalized:
            return False
        
        if normalized.endswith("?") or "?" in normalized:
            social_questions = {"khỏe không", "khoe khong", "sao roi", "sao rồi", "on khong", "ổn không"}
            if not any(q in normalized for q in social_questions):
                return False

        cleaned = re.sub(r"[^\wÀ-ỹ\s]", " ", normalized)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if not cleaned:
            return False

        greetings = {
            "hi", "hello", "hey", "xin chào", "xin chao", "chào", "chao",
            "chào bạn", "chao ban", "helo", "alo", "Ura ơi", "Ura oi"
        }
        if cleaned in greetings or any(g in cleaned for g in ["xin chào", "chào bạn"]):
            return True

        exclamations = {
            "tuyệt", "tuyệt vời", "tuyet voi", "hay quá", "hay qua", "thú vị", "thu vi",
            "giỏi quá", "gioi qua", "wow", "ồ", "ooh", "ghê vậy", "ghe vay"
        }
        if cleaned in exclamations or any(e in cleaned for e in ["hay quá", "tuyệt vời"]):
            return True

        narratives = {
            "được rồi", "duoc roi", "hiểu rồi", "hieu roi", "mình hiểu rồi", "minh hieu roi",
            "ok", "okay", "vâng", "vang", "dạ", "da", "cảm ơn", "cam on", "thanks",
            "mình biết rồi", "minh biet roi", "vậy sao", "vay sao", "thế à", "the a",
            "khó quá", "kho qua", "hơi khó", "hoi kho", "rắc rối quá", "rac roi qua",
            "mình đang nghe", "minh dang nghe", "tiếp đi", "tiep di", "nói tiếp đi", "noi tiep di"
        }
        if cleaned in narratives or any(n in cleaned for n in ["hiểu rồi", "được rồi", "khó quá"]):
            return True

        intro_markers = ["mình thấy", "minh thay", "tôi thấy", "toi thay", "Ura ơi", "Ura oi", "cho mình hỏi chút"]
        if any(cleaned.startswith(m) for m in intro_markers):
            return True

        return False

    @staticmethod
    def friendly_conversational_reply(text: str = "") -> str:
        normalized = ChatService.normalize_text(text)
        
        if any(word in normalized for word in ["cảm ơn", "cam on", "thanks"]):
            return "Không có gì nè! Ura luôn sẵn sàng đồng hành cùng bạn. Bạn cần hỗ trợ gì thêm không?"
        if any(word in normalized for word in ["tuyệt vời", "hay quá", "thú vị", "giỏi"]):
            return "Ura rất vui khi bạn thấy thú vị! Hy vọng những kiến thức này sẽ giúp ích nhiều cho bạn."
        if any(word in normalized for word in ["khó quá", "hơi khó", "rắc rối", "chưa hiểu"]):
            return "Đừng lo lắng nhé! Kiến thức này lúc đầu có thể hơi lạ lẫm. Bạn muốn Ura giải thích lại phần nào một cách đơn giản hơn không?"
        if any(word in normalized for word in ["được rồi", "hiểu rồi", "biết rồi", "ok"]):
            return "Tuyệt vời! Khi bạn đã nắm vững phần này, chúng ta có thể chuyển sang nội dung tiếp theo hoặc làm một bài quiz nhỏ nhé?"
        if any(word in normalized for word in ["chào", "hello", "hi", "Ura"]):
            return "Ura đây! Rất vui được trò chuyện cùng bạn. Bạn muốn tóm tắt bài học, giải thích khái niệm hay thử sức với quiz nào?"

        return "Ura vẫn đang lắng nghe bạn đây. Bạn có muốn mình hỗ trợ sâu hơn về nội dung bài học này không?"

    @staticmethod
    def get_history_with_long_term_memory(history: list[dict] | None, db: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> list[tuple[str, str]]:
        if not history:
            return []
            
        recent = history[-4:]
        compacted: list[tuple[str, str]] = []
        
        summary_record = db.query(ChatSummary).filter(
            ChatSummary.user_id == user_id,
            ChatSummary.item_id == item_id
        ).first()
        
        if summary_record and summary_record.summary:
            compacted.append(("ai", f"[Long-term Memory]: {summary_record.summary}"))
                
        for msg in recent:
            role = "human" if msg.get("role") == "user" else "ai"
            content = (msg.get("content") or "").strip()
            if len(content) > 1000:
                content = content[:1000] + "..."
            compacted.append((role, content))
            
        return compacted

    @staticmethod
    def find_reusable_answer(db: Session, user_id: uuid.UUID, item_id: uuid.UUID | None, question: str, similarity_threshold: float = 0.92) -> str | None:
        question_lower = question.lower()
        is_about_content = any(word in question_lower for word in [
            "bài học", "nội dung", "tài liệu", "chủ đề", "đề tài", 
            "nội dung chính", "tóm tắt", "tóm lược"
        ])
        
        query = db.query(ChatMessage).filter(ChatMessage.user_id == user_id)
        if item_id:
            query = query.filter(ChatMessage.item_id == item_id)
        
        recent_messages = query.order_by(ChatMessage.created_at.desc()).limit(200).all()
        messages = list(reversed(recent_messages))

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

        q_norm = ChatService.normalize_text(question)
        q_canonical = ChatService.canonicalize_question(question)
        q_keywords = set(ChatService.tokenize_keywords(question))
        q_intent = ChatService.detect_question_intent(question)
        q_intent_markers = ChatService.extract_intent_markers(question, q_intent)
        best_score = 0.0
        best_answer: str | None = None

        for old_q, old_a in reversed(qa_pairs[-50:]):
            old_q_norm = ChatService.normalize_text(old_q)
            old_q_canonical = ChatService.canonicalize_question(old_q)
            old_q_keywords = set(ChatService.tokenize_keywords(old_q))
            old_intent = ChatService.detect_question_intent(old_q)
            old_intent_markers = ChatService.extract_intent_markers(old_q, old_intent)

            if q_intent != old_intent:
                continue

            if q_norm == old_q_norm or (q_canonical and old_q_canonical and q_canonical == old_q_canonical):
                if is_about_content:
                    old_a_lower = old_a.lower()
                    skip_phrases = ["không biết", "không hiểu", "không thể trả lời", "không rõ", "xin lỗi", "không có thông tin", "ngoài phạm vi", "không liên quan"]
                    if any(phrase in old_a_lower for phrase in skip_phrases):
                        continue
                return old_a

            if q_intent != "other" and q_intent_markers and old_intent_markers:
                if not (q_intent_markers & old_intent_markers):
                    continue

            common_keywords = len(q_keywords & old_q_keywords)
            min_keywords = min(len(q_keywords), len(old_q_keywords))

            if min_keywords <= 2:
                seq_score_short = SequenceMatcher(None, q_canonical or q_norm, old_q_canonical or old_q_norm).ratio()
                if seq_score_short >= 0.97:
                    if is_about_content:
                        old_a_lower = old_a.lower()
                        skip_phrases = ["không biết", "không hiểu", "không thể trả lời", "không rõ", "xin lỗi", "không có thông tin", "ngoài phạm vi", "không liên quan"]
                        if any(phrase in old_a_lower for phrase in skip_phrases):
                            continue
                    return old_a
                continue

            if min_keywords >= 3:
                overlap_ratio = ChatService.keyword_overlap_ratio(q_keywords, old_q_keywords)
                if common_keywords >= 4 and overlap_ratio >= 0.92:
                    if is_about_content:
                        old_a_lower = old_a.lower()
                        skip_phrases = ["không biết", "không hiểu", "không thể trả lời", "không rõ", "xin lỗi", "không có thông tin", "ngoài phạm vi", "không liên quan"]
                        if any(phrase in old_a_lower for phrase in skip_phrases):
                            continue
                    return old_a

            seq_score = SequenceMatcher(None, q_canonical or q_norm, old_q_canonical or old_q_norm).ratio()
            union_size = len(q_keywords | old_q_keywords)
            jaccard_score = (common_keywords / union_size) if union_size else 0.0
            score = (0.7 * seq_score) + (0.3 * jaccard_score)
            if score > best_score:
                best_score = score
                best_answer = old_a

        required_threshold = similarity_threshold + 0.05 if q_intent == "other" else similarity_threshold
        if best_score >= required_threshold and best_answer:
            if is_about_content:
                old_a_lower = best_answer.lower()
                skip_phrases = ["không biết", "không hiểu", "không thể trả lời", "không rõ", "xin lỗi", "không có thông tin", "ngoài phạm vi", "không liên quan"]
                if any(phrase in old_a_lower for phrase in skip_phrases):
                    return None
            return best_answer
        return None

    @staticmethod
    async def stream_chat_response(message: str, item_uuid: uuid.UUID, db: Session, current_user_id: uuid.UUID, history_req: list[dict], provider: str, model: str, api_key: str | None, background_tasks):
        from app.utils.credits import deduct_credits_for_ai
        from app.services.memory_service import update_chat_summary_bg

        # 1) Conversational reply
        if ChatService.is_conversational_message(message):
            greeting_answer = ChatService.friendly_conversational_reply(message)
            db.add(ChatMessage(user_id=current_user_id, item_id=item_uuid, role="user", content=message))
            db.add(ChatMessage(user_id=current_user_id, item_id=item_uuid, role="assistant", content=greeting_answer))
            db.commit()
            yield f"data: {json.dumps({'answer': greeting_answer, 'sources': []})}\n\n"
            return

        # 2) Agent Setup
        item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
        doc_summary = ""
        if item:
            logger.info(f"Đang tìm bản tóm tắt mới nhất cho Item ID: {item_uuid}")
            summary_obj = db.query(Summary).filter(Summary.item_id == item_uuid).order_by(Summary.created_at.desc()).first()
            if summary_obj:
                parts = []
                if summary_obj.tldr and len(summary_obj.tldr) > 0:
                    parts.append("Tóm tắt nhanh:\n" + "\n".join([f"- {p}" for p in summary_obj.tldr[:5]]))
                if summary_obj.content:
                    parts.append("\nChi tiết:\n" + summary_obj.content[:1500])
                doc_summary = "\n".join(parts)
            else:
                logger.warning("KHÔNG tìm thấy bản tóm tắt nào trong DB cho Item này.")
        
        llm = get_chat_provider(provider=provider, model=model, api_key=api_key)
        history = ChatService.get_history_with_long_term_memory(history_req, db, current_user_id, item_uuid)

        initial_state = {
            "messages": [HumanMessage(content=message)],
            "item_id": str(item_uuid),
            "llm": llm,
            "history_tuples": history,
            "context_text": "",
            "doc_summary": doc_summary,
            "documents": [],
            "web_search_needed": False,
            "final_answer": ""
        }

        yield f"data: {json.dumps({'status': '🧠 Đang phân tích câu hỏi...'})}\n\n"
        
        final_state = initial_state
        async for event in agent_app.astream_events(initial_state, version="v2"):
            kind = event["event"]
            node_name = event.get("metadata", {}).get("langgraph_node")
            
            if kind == "on_chain_start" and node_name:
                logger.info(f"Agent Node: {node_name}")
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

            elif kind == "on_chat_model_stream" and node_name == "generate":
                content = event["data"]["chunk"].content
                if content:
                    yield f"data: {json.dumps({'token': content})}\n\n"

            elif kind == "on_chain_end":
                if node_name:
                    node_output = event["data"].get("output")
                    if isinstance(node_output, dict):
                        final_state = {**final_state, **node_output}
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
                item_title = item.title if item else None
                deduct_credits_for_ai(
                    user_id=str(current_user_id),
                    task_type="Chat",
                    model_name=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    item_title=item_title,
                )
        except Exception as credit_err:
            logger.error(f"Credit deduction skipped: {credit_err}")

        # 4) Save DB
        db.add(ChatMessage(user_id=current_user_id, item_id=item_uuid, role="user", content=message))
        db.add(ChatMessage(user_id=current_user_id, item_id=item_uuid, role="assistant", content=assistant_answer, sources=context_chunks))
        db.commit()

        # 5) Summary background task
        total_messages_count = len(history_req) + 2
        background_tasks.add_task(update_chat_summary_bg, str(current_user_id), str(item_uuid), total_messages_count, api_key)

        # 6) Send final result
        yield f"data: {json.dumps({'answer': assistant_answer, 'sources': context_chunks})}\n\n"

chat_service = ChatService()
