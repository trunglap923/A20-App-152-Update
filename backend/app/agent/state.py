import operator
from typing import Annotated, Sequence, TypedDict, Any
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    """
    Đại diện cho "Bộ nhớ ngắn hạn" của Agent trong một chu kỳ xử lý.
    Dữ liệu này sẽ được truyền qua lại và cập nhật giữa các Node.
    """
    # Lịch sử hội thoại (Sử dụng toán tử add để append tin nhắn mới vào danh sách)
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # ID của tài liệu đang được phân tích
    item_id: str
    
    # Danh sách các đoạn văn bản (chunks) được trích xuất
    documents: list[str]
    
    # Trạng thái suy luận: Quyết định có cần tìm kiếm internet không
    web_search_needed: bool
    
    # Cờ chặn các câu hỏi tào lao (như bóng đá, thời tiết)
    is_off_topic: bool
    
    # Phân loại ý định của người dùng (casual_chat, rag_search)
    intent: str
    
    # Đối tượng LLM để các node dùng chung
    llm: Any
    
    # Lịch sử hội thoại (đã được rút gọn)
    history_tuples: list[tuple[str, str]]
    
    # Ngữ cảnh gốc (Summary) được nạp sẵn
    context_text: str
    
    # Bản tóm tắt toàn bộ tài liệu (lấy từ DB)
    doc_summary: str
    
    # Câu trả lời cuối cùng để API trả về
    final_answer: str
