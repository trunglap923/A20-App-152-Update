# Weekly Journal — Team 152

Nhật ký hành trình xây dựng **InsightAI** — Nền tảng học tập thông minh từ video, PDF và giọng nói.

**Thành viên:**
- **Vũ Trung Lập** (trunglap923) — Backend AI & Pipeline
- **Nguyễn Văn Hiếu** (Nguyenhieu6732) — Frontend UI & Auth & Payment
- **Nguyễn Việt Hoàng** (NguyenHoangFPT6203) — Deploy, CI/CD & Frontend Feature

---

## Tuần 1 — 12/04/2026 → 19/04/2026

**Thành viên:** Vũ Trung Lập, Nguyễn Văn Hiếu, Nguyễn Việt Hoàng

### Đã làm

- **[Hiếu]** Cài đặt Supabase, tích hợp Auth (Email + Google + Facebook) với Next.js
- **[Hiếu]** Build trang Edit Profile, Reset Password, đổi mật khẩu
- **[Lập]** Xây dựng toàn bộ Backend AI (FastAPI): ingestion pipeline, vector search, database integration, cấu trúc agent
- **[Lập]** Implement AI extraction pipeline với parallel processing và background task management
- **[Lập]** Xây dựng interactive mindmap visualization và processing pipeline UI tích hợp backend
- **[Hoàng]** Fix màn hình mindmap, business logic authentication, reset password flow
- **[Hoàng]** Implement Admin Dashboard và Role-based Access Control (RBAC)
- **[Hoàng]** Thêm trang payment cơ bản, cài đặt API AI key riêng cho user

### Khó nhất tuần này

- Kết nối Supabase Auth với Next.js App Router đúng luồng SSR/CSR mất nhiều thời gian debug
- Backend AI pipeline phức tạp, phải thiết kế từ đầu: chunking → embedding → vector store → retrieval
- Business logic reset password với Supabase magic link cần xử lý edge case token expired

### AI tool đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Gemini) | Thiết kế kiến trúc Backend AI pipeline, debug Supabase auth flow | Xây dựng được hệ thống extraction đa bước, tìm ra lỗi route matcher nhanh |
| GitHub Copilot | Autocomplete code (Hoàng), fix business logic auth/password reset | Tiết kiệm ~30% thời gian viết boilerplate |

### Học được

- Supabase RLS (Row Level Security) cần được thiết kế song song với schema ngay từ đầu
- FastAPI BackgroundTasks phù hợp cho long-running AI jobs, không nên dùng sync endpoint
- Nên tách riêng AI pipeline logic khỏi API handler để dễ test và mở rộng

### Nếu làm lại, sẽ làm khác

- Thiết kế DB schema trước khi viết code (chúng tôi đã phải sửa schema nhiều lần)
- Dùng Alembic migration ngay từ đầu thay vì `create_all()` thủ công

### Kế hoạch tuần tới

- Hoàn thiện UI chính (sidebar, tabs: Summary, Lesson, Quiz, Mindmap)
- Tích hợp payment (ZaloPay, MoMo)
- Deploy Frontend lên Vercel, Backend lên Render

---

## Tuần 2 — 20/04/2026 → 26/04/2026

**Thành viên:** Vũ Trung Lập, Nguyễn Văn Hiếu, Nguyễn Việt Hoàng

### Đã làm

- **[Hoàng]** Implement CI/CD hoàn chỉnh: GitHub Actions cho cả Frontend (pnpm) và Backend (Ruff lint)
- **[Hoàng]** Deploy Frontend lên Vercel, fix CORS, cấu hình vercel.json
- **[Hoàng]** Xây dựng màn hình Admin Overview AI, Notifications với banner system
- **[Hoàng]** Thêm voice popup, handle async file upload và update trạng thái upload
- **[Lập]** Thêm Video processing: local video playback, structured multimodal extraction
- **[Lập]** Refactor enrichment worker, tối ưu pipeline multimodal video (parallel Whisper transcription + Smart Keyframe Extraction)
- **[Lập]** Thêm Audio Live Recording (ghi âm trực tiếp, upload theo chunk)
- **[Lập]** Tính toán cost AI và hiển thị AI monitoring dashboard
- **[Lập]** Cho phép user cài custom API key và chọn model
- **[Hiếu]** Build trang Pricing với VietQR integration
- **[Hiếu]** Fix Notification UI, thêm trang billing-history

### Khó nhất tuần này

- CI/CD bị lỗi liên tục do package manager mismatch (dự án dùng pnpm nhưng workflow cài npm) — Hoàng phải sửa >15 lần commit để ổn định
- Vercel yêu cầu Pro plan cho private organization repo → phải tìm workaround
- Video multimodal extraction: cân bằng giữa tốc độ và độ chính xác của scene detection

### AI tool đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Gemini) | Thiết kế video pipeline: parallel Whisper + keyframe extraction, tối ưu pipeline multimodal | Giảm latency xử lý video từ ~120s xuống ~60s |
| GitHub Copilot | Debug CI/CD YAML errors, fix vercel.json và pnpm config (Hoàng) | Phát hiện lỗi pnpm lockfile mismatch sau nhiều lần thử |
| Antigravity (Gemini) | Hỗ trợ viết DEPLOYMENT.md và cấu hình GitHub Actions | Tài liệu deploy đầy đủ trong 1 giờ |

### Học được

- Vercel không hỗ trợ free tier cho private org repo — cần biết trước khi chọn platform
- Parallel async task với `asyncio.gather` giảm thời gian pipeline đáng kể
- Ghi âm theo chunk (3 phút/chunk) ổn định hơn là ghi một file dài duy nhất

### Nếu làm lại, sẽ làm khác

- Kiểm tra giới hạn free tier của tất cả platform trước khi setup CI/CD
- Chỉ có một `requirements.txt` ở root, không tách thành `backend/requirements.txt` riêng

### Kế hoạch tuần tới

- Tích hợp Payment (ZaloPay + MoMo + VietQR) cho phần credit
- Xây dựng trang Admin quản lý user
- Tối ưu mindmap generation và AI log admin

---

## Tuần 3 — 27/04/2026 → 03/05/2026

**Thành viên:** Vũ Trung Lập, Nguyễn Văn Hiếu, Nguyễn Việt Hoàng

### Đã làm

- **[Hiếu]** Tích hợp ZaloPay + MoMo payment webhook (debug callback rất nhiều)
- **[Hiếu]** Tích hợp VietQR API để tạo QR thanh toán tự động
- **[Hiếu]** Build Admin User Management page (list, block, manage users)
- **[Hiếu]** Build billing history page cho user
- **[Lập]** Tối ưu AI video/pdf pipeline: single-pass extraction, async RAG
- **[Lập]** Tối ưu pipeline: parallel Whisper transcription, Smart Keyframe Extraction
- **[Lập]** Implement media_timestamp schema và PDF viewer tích hợp
- **[Lập]** Click-to-navigate: click vào keyword nhảy đến đúng timestamp video/trang PDF
- **[Lập]** AI monitoring: log AI request theo từng user, filter theo ngày, phân trang
- **[Lập]** Fix keyword deduplication và sync UI state khi pipeline chạy xong
- **[Hoàng]** Thêm logic chatbox cơ bản
- **[Hoàng]** Fix notifications: preview nội dung trước khi mở
- **[Hoàng]** Migrate file storage sang Supabase Storage cho remote processing

### Khó nhất tuần này

- ZaloPay/MoMo webhook callback rất khó debug do phải expose localhost ra public (dùng ngrok), signature verification phức tạp
- VietQR API auto-expire sau 15 phút — cần implement refresh logic phía FE
- Pipeline AI đôi khi bị treo khi mindmap generation timeout → cần thêm fallback strategy

### AI tool đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Gemini) | Tối ưu pipeline, thiết kế Map-Reduce cho tài liệu dài, debug ZaloPay signature | Giảm token usage ~40%, tìm ra bug thiếu field `message` trong webhook |
| GitHub Copilot | Viết logic chatbox, fix notification UI, Supabase Storage integration (Hoàng) | Tăng tốc code completion, ít lỗi typo hơn |

### Học được

- Payment webhook cần được test qua tunnel (ngrok/cloudflare) ngay từ đầu, không để cuối mới làm
- `asyncio.wait_for` với timeout là cần thiết cho mọi LLM call — không bao giờ để call không có timeout
- Supabase Storage + CDN giúp backend không cần lưu file local, dễ scale hơn

### Nếu làm lại, sẽ làm khác

- Setup Cloudflare Tunnel ngay từ đầu để test webhook không cần ngrok
- Thiết kế payment flow theo state machine rõ ràng hơn trước khi code

### Kế hoạch tuần tới

- Xây dựng Chatbot RAG với LangGraph (Agentic RAG)
- Thêm Milvus hybrid search (dense + sparse)
- Tích hợp Google Slides export
- Xây dựng Voice Chat AI

---

## Tuần 4 — 04/05/2026 → 10/05/2026

**Thành viên:** Vũ Trung Lập, Nguyễn Văn Hiếu, Nguyễn Việt Hoàng

### Đã làm

- **[Lập]** Xây dựng Chatbot RAG hoàn chỉnh với LangGraph: Intent Classification → Retrieve → Grade → Web Search → Generate
- **[Lập]** Tích hợp Milvus Hybrid Search (dense vector + BM25 sparse)
- **[Lập]** Thêm Long-term Memory cho chatbot (nén lịch sử hội thoại theo session)
- **[Lập]** Thêm Tavily Web Search khi tài liệu nội bộ không đủ thông tin
- **[Lập]** Implement SSE (Server-Sent Events) cho real-time token streaming
- **[Lập]** Fix resource leak và connection pool exhaustion trong SSE endpoint
- **[Lập]** Fix Quiz integrity, versioning logic và pipeline optimization
- **[Lập]** Optimize SSE performance và frontend state sync
- **[Hiếu]** Build Credit/Subscription system: deduct credit theo usage
- **[Hiếu]** Tích hợp VietQR cho credit top-up
- **[Hiếu]** Fix billing history UI và admin credit management
- **[Hoàng]** Xây dựng Google Slides integration (create/export slide deck)
- **[Hoàng]** Thêm Voice Chat AI với Azure TTS
- **[Hoàng]** Fix chat-tab UI, cải thiện UX của slide tab

### Khó nhất tuần này

- LangGraph state management phức tạp: việc serialize Pydantic model vào graph state gây nhiều lỗi không rõ ràng
- SSE connection pool exhaustion: nhiều client kết nối đồng thời làm cạn kiệt DB connection pool
- MilvusDB hybrid search cần cấu hình đúng collection schema ngay từ đầu, khó sửa sau

### AI tool đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Gemini) | Thiết kế LangGraph workflow, debug SSE resource leak, thiết kế Milvus schema, debug Credit system | Giải quyết connection pool bug, retrieval chính xác hơn ~30%, payment-credit ổn định |
| GitHub Copilot | Implement Google Slides, Azure TTS voice chat, chat-tab UI (Hoàng) | Hoàn thành 3 tính năng lớn trong 1 tuần |

### Học được

- LangGraph cần `RunnableConfig` được truyền qua mọi node để tránh context loss
- SSE endpoint nên dùng session riêng cho mỗi request, không share DB session với main thread
- Milvus hybrid search cần normalize score trước khi merge dense + sparse results

### Nếu làm lại, sẽ làm khác

- Thiết kế Agent State schema trước khi implement node, tránh refactor giữa chừng
- Test SSE với nhiều concurrent client ngay từ đầu (load test sớm)

### Kế hoạch tuần tới

- Tối ưu Voice Conversation: đọc sau khi gen xong thay vì đọc từng câu
- Tối ưu prompt chatbot cho câu trả lời ngắn gọn hơn (4-5 dòng)
- Fix các cảnh báo Pydantic v2 trong console
- Chuẩn bị tài liệu nộp: Architecture Diagram, Video Demo, README

---

## Tuần 5 — 11/05/2026 → 17/05/2026

**Thành viên:** Vũ Trung Lập, Nguyễn Văn Hiếu, Nguyễn Việt Hoàng

### Đã làm

- **[Lập]** Tối ưu Voice Conversation: chuyển sang "Wait-to-Speak" (đọc sau khi AI gen xong hoàn toàn)
- **[Lập]** Implement Sentence Queue với timeout 15s để tránh hệ thống bị treo
- **[Lập]** Thêm Agentic RAG: SUMMARY_QUERY intent đi thẳng đến Generate, bỏ qua Retrieve
- **[Lập]** Fix tất cả cảnh báo Pydantic v2 (`PydanticSerializationUnexpectedValue`) toàn hệ thống
- **[Lập]** Tối ưu mindmap rendering: hỗ trợ math formula (LaTeX), sửa display keyword
- **[Lập]** Sửa lỗi hydration mismatch và Blocking I/O trong Next.js
- **[Lập]** Thêm math formula support trong mindmap
- **[Hoàng]** Fix deploy lên production (Cloudflare Tunnel / Vercel)
- **[Hoàng]** Fix UI responsive cho mobile
- **[Hiếu]** Fix UI credit usage history và xóa session upload khi hết credit
- **[Hiếu]** Fix logo website

### Khó nhất tuần này

- Voice Chat timing rất khó: đọc từng câu thì đứt đoạn, đợi xong toàn bộ thì trễ → cần cân bằng UX và latency
- Pydantic v2 serialize cảnh báo không thể chặn bằng `filterwarnings` ở cấp module vì LangChain load trước
- Giải pháp cuối: đặt filter ở `app/ai/extractor.py` với `category=UserWarning, module="pydantic"` mới chặn được triệt để

### AI tool đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Claude Sonnet) | Debug Voice Chat timing, fix Pydantic warnings, viết JOURNAL/WORKLOG từ git history | Ổn định luồng voice, tài liệu submission đầy đủ |
| Antigravity (Gemini) | Fix credit history UI, debug upload session khi hết credit | UI credit ổn định, không còn lỗi edge case |
| GitHub Copilot | Fix production deployment, debug Cloudflare Tunnel, responsive UI (Hoàng) | Deploy thành công lên production |

### Học được

- Voice UX: "Đợi xong mới đọc" tốt hơn "Đọc từng câu" về mặt âm thanh, nhưng cần UI indicator để user biết AI đang xử lý
- `warnings.filterwarnings` với `category=UserWarning, module="pydantic"` mạnh hơn chỉ filter theo `message`
- Khi debug closure bug trong React, `useRef` đáng tin cậy hơn `useState` cho các trạng thái voice/audio

### Nếu làm lại, sẽ làm khác

- Viết UI indicator "AI đang suy nghĩ" từ sớm, không đợi đến cuối mới thêm
- Test Voice Chat trên nhiều trình duyệt (Chrome/Edge/Safari) sớm hơn — Web Speech API không đồng nhất

### Kết quả đạt được

Hệ thống **InsightAI** đã hoàn chỉnh với các tính năng:
- Upload Video/Audio/PDF/YouTube → AI tự động trích xuất Summary, Lessons, Quiz, Mindmap
- Chatbot RAG với Agentic flow (LangGraph), Hybrid Search (Milvus), Web Search (Tavily)
- Voice Conversation với Azure TTS
- Credit system với ZaloPay/MoMo/VietQR
- Google Slides export
- Admin dashboard quản lý user và AI logs
- Deploy trên Vercel (FE) + Cloudflare/Render (BE)
