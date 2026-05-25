<!-- # Worklog

Ghi lại các quyết định kỹ thuật, phân công, và brainstorming của nhóm.

> Cập nhật **bất cứ khi nào** nhóm ra quyết định kỹ thuật quan trọng hoặc thay đổi hướng đi.

---

## Template

### Quyết định kỹ thuật

```markdown
### [ADR-N] Tiêu đề quyết định — DD/MM/YYYY

**Bối cảnh:** Vấn đề cần giải quyết là gì?

**Các lựa chọn đã xem xét:**

- Option A: ...
- Option B: ...

**Quyết định:** Chọn option nào và tại sao.

**Hệ quả:** Những gì bị ảnh hưởng / trade-off.
```

### Phân công

```markdown
### Sprint N — DD/MM → DD/MM/YYYY

| Task | Người làm | Deadline | Trạng thái |
| ---- | --------- | -------- | ---------- |
|      |           |          |            |
```

### Brainstorming

```markdown
### Brainstorm: [Chủ đề] — DD/MM/YYYY

**Câu hỏi:** ...

**Các ý tưởng:**

- Ý tưởng 1: ...
- Ý tưởng 2: ...

**Kết luận:** ...
```

---

## Ví dụ

### [ADR-1] Dùng TypeScript thay vì Python — 30/03/2026

**Bối cảnh:** Cả nhóm cần chọn 1 ngôn ngữ chính để xây dựng agent. Có 2 thành viên quen Python, 1 thành viên quen TypeScript.

**Các lựa chọn đã xem xét:**

- **Python**: Ecosystem ML tốt hơn, syntax đơn giản, thành viên quen hơn.
- **TypeScript**: Type safety, dễ refactor khi project lớn, nhiều library AI mới ra bản TS trước.

**Quyết định:** Chọn TypeScript vì project này focus vào agent architecture, không cần ML library nặng. Type safety sẽ giúp bắt lỗi sớm hơn khi codebase phình ra.

**Hệ quả:** 2 thành viên Python cần học TypeScript cơ bản (ước tính 1 tuần). Sẽ không dùng được `langchain` Python trực tiếp.

---

### [ADR-2] Lưu conversation history bằng file JSON — 03/04/2026

**Bối cảnh:** Agent cần nhớ context giữa các lần chạy. Cần chọn storage.

**Các lựa chọn đã xem xét:**

- **In-memory array**: Đơn giản nhất nhưng mất khi restart.
- **File JSON**: Persistent, không cần setup, dễ inspect bằng tay.
- **SQLite**: Có thể query, tốt cho production nhưng overkill cho prototype.
- **Redis**: Fast nhưng cần chạy thêm service.

**Quyết định:** File JSON cho giai đoạn prototype. Thiết kế interface `MemoryStore` để sau này swap sang SQLite không cần sửa logic agent.

**Hệ quả:** Không query được theo thời gian hay user. Chấp nhận được ở giai đoạn này.

---

### Sprint 1 — 31/03 → 06/04/2026

| Task                            | Người làm | Deadline | Trạng thái |
| ------------------------------- | --------- | -------- | ---------- |
| Setup TypeScript project + CI   | Văn A     | 01/04    | ✅ Xong    |
| Implement agent loop cơ bản     | Thị B     | 02/04    | ✅ Xong    |
| Tool: `search_web` (Brave API)  | Văn C     | 03/04    | ✅ Xong    |
| Tool: `read_file`, `write_file` | Thị B     | 05/04    | ✅ Xong    |
| Conversation memory (JSON)      | Văn A     | 06/04    | ✅ Xong    |
| README + setup docs             | Văn C     | 06/04    | ✅ Xong    |

---

### Sprint 2 — 07/04 → 13/04/2026

| Task                                     | Người làm | Deadline | Trạng thái  |
| ---------------------------------------- | --------- | -------- | ----------- |
| Fix infinite loop: thêm `max_iterations` | Thị B     | 08/04    | 🔄 Đang làm |
| Tool: `run_tests` (chạy pytest)          | Văn C     | 10/04    | ⏳ Chờ      |
| Sliding window memory                    | Văn A     | 09/04    | ⏳ Chờ      |
| Demo prep + slides                       | Cả nhóm   | 13/04    | ⏳ Chờ      |

---

### Brainstorm: Tính năng cho demo — 05/04/2026

**Câu hỏi:** Demo tuần tới nên show gì để ấn tượng nhất trong 5 phút?

**Các ý tưởng:**

- **Ý tưởng 1 (Văn A):** Cho agent đọc 1 file Python có bug, tự fix, rồi chạy test để verify. Trực quan, dễ hiểu.
- **Ý tưởng 2 (Thị B):** Agent tự build 1 tính năng nhỏ từ mô tả bằng tiếng Việt. Show khả năng hiểu ngôn ngữ tự nhiên.
- **Ý tưởng 3 (Văn C):** Agent review PR, comment vào từng dòng code có vấn đề. Gần với use case thực tế nhất.

**Pros/Cons:**
| Ý tưởng | Pros | Cons |
|---|---|---|
| Fix bug | Dễ làm, chắc chắn chạy được | Ít "wow" hơn |
| Build từ mô tả | Ấn tượng nhất | Có thể fail nếu prompt phức tạp |
| Review PR | Thực tế, liên quan trực tiếp đến khóa học | Cần setup GitHub webhook |

**Kết luận:** Chọn ý tưởng 1 (fix bug) cho demo chính vì đảm bảo. Nếu còn thời gian sẽ show thêm ý tưởng 2 như bonus.

---

### Bug quan trọng: Tool call loop vô hạn — 04/04/2026

**Triệu chứng:** Agent gọi `search_web` liên tục không dừng khi tool trả về lỗi network.

**Root cause:** Không có stop condition khi tool raise exception. Agent nhận `"error": "timeout"` nhưng interpret là cần thử lại.

**Fix:** Thêm 2 điều kiện dừng:

1. `max_iterations = 10` — hard stop sau 10 vòng
2. Nếu tool trả về lỗi 3 lần liên tiếp → dừng và báo user

**Code thay đổi:** `src/agent.ts` lines 45-67

**Học được:** Luôn thiết kế stop condition trước khi implement retry logic. -->

---

# Worklog thực tế — Team 152

**Thành viên:**

- **Vũ Trung Lập** (LapVT) — Backend AI & Pipeline
- **Nguyễn Văn Hiếu** (HieuNV) — Frontend & Auth & Payment
- **Nguyễn Việt Hoàng** (NguyenVietHoang) — Deploy, CI/CD & Frontend Feature

---

## Quyết định kỹ thuật

### [ADR-1] FastAPI BackgroundTasks + SSE thay vì Celery — 14/04/2026

**Bối cảnh:** Pipeline AI (transcription + extraction + embedding) mất 1–3 phút/file, không thể chạy trong request-response thông thường.

**Các lựa chọn đã xem xét:**

- **Celery + Redis:** Mạnh, scalable nhưng phức tạp, cần thêm 2 service cho team nhỏ.
- **FastAPI BackgroundTasks:** Đơn giản, không cần service phụ, phù hợp scale hiện tại.
- **Webhook-based job queue:** Quá phức tạp cho giai đoạn prototype.

**Quyết định:** Dùng FastAPI BackgroundTasks để chạy pipeline ngầm, kết hợp SSE để push tiến trình real-time về Frontend.

**Hệ quả:** Frontend không cần polling, biết ngay khi pipeline xong. Trade-off: nếu server restart thì job đang chạy bị mất — chấp nhận được ở giai đoạn này.

---

### [ADR-2] Chọn Supabase làm Auth + Database + Storage — 12/04/2026

**Bối cảnh:** Cần Auth (Email/Google/Facebook), Database PostgreSQL, và File Storage trong một giải pháp duy nhất, free tier.

**Các lựa chọn đã xem xét:**

- **Firebase:** Auth + Storage tốt nhưng NoSQL, không phù hợp dữ liệu có quan hệ.
- **Supabase:** PostgreSQL + Auth + Storage + RLS + Realtime trong 1 platform, free tier hào phóng.
- **Self-hosted Postgres + Auth0:** Phức tạp, tốn tiền.

**Quyết định:** Chọn Supabase — đáp ứng đủ mọi nhu cầu với free tier.

**Hệ quả:** Bị ràng buộc vào Supabase ecosystem. RLS cần được thiết kế cẩn thận ngay từ đầu, nếu không sẽ có lỗ hổng bảo mật data isolation.

---

### [ADR-3] Migrate Vector DB từ ChromaDB sang Milvus Hybrid Search — 13/05/2026

**Bối cảnh:** ChromaDB chỉ có dense vector search, không tìm được từ khóa kỹ thuật chính xác (exact keyword match), kết quả retrieval kém với câu hỏi ngắn.

**Các lựa chọn đã xem xét:**

- **ChromaDB:** Đang dùng, đơn giản nhưng thiếu sparse/keyword search.
- **Milvus:** Hybrid Search (dense BM25 sparse), scalable, self-hostable.
- **Weaviate:** Có hybrid nhưng tốn RAM hơn Milvus với cùng scale.

**Quyết định:** Migrate sang Milvus với Hybrid Search (dense embedding + BM25 sparse), normalize score trước khi merge.

**Hệ quả:** Retrieval chính xác hơn ~30% với câu hỏi kỹ thuật cụ thể. Tăng complexity setup, cần Milvus running service.

---

### [ADR-4] Chatbot Simple RAG → LangGraph Agentic RAG — 14/05/2026

**Bối cảnh:** Simple RAG không phân biệt được loại câu hỏi (tóm tắt vs chi tiết), không có web search fallback khi tài liệu nội bộ không đủ.

**Các lựa chọn đã xem xét:**

- **Simple RAG:** Retrieve → Generate. Nhanh nhưng dùng token lãng phí cho câu hỏi tóm tắt.
- **LangGraph state machine:** Routing thông minh: `analyze_intent → retrieve/skip → grade → web_search → generate`.
- **ReAct agent (vòng lặp):** Linh hoạt nhưng khó kiểm soát số bước, dễ loop.

**Quyết định:** Dùng LangGraph với 5 node: `analyze_intent`, `retrieve`, `grade`, `web_search`, `generate`. Intent routing quyết định có cần Retrieve hay không.

**Hệ quả:** Giảm token usage với câu hỏi tóm tắt (bỏ qua Retrieve). Phức tạp hơn để debug khi node bị lỗi. Pydantic serialization cần xử lý cẩn thận với LangGraph state.

---

### [ADR-5] Voice Chat: Streaming TTS → Wait-to-Speak — 16/05/2026

**Bối cảnh:** Streaming TTS (đọc từng câu khi AI gen) gây đứt đoạn, xung đột audio queue.

**Các lựa chọn đã xem xét:**

- **Streaming (đọc từng câu):** Phản hồi nhanh nhưng âm thanh bị chop, không tự nhiên.
- **Wait-to-Speak (đợi gen xong mới đọc):** Trễ hơn nhưng liền mạch, tự nhiên.
- **Browser TTS (không cần Azure):** Không tốn phí nhưng giọng "robot", chất lượng kém.

**Quyết định:** Wait-to-Speak cho Voice mode. Text vẫn stream real-time để user thấy AI "đang viết", sau khi xong mới đọc toàn bộ một lần.

**Hệ quả:** Tăng perceived latency ~2–3s so với streaming. Mic tự động bật lại sau khi đọc xong, trải nghiệm hội thoại liền mạch hơn.

---

### [ADR-6] Payment: ZaloPay + MoMo + VietQR — 28/04/2026

**Bối cảnh:** Cần cổng thanh toán Việt Nam cho hệ thống credit. Muốn tối đa tỷ lệ chuyển đổi.

**Các lựa chọn đã xem xét:**

- **Chỉ 1 cổng:** Đơn giản nhất nhưng bỏ lỡ user chỉ dùng 1 app cụ thể.
- **ZaloPay + MoMo + VietQR:** Phủ hầu hết người dùng Việt Nam, VietQR không tốn phí hoa hồng.

**Quyết định:** Hỗ trợ cả 3, VietQR là default vì không phí. ZaloPay/MoMo cho tiện lợi.

**Hệ quả:** 3 webhook endpoint cần debug riêng. Mỗi gateway có quirk riêng về signature verification (đặc biệt ZaloPay với field `message`).

---

## Phân công

### Sprint 1 — 12/04 → 19/04/2026

| Task                                                | Người làm         | Deadline | Trạng thái |
| --------------------------------------------------- | ----------------- | -------- | ---------- |
| Setup Supabase Auth (Email/Google/Facebook)         | Nguyễn Văn Hiếu   | 13/04    | ✅ Xong    |
| Edit Profile, Reset Password, Change Password       | Nguyễn Văn Hiếu   | 16/04    | ✅ Xong    |
| Backend FastAPI: AI extraction pipeline + Vector DB | Vũ Trung Lập      | 15/04    | ✅ Xong    |
| Mindmap visualization UI + backend integration      | Vũ Trung Lập      | 16/04    | ✅ Xong    |
| Admin Dashboard + RBAC                              | Nguyễn Việt Hoàng | 19/04    | ✅ Xong    |
| Payment page UI + Auth business logic               | Nguyễn Việt Hoàng | 19/04    | ✅ Xong    |

---

### Sprint 2 — 20/04 → 26/04/2026

| Task                                                        | Người làm         | Deadline | Trạng thái |
| ----------------------------------------------------------- | ----------------- | -------- | ---------- |
| Video processing + Multimodal extraction (Whisper + Vision) | Vũ Trung Lập      | 25/04    | ✅ Xong    |
| Audio Live Recording (ghi âm theo chunk)                    | Vũ Trung Lập      | 25/04    | ✅ Xong    |
| AI Cost Monitoring + Custom API Key per user                | Vũ Trung Lập      | 26/04    | ✅ Xong    |
| Pricing page + VietQR integration                           | Nguyễn Văn Hiếu   | 24/04    | ✅ Xong    |
| CI/CD GitHub Actions (Frontend pnpm + Backend Ruff)         | Nguyễn Việt Hoàng | 23/04    | ✅ Xong    |
| Deploy Frontend lên Vercel                                  | Nguyễn Việt Hoàng | 25/04    | ✅ Xong    |
| Notifications system + Banner                               | Nguyễn Việt Hoàng | 26/04    | ✅ Xong    |

---

### Sprint 3 — 27/04 → 03/05/2026

| Task                                                       | Người làm         | Deadline | Trạng thái |
| ---------------------------------------------------------- | ----------------- | -------- | ---------- |
| Tối ưu pipeline (parallel Whisper, single-pass extraction) | Vũ Trung Lập      | 03/05    | ✅ Xong    |
| Media timestamp schema + Click-to-navigate keyword         | Vũ Trung Lập      | 01/05    | ✅ Xong    |
| PDF viewer tích hợp + AI request logging                   | Vũ Trung Lập      | 03/05    | ✅ Xong    |
| ZaloPay + MoMo webhook integration                         | Nguyễn Văn Hiếu   | 03/05    | ✅ Xong    |
| VietQR auto-refresh + Admin User Management                | Nguyễn Văn Hiếu   | 03/05    | ✅ Xong    |
| Chatbox logic cơ bản + Notifications preview               | Nguyễn Việt Hoàng | 03/05    | ✅ Xong    |
| Migrate file storage sang Supabase Storage                 | Nguyễn Việt Hoàng | 05/05    | ✅ Xong    |

---

### Sprint 4 — 04/05 → 10/05/2026

| Task                                                             | Người làm         | Deadline | Trạng thái |
| ---------------------------------------------------------------- | ----------------- | -------- | ---------- |
| LangGraph Agentic RAG (5 node: intent/retrieve/grade/search/gen) | Vũ Trung Lập      | 08/05    | ✅ Xong    |
| Milvus Hybrid Search (dense + BM25 sparse)                       | Vũ Trung Lập      | 13/05    | ✅ Xong    |
| Long-term Memory + SSE token streaming                           | Vũ Trung Lập      | 07/05    | ✅ Xong    |
| Fix SSE resource leak + Quiz versioning                          | Vũ Trung Lập      | 07/05    | ✅ Xong    |
| Credit/Subscription system + VietQR top-up                       | Nguyễn Văn Hiếu   | 10/05    | ✅ Xong    |
| Google Slides integration                                        | Nguyễn Việt Hoàng | 08/05    | ✅ Xong    |
| Azure TTS Voice Chat + Chat-tab UI                               | Nguyễn Việt Hoàng | 10/05    | ✅ Xong    |

---

### Sprint 5 — 11/05 → 17/05/2026

| Task                                             | Người làm         | Deadline | Trạng thái |
| ------------------------------------------------ | ----------------- | -------- | ---------- |
| Voice "Wait-to-Speak" + Mic auto-restart sau TTS | Vũ Trung Lập      | 16/05    | ✅ Xong    |
| Fix Pydantic v2 warnings toàn hệ thống           | Vũ Trung Lập      | 16/05    | ✅ Xong    |
| Math formula support (LaTeX) trong Mindmap       | Vũ Trung Lập      | 15/05    | ✅ Xong    |
| Fix Hydration Mismatch + Blocking I/O Next.js    | Vũ Trung Lập      | 13/05    | ✅ Xong    |
| Agentic RAG: SUMMARY_QUERY intent routing        | Vũ Trung Lập      | 14/05    | ✅ Xong    |
| Credit history UI + Fix upload khi hết credit    | Nguyễn Văn Hiếu   | 15/05    | ✅ Xong    |
| Production deployment + UI responsive fix        | Nguyễn Việt Hoàng | 16/05    | ✅ Xong    |

---

## Brainstorming

### Brainstorm: Kiến trúc AI Chatbot — 12/05/2026

**Câu hỏi:** Chatbot nên chỉ search trong tài liệu đã upload hay cần có khả năng search web?

**Các ý tưởng:**

- **Ý tưởng 1 (Lập):** RAG thuần — chỉ search tài liệu nội bộ. Đơn giản, ít token, nhưng trả lời "không biết" quá nhiều khi câu hỏi nằm ngoài tài liệu.
- **Ý tưởng 2 (Hoàng):** Luôn search web — đầy đủ nhưng tốn token, chậm, không cần thiết khi tài liệu đã có câu trả lời.
- **Ý tưởng 3 (Lập):** Agentic: Retrieve trước → Grade xem có đủ không → Nếu không đủ mới Web Search. Tốt nhất về chất lượng.

**Kết luận:** Chọn ý tưởng 3 — Agentic RAG với LangGraph. Grader LLM quyết định "tài liệu có đủ thông tin không" trước khi fallback ra web.

---

### Brainstorm: Tính năng nào ưu tiên cho tuần cuối — 11/05/2026

**Câu hỏi:** Còn 1 tuần, nên tập trung hoàn thiện tính năng nào để tạo ấn tượng nhất cho demo?

**Các ý tưởng:**

- **Ý tưởng 1 (Lập):** Hoàn thiện Voice Chat — tính năng độc đáo nhất, khác biệt so với các team khác.
- **Ý tưởng 2 (Hiếu):** Hoàn thiện Payment flow — cần thiết nếu muốn thể hiện sản phẩm thực tế.
- **Ý tưởng 3 (Hoàng):** Tập trung deploy ổn định + responsive UI — BTC chỉ chấm nếu live URL hoạt động.

**Kết luận:** Làm cả 3 song song: Lập lo Voice + Agentic RAG, Hiếu lo Credit UI, Hoàng lo Deploy. Ưu tiên deploy trước — không có live URL thì không được chấm điểm kỹ thuật.

---

## Bug quan trọng

### Bug: SSE Connection Pool Exhaustion — 07/05/2026

**Triệu chứng:** Server chậm dần sau nhiều client kết nối, cuối cùng không tạo được DB connection mới.

**Root cause:** SSE endpoint giữ DB session mở suốt trong khi streaming (vài phút) → pool cạn kiệt khi nhiều user đồng thời.

**Fix:** Dùng `with Session(engine) as session:` trong từng vòng lặp poll, đóng session ngay sau mỗi lần đọc DB.

**Học được:** SSE/WebSocket endpoint không được share DB session với main thread. Mỗi "tick" nên mở-dùng-đóng session riêng.

---

### Bug: ZaloPay Webhook Signature Mismatch — 07/05/2026

**Triệu chứng:** ZaloPay callback luôn báo signature không hợp lệ dù implement đúng theo docs.

**Root cause:** ZaloPay đôi khi gửi thêm field `message` trong payload, nhưng signature được tính không bao gồm field này → mismatch.

**Fix:** Implement dual-check: tính signature với và không có field `message`, chấp nhận nếu một trong hai khớp.

**Học được:** Đọc kỹ edge case trong docs của payment gateway, đặc biệt về field optional trong payload signature.

---

### Bug: Voice Mic Không Tự Restart Sau TTS — 15/05/2026

**Triệu chứng:** Sau khi AI đọc xong, Mic không tự động bật lại để nghe tiếp.

**Root cause:** React closure bug — callback `onEnd` của Azure TTS capture giá trị cũ của `isVoiceConversationActiveRef` (false) do re-render xảy ra trước khi callback được gọi.

**Fix:** Chuyển toàn bộ trạng thái voice/audio từ `useState` sang `useRef` để callback luôn đọc được giá trị mới nhất, không bị closure stale.

**Học được:** Với async callback (audio events, timers), dùng `useRef` thay vì `useState` để tránh stale closure.

---

### Bug: Mindmap LLM Call Treo Pipeline — 11/05/2026

**Triệu chứng:** Pipeline bị treo vô hạn với tài liệu dài khi Mindmap generation không response.

**Root cause:** LLM call cho mindmap không có timeout — nếu model "suy nghĩ" quá lâu, pipeline chờ mãi.

**Fix:** Bọc tất cả LLM call trong `asyncio.wait_for(..., timeout=60)`. Nếu timeout, trả về mindmap placeholder và cho phép user bấm "Tạo lại".

**Học được:** Mọi LLM call đều phải có timeout. Không có exception nào nên treo pipeline hoàn toàn.
