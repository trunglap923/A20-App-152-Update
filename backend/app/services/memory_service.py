import uuid
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.chat_summaries import ChatSummary
from app.models.chat_messages import ChatMessage
from app.ai.providers import get_chat_provider
from langchain_core.messages import HumanMessage

async def update_chat_summary_bg(user_id: str, item_id: str, current_messages_count: int, api_key: str | None = None):
    """
    Background Task: Tóm tắt tịnh tiến lịch sử chat.
    Đọc các tin nhắn mới (chưa tóm tắt) và gộp vào tóm tắt cũ.
    """
    db: Session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user_id)
        item_uuid = uuid.UUID(item_id)
        
        # 1. Lấy hoặc tạo bản ghi ChatSummary
        summary_record = db.query(ChatSummary).filter(
            ChatSummary.user_id == user_uuid,
            ChatSummary.item_id == item_uuid
        ).first()
        
        if not summary_record:
            summary_record = ChatSummary(
                user_id=user_uuid,
                item_id=item_uuid,
                summary="",
                last_message_count=0
            )
            db.add(summary_record)
            db.commit()
            db.refresh(summary_record)
            
        # Nếu chưa có đủ 6 tin nhắn mới so với lần tóm tắt trước thì bỏ qua (Tiết kiệm Token)
        # Giữ lại 4 tin nhắn mới nhất làm Short-term memory, nên chỉ tóm tắt các tin ngoài 4 tin này
        messages_to_summarize = current_messages_count - 4
        
        if messages_to_summarize <= summary_record.last_message_count:
            return # Không có gì mới cần tóm tắt
            
        # 2. Lấy các tin nhắn mới cần tóm tắt
        # Bỏ qua `last_message_count` tin đầu tiên, lấy đến `messages_to_summarize`
        messages = db.query(ChatMessage).filter(
            ChatMessage.user_id == user_uuid,
            ChatMessage.item_id == item_uuid
        ).order_by(ChatMessage.created_at.asc()).all()
        
        new_messages_to_process = messages[summary_record.last_message_count:messages_to_summarize]
        
        if not new_messages_to_process:
            return
            
        # 3. Chuẩn bị prompt
        history_text = "\n".join([f"{'User' if m.role == 'user' else 'AI'}: {m.content}" for m in new_messages_to_process])
        
        prompt = "Bạn là AI quản lý bộ nhớ dài hạn.\n"
        if summary_record.summary:
            prompt += f"Dưới đây là Bản tóm tắt cũ của cuộc trò chuyện:\n<old_summary>\n{summary_record.summary}\n</old_summary>\n\n"
            prompt += f"Và đây là các tin nhắn tiếp theo mới diễn ra:\n<new_messages>\n{history_text[:4000]}\n</new_messages>\n\n"
            prompt += "Nhiệm vụ: Trộn các thông tin cốt lõi của <new_messages> vào <old_summary>. Viết lại một Bản tóm tắt NGẮN GỌN (dưới 150 chữ) bao gồm cả các ý chính cũ và mới. Tuyệt đối không xưng hô, chỉ viết nội dung tóm tắt khách quan."
        else:
            prompt += f"Hãy tóm tắt ngắn gọn (dưới 150 chữ) ngữ cảnh và các ý chính của đoạn hội thoại sau:\n<messages>\n{history_text[:4000]}\n</messages>\nTuyệt đối không xưng hô, chỉ viết nội dung tóm tắt khách quan."

        # Dùng GPT-4o-mini để tiết kiệm tiền cho tác vụ chạy ngầm
        llm = get_chat_provider(provider="openai", model="gpt-4o-mini", api_key=api_key)
        
        # 4. Gọi AI
        result = await llm.ainvoke([HumanMessage(content=prompt)])
        
        # 5. Lưu vào DB
        summary_record.summary = result.content
        summary_record.last_message_count = messages_to_summarize
        db.commit()
        
        print(f"🔄 [MEMORY WORKER] Đã cập nhật Long-term Memory cho tài liệu {item_id}. (Tổng số tin nhắn đã nén: {messages_to_summarize})")
        
    except Exception as e:
        print(f"❌ [MEMORY WORKER] Lỗi: {e}")
        db.rollback()
    finally:
        db.close()
