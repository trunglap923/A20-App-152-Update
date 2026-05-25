# Tài liệu Kiến trúc & Luồng xử lý Hệ thống AI-Powered LMS (InsightAI)

> **InsightAI** sử dụng kiến trúc AI tiên tiến dựa trên **Agentic RAG (LangGraph)** kết hợp **Multimodal Ingestion Pipeline** và **Hybrid Vector Search (Milvus)** để chuyển đổi tài liệu thô thành tài nguyên học tập thông minh.

---

## 1. Sơ đồ Kiến trúc & Công nghệ Toàn diện (System Architecture & Tech Stack Map)

Sơ đồ này phân tích chi tiết các thành phần hệ thống từ Frontend (FE) đến Backend (BE), chỉ rõ các thư viện, framework, dịch vụ đám mây và cơ sở dữ liệu được tích hợp:

```mermaid
graph TB
    %% 1. TẦNG FRONTEND CLIENT
    subgraph FRONTEND_TIER ["Next.js 14 Frontend - Client Side"]
        direction TB
        subgraph FE_UI ["Giao diện & UI Components"]
            React["React 18 & TypeScript"]
            Tailwind["TailwindCSS & CSS Variables"]
            Shadcn["shadcn/ui & Radix UI"]
            Lucide["Lucide React Icons"]
            Katex["KaTeX / MathJax - Render LaTeX Sơ đồ tư duy"]
        end
        subgraph FE_Core ["Luồng xử lý Core"]
            SupabaseAuthFE["@supabase/ssr - Client Session Auth"]
            SSEClient["EventSource - SSE Token Streaming Client"]
            AxiosClient["Axios Client - REST API Requests"]
            CustomMedia["HTML5 Custom Video/Audio Sync Player"]
        end
        subgraph FE_Integrations ["Tích hợp Ngoại vi"]
            ZaloPayFE["ZaloPay / MoMo / VietQR Payment UI"]
            GoogleSlidesFE["Google Slides Export Client"]
        end
    end

    %% 2. TẦNG BACKEND APPLICATION
    subgraph BACKEND_TIER ["FastAPI Backend - Application Server"]
        direction TB
        subgraph BE_Gateway ["API Gateway & Routing"]
            FastAPI["FastAPI Framework - Python 3.11"]
            Uvicorn["Uvicorn ASGI Server"]
            Pydantic["Pydantic v2 - Data Validation"]
            SQLAlchemy["SQLAlchemy ORM - DB Connection Session"]
        end
        subgraph BE_Background ["Async Job Workers"]
            BgTasks["FastAPI BackgroundTasks - Async Pipeline"]
            Semaphores["Rate Limiter - GLOBAL_LLM_SEMAPHORE"]
        end
        subgraph BE_Ingestion ["Media Ingestion Engines & Processors"]
            YTDLP["yt-dlp - YouTube Video/Audio Downloader"]
            FFmpeg["FFmpeg - Scene Keyframe & Audio Extractor"]
            PyMuPDF["PyMuPDF fitz - Fast PDF Text Extractor"]
            Chunkers["SemanticChunker & TextChunker Modules"]
        end
        subgraph BE_Search ["Search & Vector Service Module"]
            SearchService["SearchService (dense + BM25 sparse hybrid)"]
        end
        subgraph BE_SlideEngine ["AI-powered Slide Generator Engine"]
            SlideParser["Outline & Layout Density Processor"]
            ImageResolver["Visual Scorer & DALL-E 3 Generator"]
            NotesGenerator["Speaker Notes Generator Module"]
        end
    end

    %% 3. TẦNG AI AGENTS & APIS
    subgraph AI_AGENT_TIER ["Orchestration & AI Models"]
        direction TB
        subgraph AI_Core ["AI Agents Core"]
            LangGraph["LangGraph - State Machine Agentic RAG"]
            LangChain["LangChain Core - Prompt & Model Adapters"]
            Extractor["KnowledgeExtractor - Structured Output JSON Parser"]
        end
        subgraph AI_Services ["Dịch vụ AI APIs"]
            OpenAI["OpenAI API - GPT-4o-mini & Text-Embedding-3-small"]
            Whisper["OpenAI Whisper-1 API - Speech-To-Text"]
            AzureTTS["Azure Speech SDK - Southeast Asia Text-To-Speech"]
            Tavily["Tavily Search API - Web Search Fallback"]
        end
    end

    %% 4. TẦNG CƠ SỞ DỮ LIỆU VẬT LÝ
    subgraph DATABASE_TIER ["Database & Storage Tier (External / Physical Services)"]
        direction TB
        subgraph Relational_DB ["Database & Storage"]
            SupabaseDB[("Supabase PostgreSQL - RLS Enabled")]
            SupabaseStorage[("Supabase Storage - PDF, Video, Audio storage")]
        end
        subgraph Vector_DB ["Vector Databases"]
            Milvus[("Milvus Serverless (Zilliz Cloud / Milvus Lite)")]
            Chroma[("ChromaDB (Local File Storage)")]
            PGVector[("Supabase pgvector (PostgreSQL Fallback)")]
        end
    end

    %% Mối quan hệ kết nối giữa các Tier
    AxiosClient -->|HTTPS REST Request| FastAPI
    SSEClient -->|SSE Stream Connection| FastAPI
    SupabaseAuthFE -->|Session Sync| SupabaseDB

    FastAPI -->|Background Dispatch| BgTasks
    BgTasks -->|1. Extract Raw Media| BE_Ingestion
    BgTasks -->|2. Orchestrate AI Workflow| AI_Core
    BgTasks -->|3. Save Chunks & Index| SearchService

    %% BE Search Service kết nối trực tiếp đến Databases vật lý
    SearchService -->|Dual-Write / Search| Vector_DB
    SearchService -->|Save chunk metadata| SupabaseDB

    %% AI Core gọi Search Service làm interface để tìm kiếm RAG
    AI_Core -->|Retrieve context chunks| SearchService
    AI_Core -->|API Invocations| AI_Services

    %% Slide Generator Module
    FastAPI -->|Process slide requests| BE_SlideEngine
    BE_SlideEngine -->|Multi-query context query| SearchService
    BE_SlideEngine -->|Generate Slide / Image| AI_Services
```

---

## 2. Phân rã Luồng xử lý chi tiết (Granular Flow Decomposition)

### 2.1. Ingestion Pipeline - Tiền xử lý Đa phương tiện Chi tiết

Luồng băm nhỏ và xử lý từng tệp tin đầu vào từ lúc người dùng tải lên cho đến khi lưu trữ Vector:

```mermaid
sequenceDiagram
    autonumber
    actor User as Học viên / Giảng viên
    participant FE as Next.js Client
    participant API as FastAPI Gateway
    participant Storage as Supabase Storage
    participant Worker as Background Ingestion Worker
    participant Extractor as Media Processors (FFmpeg/PyMuPDF)
    participant Whisper as Whisper STT API
    participant SearchServ as Search & Vector Service (BE)
    participant VectorDB as Vector DBs (Milvus/Chroma)
    participant PostgreSQL as Supabase PostgreSQL

    User->>FE: Kéo thả tài liệu / Nhập link YouTube
    FE->>Storage: Tải tệp lên bucket (PDF/Video/Audio)
    Storage-->>FE: Trả về Public URL
    FE->>API: Gửi Request `POST /api/items/` (Source URL + Options)
    API->>PostgreSQL: Khởi tạo KnowledgeItem (Trạng thái: "Processing")
    API->>Worker: Kích hoạt Async Task `_step_ingestion` (Không block FE)
    API-->>FE: Trả về HTTP 202 Accepted (item_id)

    Note over FE: Frontend bắt đầu Polling/SSE lắng nghe trạng thái processing_stage

    alt Nguồn là Video / Audio / YouTube
        Worker->>Extractor: Tải tệp tạm & Gọi FFmpeg / yt-dlp
        Extractor->>Extractor: 1. Tách luồng Audio (16kHz WAV mono)
        Extractor->>Extractor: 2. Trích xuất Keyframes (Max 3 frames/phân đoạn cảnh)
        Worker->>Whisper: Gửi tệp Audio 25MB chunks
        Whisper-->>Worker: Trả về raw Transcript kèm timestamp chi tiết
        Worker->>Worker: Gom các đoạn transcript ngắn thành semantic chunks (~30s)
        Worker->>SearchServ: Gọi index_document()
    else Nguồn là PDF
        Worker->>Extractor: Gọi PyMuPDF (fitz)
        Extractor->>Extractor: Trích xuất text thô + Inject tag trang [P1], [P2]...
        Worker->>Worker: Phân đoạn văn bản bằng TextChunker (RecursiveCharacterTextSplitter)
        Worker->>SearchServ: Gọi index_document()
    end

    SearchServ->>VectorDB: Lập chỉ mục song song (Dense & Sparse Embedding)
    SearchServ->>PostgreSQL: Lưu thông tin Chunks (`item_chunks`) & Embeddings (`embeddings`)
    Worker->>PostgreSQL: Cập nhật Trạng thái Task (`enrichment_jobs`) = "Done"
    Worker-->>FE: Phát tín hiệu hoàn tất qua kênh SSE Stream
```

---

### 2.2. Enrichment Pipeline - Quy trình Map-Reduce & Agentic Generation

Luồng xử lý logic của AI Worker khi tổng hợp tri thức, tạo bài học chi tiết và sinh câu hỏi trắc nghiệm song song:

```mermaid
graph TD
    subgraph Map_Reduce_Phase ["Giai đoạn 1: Tổng hợp Tri thức (Map-Reduce)"]
        RawContent["Raw Text Content - 100% tài liệu"] -->|Băm khối| Blocks["Khối dữ liệu 8k - 12k ký tự"]

        subgraph Map_Step ["Map Phase"]
            Block1["Khối 1"] -->|LLM Call| LocalSum1["Ý chính cục bộ 1 + Mindmap Nodes"]
            Block2["Khối 2"] -->|LLM Call| LocalSum2["Ý chính cục bộ 2 + Mindmap Nodes"]
            BlockN["Khối N"] -->|LLM Call| LocalSumN["Ý chính cục bộ N + Mindmap Nodes"]
        end

        subgraph Reduce_Step ["Reduce Phase"]
            LocalSum1 & LocalSum2 & LocalSumN -->|Synthesis Prompt| Summarizer["Summarizer LLM"]
            LocalSum1 & LocalSum2 & LocalSumN -->|Hierarchical Structuring| MindmapBuilder["Mindmap LLM"]

            Summarizer -->|Output| FinalSummary["Summary: TL;DR + Detailed Content + Highlights"]
            MindmapBuilder -->|Output| FinalMindmap["JSON Mindmap logic kèm công thức LaTeX"]
        end
    end

    subgraph Agentic_Generation_Phase ["Giai đoạn 2: Tạo Bài học & Câu hỏi Song song"]
        FinalSummary -->|LLM Call| OutlineGen["Tạo Dàn ý - Outline Generation"]
        OutlineGen -->|Output| Outline["Dàn ý bài học: 3 - 7 bài cụ thể"]

        subgraph Parallel_Execution ["Parallel Workers - Semaphore Control"]
            direction LR
            subgraph Lesson_Quiz_1 ["Bài học 1"]
                L1_Search["SearchService RAG Search"] --> L1_Write["Write Lesson LLM"]
                L1_Write --> L1_Save["Lưu database"]
                L1_Write --> Q1_Gen["Generate Quiz LLM"]
                Q1_Gen --> Q1_Save["Lưu database"]
            end
            subgraph Lesson_Quiz_N ["Bài học N"]
                LN_Search["SearchService RAG Search"] --> LN_Write["Write Lesson LLM"]
                LN_Write --> LN_Save["Lưu database"]
                LN_Write --> QN_Gen["Generate Quiz LLM"]
                QN_Gen --> QN_Save["Lưu database"]
            end
        end

        Outline -->|Kích hoạt song song| Lesson_Quiz_1 & Lesson_Quiz_N
    end

    %% Lưu kết quả cuối cùng
    FinalSummary -->|Lưu SQL DB| SupabaseSQL[("Supabase PostgreSQL")]
    FinalMindmap -->|Lưu SQL DB| SupabaseSQL
    L1_Save & Q1_Save & LN_Save & QN_Save -->|Lưu SQL DB| SupabaseSQL
```

---

### 2.3. Agentic RAG Chatbot - Sơ đồ Trạng thái LangGraph Chi tiết

Sơ đồ mô tả chi tiết đường đi của dữ liệu, cấu trúc của `AgentState` và các bộ định tuyến có điều kiện (Conditional Routers) bên trong LangGraph:

```mermaid
graph TD
    %% Định nghĩa State
    subgraph State_Variables ["Cấu trúc AgentState"]
        q["query: Câu hỏi người dùng"]
        it["intent: casual_chat / summary_query / rag_query"]
        ctx["context: Các đoạn văn bản RAG tìm được"]
        gen["generation: Câu trả lời cuối cùng từ AI"]
        is_ot["is_off_topic: True / False"]
        ws_nd["web_search_needed: True / False"]
        sum["doc_summary: Bản tóm tắt của tài liệu"]
    end

    %% Luồng LangGraph Node
    START(["START"]) --> analyze_intent["analyze_intent_node: Phân tích Ý định"]

    analyze_intent --> Route1{route_after_intent}

    %% Rẽ nhánh Ý định
    Route1 -->|casual_chat / summary_query có sẵn| generate["generate_node: Sinh Câu Trả Lời"]
    Route1 -->|rag_query / summary chưa có| retrieve["retrieve_node: RAG Search - SearchService Call"]

    retrieve --> grade["grade_node: Chấm điểm Ngữ cảnh & Lọc nhiễu"]

    grade --> Route2{route_after_grading}

    %% Rẽ nhánh Kiểm định
    Route2 -->|Lạc đề: is_off_topic=True| generate
    Route2 -->|Thiếu thông tin: web_search_needed=True| web_search["web_search_node: Tavily Web Search"]
    Route2 -->|Đủ thông tin: web_search_needed=False| generate

    web_search --> generate
    generate --> END(["END"])

    %% Chú thích logic
    classDef router fill:#f9f,stroke:#333,stroke-width:2px;
    class Route1,Route2 router;
```

---

## 3. Các Giải pháp Kiến trúc Đặc trưng & Điểm nhấn Kỹ thuật (Technical Highlights)

Sau khi đánh giá trực tiếp mã nguồn, dưới đây là các điểm sáng kỹ thuật mang tính đột phá của **InsightAI** giúp nâng cao điểm chất lượng dự án trước Ban giám khảo (BTC):

### 3.1. Registry Pattern Cho Ingestion Engines & Thread-Safe Operations

- **Kiến trúc:** Hệ thống sử dụng thiết kế **Registry Design Pattern** (`IngestionRegistry`) để quản lý các processor nạp tài liệu một cách động.
- **Chi tiết:** Đối với các tác vụ I/O thô hoặc tính toán nặng (như băm mở file PDF lớn bằng `PyMuPDF` hoặc tách keyframes bằng `FFmpeg`), FastAPI đã triển khai việc cô lập và chạy trên **Thread Pool** thông qua `anyio.to_thread.run_sync`. Điều này giúp đảm bảo **không làm nghẽn Event Loop** bất đồng bộ của FastAPI, đảm bảo tính đáp ứng đồng thời (Concurrency) cao khi có hàng trăm request gửi tới.

### 3.2. PyMuPDF Page-Marker Injection (Kỹ thuật bảo toàn trang)

- **Kỹ thuật:** Khi đọc tệp PDF, `PDFProcessor` tự động tiêm marker trang dạng `[P{page_num}]` vào đầu từng dòng văn bản thô.
- **Ý nghĩa:** Khi văn bản đi qua bộ băm chunk (`TextChunker`), các chunks văn bản vẫn luôn mang theo số trang tương ứng. Nhờ đó, Agent RAG khi truy xuất ngữ cảnh có thể đưa ra dẫn chứng chính xác tuyệt đối: **"Thông tin được tìm thấy tại Trang X của tài liệu"** thay vì trả lời mơ hồ, tăng độ tin cậy của câu trả lời.

### 3.3. Whisper-based Semantic & Temporal Chunker (Bộ băm ngữ nghĩa & thời gian)

- **Kỹ thuật:** Đối với video/audio, sau khi trích xuất phụ đề thô bằng OpenAI Whisper-1, hệ thống sử dụng thuật toán gom cụm ngữ nghĩa động (`SemanticChunker`):
  1. Tính độ tương đồng ngữ nghĩa giữa các câu liên tiếp bằng **Cosine Similarity** trên Vector Embeddings (`text-embedding-3-small`).
  2. Phát hiện các **Từ khóa chuyển cảnh** tự nhiên như: _"tiếp theo"_, _"chúng ta sẽ sang"_, _"kết thúc phần"_.
  3. Đo lường khoảng lặng **Time Gap** giữa các mốc phát âm (`start` và `end` time) nếu lớn hơn 5.0 giây.
  4. Gom cụm động dựa trên điều kiện tích lũy thời gian tối thiểu (`min_duration = 180s`).
- **Ý nghĩa:** Đảm bảo các đoạn trích xuất kiến trúc video không bị cắt nửa chừng hay gãy câu giữa chừng, bảo toàn trọn vẹn mạch tư duy bài giảng.

### 3.4. Hybrid & Multi-tiered Vector Search (Tìm kiếm vector đa tầng)

- **Kiến trúc:** Search Service (`search_service`) triển khai cơ chế tìm kiếm lai (Hybrid Search) nâng cao:
  - **Milvus Serverless:** Thực hiện tìm kiếm lai giữa **Dense Query** (độ tương đồng ngữ nghĩa) và **Sparse Query** (tần suất từ khóa BM25) rồi gộp kết quả qua **WeightedRanker(0.7, 0.3)**.
  - **ChromaDB:** Lớp cơ sở dữ liệu vector local đóng vai trò cache và dự phòng khi mạng Internet/Milvus Cloud gặp sự cố.
  - **PostgreSQL pgvector:** Lớp vector dự phòng cuối cùng lưu trữ vĩnh viễn embeddings trực tiếp cùng metadata của chunks văn bản.

### 3.5. Dual-engine Web Search Fallback with Content Guardrails

- **Kỹ thuật:** Khi LLM-as-a-judge (`grade_node` trong LangGraph) đánh giá ngữ cảnh tài liệu nội bộ thiếu thông tin, nó kích hoạt Web Search.
- **Bảo vệ:** Lớp Web Search sử dụng **Query Transformation** biến đổi lịch sử chat thành từ khóa chuyên sâu kèm từ khóa phủ định (`-bet -casino -nhà cái`) để tránh rác thông tin.
- **Dự phòng:** Sử dụng **Tavily Search API** làm cổng chính, tự động fallback về **DuckDuckGo Search (DDGS)** chạy lọc danh sách đen (Blacklist Filtering) khi Tavily hết hạn ngạch hoặc lỗi.

### 3.6. AI-powered Slide Generation Engine (Trình biên dịch Presentation nâng cao)

- **Quy trình:** Module `slides.py` là một slide engine thông minh kết hợp đa mô hình:
  - **Layout Density Profiles:** Tùy chọn 4 giao diện thuyết trình độc đáo (`business`, `creative`, `academic`, `children`). Mỗi loại sẽ tự động áp dụng mật độ chữ, số lượng câu, giới hạn từ ngữ (Max 15 từ/bullet) để slide tinh gọn nhất.
  - **Selective Visual Scorer:** Chạy thuật toán chấm điểm tiềm năng hình ảnh (`_score_slide_for_visual`). Tự động cộng điểm cho các slide mô tả "quy trình", "kiến trúc", "giải pháp" để ưu tiên tạo prompt hình ảnh minh họa bằng **DALL-E 3** (hoặc Pollinations AI).
  - **Parallel Multi-query Context Compilation:** Để viết slide chuẩn nhất, hệ thống chạy **10 luồng tìm kiếm song song** dựa trên dàn ý đề xuất để gom đủ `14,000` ký tự ngữ cảnh đặc thù từ Vector DB.
  - **AI Speaker Notes Generator:** Tự động sinh kịch bản thuyết trình chi tiết tương thích hoàn toàn với phong cách trình bày được chọn (Ví dụ: business sẽ executive, creative sẽ storytelling...).

---

## 4. Bản đồ Công nghệ Chi tiết (Tech Stack Summary Table)

Để hỗ trợ bạn cập nhật nhanh thông tin này vào Slide Pitch Deck hoặc hồ sơ nộp dự án, dưới đây là bảng phân bổ công nghệ của toàn bộ dự án:

| Tầng Hệ thống         | Công nghệ / Thư viện sử dụng                  | Vai trò & Mục đích sử dụng                                           |
| :-------------------- | :-------------------------------------------- | :------------------------------------------------------------------- |
| **Frontend UI**       | Next.js 14, React 18, TypeScript, TailwindCSS | Xây dựng giao diện web phản hồi nhanh (Responsive SPA).              |
| **UI Components**     | shadcn/ui, Radix UI, Lucide Icons             | Cung cấp các nút, popup, sidebar theo chuẩn Premium UX/UI.           |
| **Math Render**       | KaTeX, LaTeX integration                      | Hiển thị công thức toán học sắc nét trong Sơ đồ tư duy và Quiz.      |
| **Audio Processing**  | HTML5 Audio API, WaveSurfer                   | Đồng bộ thời gian thực mốc phát âm thanh và chữ chạy.                |
| **Backend Framework** | FastAPI, Uvicorn, Python 3.11                 | Cung cấp RESTful APIs tốc độ cao và hỗ trợ stream dữ liệu SSE.       |
| **Data Validation**   | Pydantic v2, SQLAlchemy ORM                   | Đảm bảo tính toàn vẹn dữ liệu từ API Gateway xuống Database.         |
| **Downloader**        | `yt-dlp`                                      | Tự động tải luồng video/audio chất lượng từ link YouTube.            |
| **Media Processor**   | `FFmpeg`                                      | Cắt cảnh video thành keyframes và trích xuất tệp WAV.                |
| **Document Parser**   | `PyMuPDF`                                     | Trích xuất text cực nhanh từ tệp PDF nhiều trang.                    |
| **AI Orchestration**  | LangGraph, LangChain Core                     | Thiết kế Agentic RAG thông minh bằng máy trạng thái.                 |
| **AI Models (LLMs)**  | OpenAI GPT-4o-mini, GPT-4o                    | Xử lý ngôn ngữ, chấm điểm RAG, viết bài học và sinh câu hỏi.         |
| **STT Engine**        | OpenAI Whisper-1                              | Chuyển đổi tệp ghi âm giọng nói thành văn bản có mốc thời gian.      |
| **TTS Engine**        | Microsoft Azure Text-to-Speech                | Cung cấp giọng đọc nhân tạo cực sinh động cho Voice Chat.            |
| **Web Search**        | Tavily Search API                             | Lớp tìm kiếm Internet fallback khi tài liệu nội bộ thiếu thông tin.  |
| **Vector DB Primary** | Milvus Serverless (Zilliz Cloud)              | Hybrid Search: Tìm kiếm kết hợp ngữ nghĩa và từ khóa (Dense + BM25). |
| **Vector DB Local**   | ChromaDB                                      | Cơ sở dữ liệu vector chạy cục bộ phục vụ cache/embed nhanh.          |
| **Fallback DB**       | PostgreSQL (Supabase `pgvector`)              | Lớp vector fallback an toàn, lưu trữ vĩnh viễn embeddings.           |
| **Relational DB**     | Supabase PostgreSQL                           | Quản lý người dùng, phân quyền RLS, lưu tiến độ bài học, billing.    |
| **Object Storage**    | Supabase Storage                              | Lưu trữ tệp thô vật lý (.pdf, .mp3, .mp4).                           |
| **Payment Gateway**   | ZaloPay, MoMo, VietQR APIs                    | Tích hợp hệ thống thanh toán quét mã QR nạp credit tự động.          |
