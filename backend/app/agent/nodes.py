import os
import json
import warnings
# Ẩn các cảnh báo Pydantic v2 dư thừa (xảy ra khi LangChain/LangGraph serialize state)
warnings.filterwarnings("ignore", message="PydanticSerializationUnexpectedValue")
from app.agent.state import AgentState
from app.services.vector_search_service import search_service
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from app.ai.prompts import PROMPT_CHAT_RAG, PROMPT_CHAT_SUMMARY
from langchain_core.runnables import RunnableConfig

# Ẩn các cảnh báo Pydantic v2 không cần thiết khi dùng structured_output
warnings.filterwarnings("ignore", message="PydanticSerializationUnexpectedValue")

class GradeResult(BaseModel):
    """Cấu trúc dữ liệu cho kết quả đánh giá tài liệu."""
    is_relevant: str = Field(description="Nhập 'yes' nếu tài liệu chứa ĐẦY ĐỦ và CHI TIẾT thông tin để trả lời. Nhập 'no' nếu tài liệu thiếu ý, quá cũ hoặc chỉ nói chung chung.")
    is_on_topic: str = Field(description="LUÔN nhập 'yes' cho mọi câu hỏi về kiến thức, học tập, AI hoặc tóm tắt. CHỈ nhập 'no' khi người dùng hỏi về: bóng đá, showbiz, chính trị, hoặc tin tức lá cải.")

async def retrieve_node(state: AgentState) -> dict:
    """
    Node 1: Tìm kiếm ngữ nghĩa & từ khóa (Milvus Hybrid Search)
    """
    print("🧠 [AGENT] Node: RETRIEVE - Đang truy xuất thông tin từ tài liệu...")
    
    # Lấy câu hỏi cuối cùng của người dùng
    latest_message = state["messages"][-1].content
    item_id = state.get("item_id")
    
    docs = await search_service.search_chunks(
        query=latest_message,
        top_k=4,
        item_id=item_id
    )
    
    return {"documents": docs}

async def analyze_intent_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node đầu tiên: Phân loại ý định của người dùng.
    """
    question = state["messages"][-1].content
    llm = state.get("llm")
    
    from langchain_core.prompts import PromptTemplate
    prompt = PromptTemplate(
        template="""Phân loại câu hỏi thành 1 từ duy nhất: 
- 'casual_chat': Giao tiếp, chào hỏi, cá nhân.
- 'summary_query': Hỏi về chủ đề chính, tóm tắt, bài học nói về cái gì, nội dung tổng quát.
- 'rag_search': Tra cứu kiến thức chi tiết, thông tin cụ thể trong tài liệu.

Câu hỏi: {question}
Phân loại:""",
        input_variables=["question"]
    )
    
    print("🧠 [AGENT] Node: ANALYZE INTENT...")
    chain = prompt | llm
    result = await chain.ainvoke({"question": question}, config=config)
    intent = result.content.strip().lower()
    
    if "casual" in intent:
        intent = "casual_chat"
    elif "summary" in intent:
        intent = "summary_query"
    else:
        intent = "rag_search"
        
    print(f"🧠 [AGENT] 👉 Intent: {intent.upper()}")
    return {"intent": intent}

async def grade_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node 2: Giám khảo AI (LLM-as-a-judge). 
    Đọc tài liệu tìm được và đánh giá xem có đủ trả lời câu hỏi không.
    """
    print("🧠 [AGENT] Node: GRADE - Đang đánh giá chất lượng tài liệu...")
    
    docs = state.get("documents", [])
    question = state["messages"][-1].content
    llm = state.get("llm")
    
    if not docs or not llm:
        print("🧠 [AGENT] ⚠ Không có tài liệu hoặc LLM. Chuyển hướng Web Search.")
        return {"web_search_needed": True}
    
    grader_llm = llm.with_structured_output(GradeResult)
    
    grade_prompt = f"""Bạn là một giám khảo AI.
    Nhiệm vụ 1: Kiểm tra xem câu hỏi có thuộc chủ đề CẤM (showbiz, chính trị, thể thao) không? Nếu là câu hỏi học tập, BẮT BUỘC chọn is_on_topic='yes'.
    Nhiệm vụ 2: Đánh giá xem tài liệu có ĐỦ thông tin để trả lời câu hỏi này một cách sâu sắc không? 
    - Nếu câu hỏi hỏi về "thực tế/hiện nay" mà tài liệu chỉ có lý thuyết cũ -> is_relevant='no'.
    - Nếu tài liệu chỉ nhắc tên mà không giải thích -> is_relevant='no'.
    
    Tài liệu: \n{docs}\n
    Câu hỏi: {question}
    """
    
    try:
        result = await grader_llm.ainvoke([HumanMessage(content=grade_prompt)], config=config)
        
        if result.is_on_topic.lower() == "no":
            print("🧠 [AGENT] 🛑 Câu hỏi VI PHẠM CHỦ ĐỀ CẤM. Đóng băng!")
            return {"web_search_needed": False, "is_off_topic": True}
            
        if result.is_relevant.lower() == "yes":
            print("🧠 [AGENT] ✅ Tài liệu ĐỦ THÔNG TIN. Chuyển sang Generate.")
            return {"web_search_needed": False, "is_off_topic": False}
        else:
            print("🧠 [AGENT] ⚠ Tài liệu THIẾU THÔNG TIN. Kích hoạt Web Search!")
            return {"web_search_needed": True, "is_off_topic": False}
    except Exception as e:
        print(f"🧠 [AGENT] Lỗi chấm điểm ({e}), mặc định cho đi tiếp.")
        return {"web_search_needed": False, "is_off_topic": False}
        
async def web_search_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node 2.5: Tìm kiếm bổ sung trên Internet (Web Research)
    Kích hoạt khi Giám khảo đánh rớt tài liệu nội bộ.
    """
    print("🧠 [AGENT] Node: WEB SEARCH - Đang tìm kiếm thông tin thực tế trên Internet...")
    question = state["messages"][-1].content
    llm = state.get("llm")
    
    # Kỹ thuật Query Transformation
    history_tuples = state.get("history_tuples", [])
    history = []
    for role, content in history_tuples[-4:]:
        history.append(f"{role}: {content}")
    history_text = "\n".join(history) if history else "Không có ngữ cảnh trước đó."

    from langchain_core.prompts import PromptTemplate
    query_prompt = PromptTemplate(
        template="""Bạn là một chuyên gia AI Search. Hãy chuyển đổi câu hỏi người dùng thành MỘT từ khóa tìm kiếm (search query) chuyên sâu.
Luật:
1. Nếu câu hỏi về kỹ thuật/công nghệ, hãy thêm các thuật ngữ chuyên môn (ví dụ: "AI implementation", "use cases").
2. Ưu tiên sử dụng tiếng Anh cho các từ khóa chuyên môn để có kết quả chính xác nhất.
3. CHỈ trả về duy nhất chuỗi từ khóa.

Lịch sử trò chuyện gần nhất:
{history_text}

Câu hỏi hiện tại: {question}
Từ khóa tìm kiếm:""",
        input_variables=["history_text", "question"]
    )
    
    try:
        query_chain = query_prompt | llm
        search_query_result = await query_chain.ainvoke({"history_text": history_text, "question": question}, config=config)
        raw_query = search_query_result.content.strip().replace('"', '')
        search_query = f"{raw_query} -bet -casino -\"nhà cái\""
        print(f"🧠 [AGENT] 👉 Search Query: '{search_query}'")
    except Exception:
        search_query = f"{question} -bet -casino"

    tavily_api_key = os.getenv("TAVILY_API_KEY")
    web_docs = []

    # --- 1. TAVILY SEARCH (PRIMARY) ---
    if tavily_api_key:
        try:
            from tavily import TavilyClient
            tavily = TavilyClient(api_key=tavily_api_key)
            response = tavily.search(query=search_query, search_depth="advanced", max_results=5)
            
            print(f"[TAVILY-WEB] 🚀 Tìm thấy {len(response['results'])} kết quả chất lượng.")
            for i, r in enumerate(response['results'], 1):
                title = r.get('title', 'No Title')
                url = r.get('url', 'No URL')
                content = r.get('content', '')
                print(f"[TAVILY-WEB]   [{i}] {title}")
                web_docs.append(f"🌐 NGUỒN INTERNET: {title}\nURL: {url}\nNội dung: {content}")
            
            if web_docs:
                existing_docs = state.get("documents", [])
                return {"documents": existing_docs + web_docs}
        except Exception as e:
            print(f"🧠 [AGENT] ⚠ Tavily lỗi: {e}. Fallback về DuckDuckGo...")

    # --- 2. DUCKDUCKGO SEARCH (FALLBACK) ---
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            raw_results = list(ddgs.text(search_query, max_results=10))
            blacklist = ["bet", "casino", "nhà cái", "soi cầu", "kèo", "đổi thưởng", "nổ hũ", "đánh bài"]
            results = []
            for r in raw_results:
                title_lower = r.get('title', '').lower()
                body_lower = r.get('body', '').lower()
                if any(word in title_lower or word in body_lower for word in blacklist): continue
                results.append(r)
                if len(results) >= 5: break
            
        print(f"[DDGS-FALLBACK] 🌐 Kéo {len(results)} kết quả từ Internet.")
        for i, r in enumerate(results, 1):
            body = r.get('body', '')
            web_docs.append(f"🌐 NGUỒN INTERNET (Dự phòng): {title}\nURL: {href}\nNội dung: {body}")
            
        existing_docs = state.get("documents", [])
        return {"documents": existing_docs + web_docs}
    except Exception as e:
        print(f"🧠 [AGENT] ⚠ Lỗi Web Search: {e}")
        return {}

async def generate_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Node 3: Sinh câu trả lời cuối cùng dựa trên context và lịch sử hội thoại.
    """
    print("🧠 [AGENT] Node: GENERATE - Đang soạn câu trả lời...")
    
    if state.get("is_off_topic"):
        print("🧠 [AGENT] 🛑 Từ chối trả lời do câu hỏi lạc đề.")
        from langchain_core.messages import AIMessage
        off_topic_msg = "Xin lỗi, tôi là trợ lý AI chuyên môn. Câu hỏi của bạn nằm ngoài phạm vi của tài liệu và chủ đề hiện tại nên tôi không thể hỗ trợ."
        msg_obj = AIMessage(content=off_topic_msg)
        return {"messages": [msg_obj], "final_answer": off_topic_msg}
        
    llm = state.get("llm")
    context_text = state.get("context_text", "")
    question = state["messages"][-1].content
    history = state.get("history_tuples", [])
    docs = state.get("documents", []) # Khởi tạo docs ở đây để dùng chung
    
    # Lắp rắp ngữ cảnh
    intent = state.get("intent", "rag_search")
    
    if intent == "summary_query":
        # Ưu tiên lấy Summary từ Database nếu người dùng hỏi tổng quát
        doc_summary = state.get("doc_summary", "")
        if doc_summary:
            context_text = doc_summary # Dùng text thuần cho PROMPT_CHAT_SUMMARY
        else:
            # Fallback về RAG chunks nếu chưa có summary
            context_parts = [f"[{i}] {d}" for i, d in enumerate(docs, 1)]
            context_text = "\n".join(context_parts)
    else:
        # Câu hỏi chi tiết -> Dùng RAG chunks
        context_parts = [f"[{i}] {d}" for i, d in enumerate(docs, 1)]
        context_text = "\n".join(context_parts)
    
    if intent == "casual_chat":
        from langchain_core.prompts import ChatPromptTemplate
        chat_prompt = ChatPromptTemplate.from_messages([
            ("system", "Bạn là một trợ lý AI thân thiện và thông minh. Hãy trả lời câu hỏi giao tiếp hoặc câu hỏi cá nhân một cách tự nhiên dựa trên thông tin có sẵn trong lịch sử trò chuyện. Trình bày bằng tiếng Việt và dùng Markdown nếu cần."),
            ("placeholder", "{history}"),
            ("user", "{question}")
        ])
        chain = chat_prompt | llm
        
        # Sử dụng astream thay vì ainvoke để kích hoạt token streaming events
        full_content = ""
        async for chunk in chain.astream({
            "question": question,
            "history": history,
        }, config=config):
            full_content += chunk.content
        
        from langchain_core.messages import AIMessage
        response = AIMessage(content=full_content)
    else:
        # Lựa chọn Prompt dựa trên Intent
        target_prompt = PROMPT_CHAT_SUMMARY if intent == "summary_query" else PROMPT_CHAT_RAG
        chain = target_prompt | llm
        
        # Sử dụng astream để astream_events ở ngoài có thể bắt được từng token
        print(f"📝 [DEBUG] Context gửi lên LLM (dài {len(context_text)} ký tự):")
        print(context_text[:500] + "...") # In 500 ký tự đầu để kiểm tra định dạng
        
        full_content = ""
        async for chunk in chain.astream({
            "context": context_text,
            "question": question,
            "history": history,
        }, config=config):
            full_content += chunk.content
            
        from langchain_core.messages import AIMessage
        response = AIMessage(content=full_content)
    
    # --- BỘ ĐÁNH CHỈ SỐ ĐỘNG (DYNAMIC RE-INDEXER) ---
    final_text = response.content
    final_used_docs = []
    
    if docs and intent != "casual_chat":
        import re
        # 1. Tìm tất cả các loại trích dẫn trong văn bản ([1], [P21], v.v.)
        # Regex này tìm mọi thứ trong ngoặc vuông []
        found_markers = re.findall(r'\[([^\]]+)\]', final_text)
        
        marker_to_doc_map = {} # marker -> document object
        cited_docs_ordered = []
        seen_doc_ids = set()
        
        # Tạo bản đồ từ marker sang tài liệu thực tế
        for i, doc in enumerate(docs, 1):
            # Lưu marker số thứ tự [i]
            marker_to_doc_map[f"{i}"] = doc
            # Lưu các marker số trang [PX]
            page_markers = re.findall(r'\[P(\d+)\]', doc)
            for p_num in page_markers:
                marker_to_doc_map[f"P{p_num}"] = doc

        # 2. Xây dựng danh sách tài liệu được trích dẫn theo thứ tự xuất hiện
        # và tạo bảng ánh xạ mới (Old Marker -> New Index)
        reindex_map = {}
        new_idx = 1
        
        for marker in found_markers:
            # Nếu marker này trỏ tới một tài liệu hợp lệ
            if marker in marker_to_doc_map:
                target_doc = marker_to_doc_map[marker]
                doc_id = id(target_doc) # Dùng id để phân biệt các object tài liệu
                
                if doc_id not in seen_doc_ids:
                    seen_doc_ids.add(doc_id)
                    cited_docs_ordered.append(target_doc)
                    reindex_map[marker] = f"{new_idx}"
                    new_idx += 1
                else:
                    # Tìm xem tài liệu này đã được gán số mấy trước đó
                    # Duyệt qua các docs đã lưu để tìm index
                    for idx, d in enumerate(cited_docs_ordered, 1):
                        if id(d) == doc_id:
                            reindex_map[marker] = f"{idx}"
                            break

        # 3. Thay thế các trích dẫn trong văn bản bằng số thứ tự mới [1], [2]...
        def replace_citation(match):
            m = match.group(1)
            if m in reindex_map:
                return f"[{reindex_map[m]}]"
            return match.group(0) # Giữ nguyên nếu không phải trích dẫn tài liệu

        final_text = re.sub(r'\[([^\]]+)\]', replace_citation, final_text)
        final_used_docs = cited_docs_ordered
        
        if final_used_docs:
            print(f"🧠 [AGENT] 👉 Re-indexed: Đã chuẩn hóa {len(final_used_docs)} nguồn về dạng [1], [2]...")

    return {"messages": [response], "final_answer": final_text, "documents": final_used_docs}
