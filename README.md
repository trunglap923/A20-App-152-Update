# Micro-Learning Factory — AI Content Atomizer — Nền tảng học tập thông minh từ tài liệu & video

> Biến mọi video, PDF, audio thành bài học có cấu trúc, tóm tắt, quiz và sơ đồ tư duy — chỉ trong vài phút.

🔗 **Link liên kết swagger**: https://nexusai-bh1p.onrender.com/docs<br>
🔗 **Live URL**: https://a20-app-152.vercel.app<br>
📺 **Video Demo**: https://youtu.be/4k2dfErOcMM<br>
📊 **Pitch Deck**: https://docs.google.com/presentation/d/1y77cwbzRdDqAeAoP2gryyc_5NVb1Pbx6wrlWVOfbwDc/edit?usp=sharing<br>
🏗️ **Architecture**: Đọc [SYSTEM_WORKFLOW.md](./SYSTEM_WORKFLOW.md) để xem phân tích chi tiết.

---

## 📌 Tên dự án

**Micro-Learning Factory — AI Content Atomizer**

---

## 📝 Mô tả ngắn gọn

Micro-Learning Factory – AI Content Atomizer là nền tảng học tập thông minh giúp người dùng tự động trích xuất kiến thức từ bất kỳ nguồn tài liệu nào (video YouTube, video upload, PDF, ghi âm trực tiếp) thông qua AI. Hệ thống tạo ra tóm tắt, bài học có cấu trúc, quiz trắc nghiệm, sơ đồ tư duy và hỗ trợ chatbot hỏi đáp thông minh theo tài liệu.

---

## 🎯 Mục tiêu / Vấn đề giải quyết

**Vấn đề:**

- Học viên mất nhiều giờ xem lại video bài giảng dài để tìm kiến thức cần thiết
- Không có công cụ tự động hóa việc chuyển đổi tài liệu thô (video/PDF) thành nội dung học tập có cấu trúc
- Chatbot thông thường không có ngữ cảnh tài liệu cụ thể, trả lời chung chung

**Giải pháp:**

- Tự động phân tích video/PDF/audio bằng AI (Whisper STT + GPT Vision + LLM)
- Tạo ra bài học, tóm tắt, quiz, mindmap từ nội dung thực tế của tài liệu
- Chatbot RAG (Retrieval-Augmented Generation) với Agentic flow, chỉ trả lời dựa trên tài liệu đã upload

---

## ✨ Tính năng chính

| Tính năng                    | Mô tả                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- |
| 📥**Multi-source Upload**    | Hỗ trợ YouTube URL, video upload, PDF, ghi âm trực tiếp                           |
| 🤖**AI Extraction Pipeline** | Tự động trích xuất: Tóm tắt → Bài học → Quiz → Mindmap                            |
| 💬**Agentic RAG Chatbot**    | LangGraph-based chatbot với Intent Routing, Web Search fallback, Long-term Memory |
| 🗺️**Interactive Mindmap**    | Sơ đồ tư duy tương tác, hỗ trợ LaTeX math formula                                 |
| 🎯**Quiz Generator**         | Sinh câu hỏi trắc nghiệm tự động theo độ khó (cơ bản/trung bình/nâng cao)         |
| 🎤**Voice Conversation**     | Hội thoại giọng nói với AI (Azure TTS + Web Speech API)                           |
| 📊**Google Slides Export**   | Xuất nội dung bài học thành slide trình chiếu                                     |
| 🔍**Hybrid Search**          | Tìm kiếm ngữ nghĩa kết hợp từ khóa (Milvus dense + BM25 sparse)                   |
| 💳**Credit System**          | Hệ thống credit với thanh toán ZaloPay / MoMo / VietQR                            |
| 🛡️**Admin Dashboard**        | Quản lý user, AI logs, billing history                                            |

---

## 🛠️ Công nghệ sử dụng

### Frontend

| Công nghệ                    | Mục đích                    |
| ---------------------------- | --------------------------- |
| **Next.js 14** (App Router)  | Framework React với SSR/SSG |
| **TypeScript**               | Type safety                 |
| **Tailwind CSS + shadcn/ui** | UI components               |
| **Supabase JS**              | Auth client + Realtime      |

### Backend

| Công nghệ                    | Mục đích                                        |
| ---------------------------- | ----------------------------------------------- |
| **FastAPI**                  | REST API + SSE streaming                        |
| **LangGraph**                | Agentic RAG workflow (state machine)            |
| **LangChain**                | LLM chaining, structured output                 |
| **OpenAI GPT-4o-mini**       | Text extraction, summarization, quiz generation |
| **OpenAI Whisper**           | Audio/Video transcription (STT)                 |
| **Azure Cognitive Services** | Text-to-Speech (TTS) cho Voice Chat             |
| **Milvus**                   | Vector database — Hybrid Search (dense + BM25)  |
| **Supabase PostgreSQL**      | Relational database                             |
| **Supabase Storage**         | File storage (video, PDF, audio)                |
| **Tavily Search**            | Web search fallback cho chatbot                 |

### AI/ML Pipeline

| Công nghệ       | Mục đích                                  |
| --------------- | ----------------------------------------- |
| **PyMuPDF**     | PDF parsing + page extraction             |
| **yt-dlp**      | YouTube video download + audio extraction |
| **FFmpeg**      | Video/audio processing                    |
| **Pydantic v2** | Structured output schema validation       |

### Deploy & DevOps

| Công nghệ                      | Mục đích                   |
| ------------------------------ | -------------------------- |
| **Vercel**                     | Frontend deployment        |
| **Render / Cloudflare Tunnel** | Backend deployment         |
| **GitHub Actions**             | CI/CD (build check + lint) |

---

## 🚀 Hướng dẫn cài đặt

### Yêu cầu hệ thống

- **Python** 3.10+
- **Node.js** 18+ và **pnpm** (`npm install -g pnpm`)
- **FFmpeg** (cần có trong PATH)
- **Git**

### 1. Clone repository

```bash
git clone https://github.com/a20-ai-thuc-chien/A20-App-152.git
cd A20-App-152
```

### 2. Cài đặt Backend

```bash
cd backend

# Tạo virtual environment
python -m venv venv

# Kích hoạt venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Cài dependencies
pip install -r requirements.txt
```

### 3. Cấu hình biến môi trường Backend

```bash
# Copy file mẫu
cp .env.example .env
```

Mở file `backend/.env` và điền các giá trị:

```env
# Database (Supabase)
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_JWT_SECRET=your_jwt_secret

# AI APIs
OPENAI_API_KEY=sk-...
AZURE_SPEECH_KEY=your_azure_key
AZURE_SPEECH_REGION=southeastasia
TAVILY_API_KEY=tvly-...

# Vector DB
MILVUS_URI=your_milvus_uri
MILVUS_TOKEN=your_milvus_token

# Payment (tùy chọn)
ZALOPAY_APP_ID=...
MOMO_PARTNER_CODE=...
```

### 4. Cài đặt Frontend

```bash
# Từ thư mục gốc
cd myApp

# Cài dependencies
pnpm install
```

Copy file `.env.local.example` thành `.env.local` để cấu hình:

```bash
cp .env.local.example .env.local
```

---

## ▶️ Hướng dẫn chạy dự án

### Chạy Backend (cổng 8000)

```bash
cd backend

# Kích hoạt venv (nếu chưa)
venv\Scripts\activate  # Windows

# Chạy server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend sẽ chạy tại: `http://localhost:8000`
API docs: `http://localhost:8000/docs`

### Chạy Frontend (cổng 3000)

Mở terminal mới:

```bash
cd myApp
pnpm dev
```

Frontend sẽ chạy tại: `http://localhost:3000`

---

## 📖 Hướng dẫn sử dụng sản phẩm

### 1. Đăng ký / Đăng nhập

- Truy cập `http://localhost:3000`
- Đăng ký bằng email hoặc Google/Facebook
- Xác nhận email (nếu dùng email đăng ký)

### 2. Upload tài liệu

Từ Sidebar, nhấn **"+ Thêm tài liệu"** và chọn một trong các nguồn:

| Nguồn               | Định dạng             |
| ------------------- | --------------------- |
| 🎥 YouTube          | Dán URL video YouTube |
| 📁 Video Upload     | MP4                   |
| 📄 PDF Upload       | File PDF              |
| 🎙️ Ghi âm trực tiếp | Ghi âm qua microphone |

Sau khi upload, hệ thống sẽ tự động xử lý (2–5 phút tùy độ dài tài liệu).

### 3. Khám phá nội dung

Sau khi xử lý xong, tài liệu sẽ có các tab:

- **📋 Tóm tắt** — Tóm tắt ngắn gọn (TL;DR) + chi tiết + từ khóa nổi bật (click để nhảy đến timestamp)
- **📚 Bài học** — Các bài học có cấu trúc với khái niệm chính và ví dụ
- **❓ Quiz** — Câu hỏi trắc nghiệm, chọn độ khó để tạo lại
- **🗺️ Mindmap** — Sơ đồ tư duy tương tác (zoom, kéo thả)
- **📊 Slides** — Xuất bài học ra Google Slides
- **💬 Chat** — Hỏi đáp AI về nội dung tài liệu

### 4. Chat với AI

Trong tab **Chat**, bạn có thể:

- **Hỏi về nội dung tài liệu** — AI sẽ tìm kiếm và trả lời dựa trên tài liệu đã upload
- **Hỏi câu hỏi tổng quát** — AI tự động search web khi thông tin không có trong tài liệu
- **Voice Chat** — Nhấn icon 🎤 để hội thoại bằng giọng nói (AI nói lại bằng giọng tổng hợp)

### 5. Tạo lại nội dung

Mỗi tab đều có nút **"Tạo lại"** để AI tái tạo nội dung với phiên bản mới hơn. Lịch sử các phiên bản được lưu lại.

### 6. Credit & Thanh toán

- Mỗi tài liệu xử lý tiêu tốn **1 credit** (~20,000 ký tự)
- Nạp credit qua: **VietQR** (ngân hàng) / **ZaloPay** / **MoMo**
- Xem lịch sử sử dụng tại **Profile → Billing History**

---

## 🏗️ Kiến trúc & Quy trình hệ thống (System Architecture)

InsightAI sử dụng một thiết kế kiến trúc chuẩn chỉ, phân tách rõ ràng giữa Frontend (Next.js 14), Backend (FastAPI), Lớp AI Agents chuyên biệt (LangGraph), và Hệ thống Cơ sở dữ liệu Vector đa tầng (Milvus / Chroma / pgvector).

Dưới đây là sơ đồ chi tiết các thành phần và luồng hoạt động chính của hệ thống. Bạn cũng có thể xem phân tích kỹ thuật chuyên sâu tại file [SYSTEM_WORKFLOW.md](./SYSTEM_WORKFLOW.md).

### 1. Sơ đồ Kiến trúc tĩnh & Phân bổ Công nghệ (System Component Map)

![Kiến trúc hệ thống tĩnh](./architect/System_Architect.png)

### 2. Quy trình nạp dữ liệu đa phương tiện (Ingestion Pipeline)

![Quy trình nạp dữ liệu Ingestion Pipeline](./architect/Ingestion%20Pipeline.png)

### 3. Quy trình Map-Reduce & Tạo bài học song song (Enrichment Pipeline)

![Quy trình Map-Reduce và tạo bài học Enrichment Pipeline](./architect/Enrichment%20Pipeline.png)

### 4. Sơ đồ Máy trạng thái RAG Chatbot (LangGraph Agentic Flow)

![Sơ đồ tác vụ LangGraph Agentic RAG Chatbot](./architect/Agentic%20RAG%20Chatbot.png)

---

## 📁 Cấu trúc dự án

```
A20-App-152/
├── backend/                        # FastAPI Backend
│   ├── app/
│   │   ├── agent/                  # LangGraph Agentic RAG
│   │   │   ├── graph.py            # LangGraph graph definition & compilation
│   │   │   ├── nodes.py            # Agent nodes (analyze_intent, retrieve, grade, generate...)
│   │   │   ├── state.py            # AgentState schema
│   │   │   └── cache_service.py    # Caching layer cho agent
│   │   ├── ai/                     # AI core
│   │   │   ├── extractor.py        # Structured output extraction (Mindmap, Quiz, Lesson...)
│   │   │   ├── prompts.py          # Prompt templates
│   │   │   ├── providers.py        # LLM provider factory (OpenAI, Anthropic, Gemini)
│   │   │   ├── rate_limiter.py     # Rate limiting cho AI calls
│   │   │   └── schemas.py          # Pydantic schemas cho AI output
│   │   ├── api/                    # FastAPI routes
│   │   │   ├── routes/
│   │   │   │   ├── items.py        # Upload, xử lý, SSE streaming
│   │   │   │   ├── chat.py         # Chatbot RAG endpoint
│   │   │   │   ├── admin.py        # Admin APIs (user, billing, AI logs)
│   │   │   │   └── slides.py       # Google Slides export
│   │   │   ├── deps.py             # FastAPI dependencies (auth, DB session)
│   │   │   └── schemas.py          # Request/Response schemas
│   │   ├── db/                     # Database layer
│   │   │   ├── base.py             # SQLAlchemy Base
│   │   │   └── session.py          # DB session factory
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── items.py            # Item (tài liệu upload)
│   │   │   ├── summaries.py        # Summary
│   │   │   ├── lessons.py          # Lessons
│   │   │   ├── quizzes.py          # Quiz questions
│   │   │   ├── mindmaps.py         # Mindmap data
│   │   │   ├── chat_messages.py    # Chat history
│   │   │   ├── chat_summaries.py   # Long-term memory summaries
│   │   │   ├── ai_logs.py          # AI request logs
│   │   │   ├── enrichment.py       # Enrichment job state
│   │   │   └── ...                 # (chunks, embeddings, notes, tags, progress...)
│   │   ├── processors/             # File processors
│   │   │   ├── ai/                 # AI-powered processing steps
│   │   │   ├── chunking/           # Text chunking strategies
│   │   │   ├── video/              # Video processing (FFmpeg, keyframe extraction)
│   │   │   ├── pdf.py              # PDF parsing (PyMuPDF)
│   │   │   ├── youtube.py          # YouTube download (yt-dlp)
│   │   │   └── base.py             # Base processor interface
│   │   ├── search/                 # Vector search
│   │   │   ├── backends/           # Search backend adapters (Milvus, Chroma)
│   │   │   └── service.py          # Hybrid search service (dense + BM25)
│   │   ├── services/               # Business logic services
│   │   │   └── memory_service.py   # Long-term memory compression
│   │   ├── utils/                  # Utilities
│   │   │   ├── credits.py          # Credit deduction logic
│   │   │   ├── supabase_storage.py # File upload/download Supabase Storage
│   │   │   └── cleanup.py          # Cleanup abandoned files
│   │   ├── workers/                # Background tasks
│   │   │   └── enrichment_pipeline.py  # Main AI pipeline (Summary→Lesson→Quiz→Mindmap)
│   │   ├── config.py               # App configuration (settings từ .env)
│   │   └── main.py                 # FastAPI app entry point
│   ├── .env.example                # Template biến môi trường
│   └── requirements.txt
│
├── myApp/                          # Next.js 14 Frontend
│   ├── app/                        # App Router pages
│   │   ├── admin/                  # Admin dashboard
│   │   ├── auth/                   # Auth callbacks (Supabase OAuth)
│   │   ├── login/                  # Trang đăng nhập
│   │   ├── register/               # Trang đăng ký
│   │   ├── forgot-password/        # Quên mật khẩu
│   │   ├── reset-password/         # Đặt lại mật khẩu
│   │   ├── payment/                # Trang thanh toán (ZaloPay, MoMo, VietQR)
│   │   ├── profile/                # Hồ sơ người dùng & billing history
│   │   ├── settings/               # Cài đặt tài khoản
│   │   ├── api/                    # Next.js API routes (proxy)
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page (dashboard)
│   ├── components/
│   │   ├── tabs/                   # Content tabs
│   │   │   ├── chat-tab.tsx        # Chatbot RAG + Voice Chat
│   │   │   ├── summary-tab.tsx     # Tóm tắt & từ khóa
│   │   │   ├── lessons-tab.tsx     # Bài học có cấu trúc
│   │   │   ├── quiz-tab.tsx        # Quiz trắc nghiệm
│   │   │   ├── mindmap-tab.tsx     # Sơ đồ tư duy tương tác
│   │   │   └── slides-tab.tsx      # Google Slides export
│   │   ├── admin/                  # Admin UI components
│   │   ├── credits/                # Credit system UI
│   │   ├── ui/                     # shadcn/ui base components
│   │   ├── sidebar.tsx             # Main sidebar (file list)
│   │   ├── file-upload.tsx         # Upload component
│   │   ├── video-player.tsx        # Video player với timestamp sync
│   │   ├── pdf-viewer.tsx          # PDF viewer tích hợp
│   │   └── ...
│   ├── contexts/                   # React Contexts
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Utilities & clients
│   │   ├── api.ts                  # Backend API client
│   │   ├── supabase/               # Supabase client config
│   │   ├── payment/                # Payment helpers (ZaloPay, MoMo)
│   │   ├── credits/                # Credit utilities
│   │   ├── types.ts                # TypeScript types
│   │   └── utils.ts                # Helper functions
│   ├── styles/                     # Global CSS
│   ├── public/                     # Static assets
│   ├── proxy.ts                    # API proxy config
│   ├── next.config.mjs             # Next.js configuration
│   └── vercel.json                 # Vercel deployment config
│
├── scripts/                        # Utility scripts
├── JOURNAL.md                      # Weekly journal (nhật ký phát triển)
├── WORKLOG.md                      # Technical decisions & task assignments
├── DEPLOYMENT.md                   # Hướng dẫn deploy production
├── docker-compose.yml              # Docker setup
└── README.md                       # File này
```

---

## 👥 Team 152

| Thành viên        | Role                             | GitHub                                                       |
| ----------------- | -------------------------------- | ------------------------------------------------------------ |
| Vũ Trung Lập      | Backend AI & Pipeline Lead       | [@trunglap923](https://github.com/trunglap923)               |
| Nguyễn Văn Hiếu   | Frontend & Auth & Payment Lead   | [@Nguyenhieu6732](https://github.com/Nguyenhieu6732)         |
| Nguyễn Việt Hoàng | Deploy, CI/CD & Frontend Feature | [@NguyenHoangFPT6203](https://github.com/NguyenHoangFPT6203) |
