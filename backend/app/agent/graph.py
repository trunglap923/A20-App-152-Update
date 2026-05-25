from langgraph.graph import END, StateGraph, START
from app.agent.state import AgentState
from app.agent.nodes import analyze_intent_node, retrieve_node, grade_node, generate_node, web_search_node

def route_after_grading(state: AgentState):
    """
    Router (Bộ định tuyến): Đưa ra quyết định dựa trên kết quả của GraderNode.
    """
    if state.get("is_off_topic"):
        print("🔀 [ROUTER] Rẽ nhánh: Lạc đề -> Bỏ qua Web Search, đi thẳng tới Generate (từ chối).")
        return "generate"
        
    if state.get("web_search_needed"):
        print("🔀 [ROUTER] Rẽ nhánh: Thiếu thông tin nội bộ -> Kích hoạt Web Search -> Generate")
        return "web_search" 
    else:
        print("🔀 [ROUTER] Rẽ nhánh: Đủ thông tin -> Trực tiếp Generate")
        return "generate"
        
def route_after_intent(state: AgentState):
    """
    Router phân loại ý định ban đầu để tiết kiệm API và bỏ qua RAG không cần thiết.
    """
    intent = state.get("intent")
    
    # Nếu hỏi tóm tắt nhưng DB chưa có bản tóm tắt sẵn -> Phải đi qua Retrieve để tìm dữ liệu
    if intent == "summary_query":
        if state.get("doc_summary"):
            print("🔀 [ROUTER] Rẽ nhánh: SUMMARY_QUERY (Đã có sẵn bản tóm tắt) -> Đi thẳng tới Generate")
            return "generate"
        else:
            print("🔀 [ROUTER] Rẽ nhánh: SUMMARY_QUERY (Chưa có bản tóm tắt) -> Fallback tới Retrieve")
            return "retrieve"
            
    if intent == "casual_chat":
        print("🔀 [ROUTER] Rẽ nhánh: CASUAL_CHAT -> Đi thẳng tới Generate")
        return "generate"
    else:
        print("🔀 [ROUTER] Rẽ nhánh: RAG Search -> Kích hoạt Retrieve")
        return "retrieve"

# 1. Khởi tạo bản đồ StateGraph với bộ nhớ AgentState
workflow = StateGraph(AgentState)

# 2. Đăng ký các Vùng não (Nodes)
workflow.add_node("analyze_intent", analyze_intent_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("grade", grade_node)
workflow.add_node("web_search", web_search_node)
workflow.add_node("generate", generate_node)

# 3. Định nghĩa các Luồng suy nghĩ cơ bản (Edges)
workflow.add_edge(START, "analyze_intent") # Bắt đầu -> Phân loại ý định

workflow.add_conditional_edges(
    "analyze_intent",
    route_after_intent,
    {
        "retrieve": "retrieve",
        "generate": "generate"
    }
)

workflow.add_edge("retrieve", "grade") # Tìm xong -> Đem đi chấm điểm

# 4. Gắn Router (Quyết định rẽ nhánh có điều kiện)
workflow.add_conditional_edges(
    "grade",
    route_after_grading,
    {
        "generate": "generate",
        "web_search": "web_search"
    }
)

# 5. Các nhánh tụ lại và kết thúc
workflow.add_edge("web_search", "generate")
workflow.add_edge("generate", END)

# Đóng gói và Biên dịch (Compile)
agent_app = workflow.compile()
