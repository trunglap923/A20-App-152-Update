import json
import warnings
# Ẩn các cảnh báo Pydantic v2 dư thừa khi LangChain thực hiện structured output
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
import re
import time
import uuid
import asyncio
import os
from typing import Any, List, Optional
from langchain_core.output_parsers import StrOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.ai.providers import get_chat_provider
from app.ai.prompts import (
    PROMPT_EXTRACT_ALL, 
    PROMPT_SYNTHESIS_SUMMARY, 
    PROMPT_SYNTHESIS_MINDMAP,
    PROMPT_MAP_MINDMAP,
    PROMPT_OUTLINE, 
    PROMPT_WRITE_LESSON, 
    PROMPT_GENERATE_QUIZZES
)
from app.ai.schemas import (
    FullExtraction, 
    Outline, 
    LessonItem, 
    QuizList, 
    SummaryOnly, 
    MindmapOnly,
    SynthesisMindmapOnly
)

# --- UTILITIES (Fail-safes) ---
def repair_json(text: str) -> str:
    """Sửa lỗi JSON bị cắt cụt bằng cách đóng các ngoặc còn thiếu."""
    stack = []
    in_string = False
    escape = False
    for char in text:
        if escape: escape = False; continue
        if char == '\\': escape = True; continue
        if char == '"' and not escape: in_string = not in_string; continue
        if not in_string:
            if char == '{': stack.append('}')
            elif char == '[': stack.append(']')
            elif char == '}': 
                if stack and stack[-1] == '}': stack.pop()
            elif char == ']':
                if stack and stack[-1] == ']': stack.pop()
    if in_string: text += '"'
    text = text.rstrip(': ,')
    if text.strip().endswith('"') and not re.search(r':\s*"?$', text):
        text += ': null'
    while stack: text += stack.pop()
    return text

def bulletproof_json_repair(text: str) -> str:
    """Xử lý ngoặc kép lồng nhau và dấu phẩy gây lỗi format."""
    new_str = ""
    last_pos = 0
    for match in re.finditer(r'"', text):
        pos = match.start()
        left_part = text[:pos].rstrip()
        left_char = left_part[-1] if left_part else ""
        right_part = text[pos+1:].lstrip()
        right_char = right_part[0] if right_part else ""
        
        is_structural = False
        if left_char in '{[,:': is_structural = True
        if right_char == ':': is_structural = True
        if right_char in '}]': is_structural = True
        if right_char == ',':
            after_comma = right_part[1:].lstrip()
            if after_comma and after_comma[0] in '"[{': is_structural = True
        
        new_str += text[last_pos:pos]
        new_str += '"' if is_structural else '\\"'
        last_pos = pos + 1
    new_str += text[last_pos:]
    return new_str

def parse_json_safe(raw_text: str) -> dict:
    """Parse JSON an toàn với các bộ lọc fail-safe."""
    if not raw_text: return {}
    text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*(.*?)\s*(?:```|$)", text, re.DOTALL)
    if match: text = match.group(1).strip()
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    
    first_brace = text.find("{")
    if first_brace == -1: first_brace = text.find("[")
    json_str = text[first_brace:] if first_brace != -1 else text
    
    try: return json.loads(json_str, strict=False)
    except: pass

    fixed = bulletproof_json_repair(json_str)
    try:
        repaired = repair_json(fixed)
        return json.loads(repaired, strict=False)
    except: return {}


# --- CROSS-PROVIDER TOKEN HELPER ---
def _extract_usage(raw_message) -> tuple[int, int]:
    """
    Trích xuất token usage từ AIMessage raw.
    LangChain chuẩn hóa usage_metadata cho TẤT CẢ providers từ v0.3+:
      - OpenAI    → input_tokens, output_tokens
      - Gemini    → input_tokens, output_tokens
      - Anthropic → input_tokens, output_tokens
      - Grok      → input_tokens, output_tokens (OpenAI-compatible)
    
    Không dùng get_openai_callback() vì nó chỉ hoạt động với OpenAI.
    """
    if raw_message is None:
        return 0, 0
    usage = getattr(raw_message, "usage_metadata", None) or {}
    input_tokens  = usage.get("input_tokens",  0) or 0
    output_tokens = usage.get("output_tokens", 0) or 0
    return input_tokens, output_tokens


# --- AI LOG HELPER ---
def _save_ai_log(
    user_id: Optional[str],
    item_id: Optional[str],
    task_type: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    success: bool,
    prompt: Optional[str] = None,
    response: Optional[str] = None,
    error_message: Optional[str] = None,
):
    """Ghi 1 bản ghi AILog vào database. Chạy đồng bộ, an toàn trong background thread."""
    log_id = None
    try:
        from app.db.session import engine
        from app.models.ai_logs import AILog
        from sqlalchemy.orm import Session

        MAX_TEXT = 300
        if prompt and len(prompt) > MAX_TEXT:
            prompt = prompt[:MAX_TEXT] + "... [truncated]"
        if response and len(response) > MAX_TEXT:
            response = response[:MAX_TEXT] + "... [truncated]"

        log_id = uuid.uuid4()
        with Session(engine) as session:
            log_entry = AILog(
                id=log_id,
                user_id=uuid.UUID(user_id) if user_id else None,
                item_id=uuid.UUID(item_id) if item_id else None,
                task_type=task_type,
                model_name=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                success=success,
                prompt=prompt,
                response=response,
                error_message=error_message,
            )
            session.add(log_entry)
            session.commit()
    except Exception as e:
        print(f"[AI-LOG] WARNING: Không thể ghi log: {e}")

# --- MAIN CLASS ---
class KnowledgeExtractor:
    def __init__(self, provider: str = "openai", model: str = "gpt-4o-mini", api_key: Optional[str] = None):
        self.llm = get_chat_provider(provider=provider, model=model, api_key=api_key)
        self.provider = provider
        self.model_name = model
        self._api_key = api_key
        self._fallback_applied = False
        self._fallback_lock = asyncio.Lock()
        self.semaphore = asyncio.Semaphore(10)  # Map-Reduce chunks concurrency
        from app.ai.rate_limiter import GLOBAL_LLM_SEMAPHORE
        self.global_semaphore = GLOBAL_LLM_SEMAPHORE
        # Semaphore riêng cho từng loại tác vụ để tránh block lẫn nhau
        self.lesson_semaphore  = asyncio.Semaphore(20)
        self.quiz_semaphore    = asyncio.Semaphore(20)
        self.summary_semaphore = asyncio.Semaphore(5)
        # Splitter cho Map-Reduce (tài liệu ngắn ≤ 8000 chars/chunk)
        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=8000, chunk_overlap=800)
        # Splitter cho tài liệu dài — chunk lớn hơn, ít call hơn
        self.long_text_splitter = RecursiveCharacterTextSplitter(chunk_size=15000, chunk_overlap=1000)
        
        # Context cho logging (được set bởi pipeline trước khi chạy)
        self._user_id: Optional[str] = None
        self._item_id: Optional[str] = None
        
        # Structured Model Bindings — include_raw=True để lấy usage_metadata
        # Hoạt động thống nhất với OpenAI, Gemini, Anthropic, Grok
        self.struct_full              = self.llm.with_structured_output(FullExtraction,         include_raw=True)
        self.struct_outline           = self.llm.with_structured_output(Outline,                include_raw=True)
        self.struct_lesson            = self.llm.with_structured_output(LessonItem,             include_raw=True)
        self.struct_quizzes           = self.llm.with_structured_output(QuizList,               include_raw=True)
        self.struct_summary_only      = self.llm.with_structured_output(SummaryOnly,            include_raw=True)
        self.struct_mindmap_only      = self.llm.with_structured_output(MindmapOnly,            include_raw=True)
        self.struct_map_mindmap       = self.llm.with_structured_output(MindmapOnly,            include_raw=True)  # Map-phase only
        self.struct_synthesis_mindmap = self.llm.with_structured_output(SynthesisMindmapOnly,   include_raw=True)

    def _rebind_structured_outputs(self):
        self.struct_full              = self.llm.with_structured_output(FullExtraction,         include_raw=True)
        self.struct_outline           = self.llm.with_structured_output(Outline,                include_raw=True)
        self.struct_lesson            = self.llm.with_structured_output(LessonItem,             include_raw=True)
        self.struct_quizzes           = self.llm.with_structured_output(QuizList,               include_raw=True)
        self.struct_summary_only      = self.llm.with_structured_output(SummaryOnly,            include_raw=True)
        self.struct_mindmap_only      = self.llm.with_structured_output(MindmapOnly,            include_raw=True)
        self.struct_map_mindmap       = self.llm.with_structured_output(MindmapOnly,            include_raw=True)  # Map-phase only
        self.struct_synthesis_mindmap = self.llm.with_structured_output(SynthesisMindmapOnly,   include_raw=True)

    def _looks_like_invalid_api_key(self, err: Exception) -> bool:
        msg = str(err).lower()
        return (
            "invalid_api_key" in msg
            or "incorrect api key provided" in msg
            or ("401" in msg and "api key" in msg)
        )

    def _get_system_api_key(self) -> Optional[str]:
        env_map = {
            "openai": "OPENAI_API_KEY",
            "google": "GOOGLE_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "grok": "XAI_API_KEY",
        }
        env_name = env_map.get(self.provider)
        if not env_name:
            return None
        key = (os.getenv(env_name) or "").strip().strip('"').strip("'").strip()
        return key or None

    async def _fallback_to_system_key_if_invalid(self, err: Exception) -> bool:
        if self._fallback_applied:
            return False
        if not self._api_key:
            return False
        if not self._looks_like_invalid_api_key(err):
            return False

        async with self._fallback_lock:
            if self._fallback_applied:
                return False
            system_key = self._get_system_api_key()
            if not system_key:
                return False
            if system_key == self._api_key:
                return False

            print(f"[AI-RUNTIME] User API key lỗi 401 cho provider={self.provider}. Fallback -> system key.")
            self.llm = get_chat_provider(provider=self.provider, model=self.model_name, api_key=system_key)
            self._api_key = system_key
            self._fallback_applied = True
            self._rebind_structured_outputs()
            return True
        return False

    def set_context(self, user_id: Optional[str] = None, item_id: Optional[str] = None):
        """Gán user_id và item_id cho logging."""
        self._user_id = user_id
        self._item_id = item_id

    def _log(self, task_type: str, input_tokens: int, output_tokens: int,
             latency_ms: int, success: bool, prompt: str = None,
             response: str = None, error_message: str = None):
        """Shortcut ghi log với context hiện tại."""
        _save_ai_log(
            user_id=self._user_id,
            item_id=self._item_id,
            task_type=task_type,
            model_name=self.model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            success=success,
            prompt=prompt,
            response=response,
            error_message=error_message,
        )

    def _unpack(self, raw_result: dict) -> tuple:
        """
        Giải nén kết quả từ with_structured_output(include_raw=True).
        Trả về (parsed_object, input_tokens, output_tokens).
        
        include_raw=True trả về dict:
          {"raw": AIMessage, "parsed": PydanticModel, "parsing_error": ...}
        """
        parsed = raw_result.get("parsed")
        raw_msg = raw_result.get("raw")
        parsing_error = raw_result.get("parsing_error")
        
        if parsing_error:
            raise ValueError(f"Structured output parsing error: {parsing_error}")
        if parsed is None:
            raise ValueError("Structured output trả về None (model không follow schema)")
        
        input_tokens, output_tokens = _extract_usage(raw_msg)
        return parsed, input_tokens, output_tokens

    def _ensure_unique_ids(self, node: dict, seen_ids: set):
        """Hậu xử lý mindmap để đảm bảo ID không trùng lặp, tránh crash FE."""
        if not node: return
        base_id = node.get("id", "node")
        if not base_id: base_id = "node"
        
        unique_id = base_id
        counter = 1
        while unique_id in seen_ids:
            unique_id = f"{base_id}_{counter}"
            counter += 1
        
        node["id"] = unique_id
        seen_ids.add(unique_id)
        
        for child in node.get("children", []):
            self._ensure_unique_ids(child, seen_ids)

    async def _single_call_analysis(self, text: str, target: str) -> dict:
        """
        Fast Path: Gọi 1-2 LLM calls trực tiếp cho tài liệu ngắn.
        Bỏ qua hoàn toàn bước Map, chạy thẳng Synthesis với toàn bộ text.
        Được dùng khi len(text) <= FAST_PATH_THRESHOLD.
        """
        print(f"[FAST-PATH] Tài liệu ngắn ({len(text):,} chars) — bỏ qua Map phase, gọi LLM trực tiếp")
        t0 = time.time()

        # Dậng text thành dạng summary input gỏn
        synthesis_input = json.dumps({"text": text}, ensure_ascii=False)

        async def _fast_summary():
            t_s = time.time()
            async with self.summary_semaphore: # Dùng semaphore riêng, độ ưu tiên cao
              async with self.global_semaphore:
                raw_result = await self.struct_summary_only.ainvoke(
                    PROMPT_SYNTHESIS_SUMMARY.format(data=synthesis_input)
                )
            res, inp, out = self._unpack(raw_result)
            lat = int((time.time() - t_s) * 1000)
            print(f"[FAST-PATH] Summary xong (Latency: {lat/1000:.2f}s)")
            self._log("Summarize", inp, out, lat, True,
                      prompt=f"[Fast-Path Summary] {len(text)} chars",
                      response=json.dumps(res.model_dump(), ensure_ascii=False)[:500])
            return res

        async def _fast_mindmap():
            MINDMAP_TIMEOUT = 60
            t_m = time.time()
            compact_input = text
            async with self.semaphore:
              async with self.global_semaphore:
                try:
                    raw_result = await asyncio.wait_for(
                        self.struct_map_mindmap.ainvoke(
                            PROMPT_MAP_MINDMAP.format(text=compact_input)
                        ),
                        timeout=MINDMAP_TIMEOUT
                    )
                    res, inp, out = self._unpack(raw_result)
                    lat = int((time.time() - t_m) * 1000)
                    print(f"[FAST-PATH] Mindmap xong (Latency: {lat/1000:.2f}s)")
                    self._log("Mindmap", inp, out, lat, True)
                    return res.mindmap.model_dump()
                except asyncio.TimeoutError:
                    lat = int((time.time() - t_m) * 1000)
                    print(f"[FAST-PATH] Mindmap ⏱ TIMEOUT sau {MINDMAP_TIMEOUT}s — Trả về fallback")
                    self._log("Mindmap", 0, 0, lat, False, error_message=f"Timeout after {MINDMAP_TIMEOUT}s")
                    return {"id": "root", "label": "Sơ đồ quá tải", "children": [{"id": "error", "label": "Vui lòng bấm 'Tạo lại'"}]}
                except Exception as e:
                    lat = int((time.time() - t_m) * 1000)
                    import traceback
                    print(f"[FAST-PATH] Mindmap lỗi: {traceback.format_exc()} — Trả về fallback")
                    self._log("Mindmap", 0, 0, lat, False, error_message=str(e))
                    return {"id": "root", "label": "Lỗi tạo Sơ đồ", "children": [{"id": "error", "label": "Vui lòng thử lại sau"}]}

        # Chạy song song Summary + Mindmap
        summary_task = _fast_summary() if target in ("both", "summary") else asyncio.sleep(0, result=None)
        mindmap_task = _fast_mindmap() if target in ("both", "mindmap") else asyncio.sleep(0, result=None)
        summary_res, mindmap_res = await asyncio.gather(summary_task, mindmap_task)

        final = {}
        if summary_res:
            final["summary"] = summary_res.summary.model_dump()
        if mindmap_res and isinstance(mindmap_res, dict) and mindmap_res.get("children"):
            self._ensure_unique_ids(mindmap_res, set())
            final["mindmap"] = mindmap_res
        elif target in ("both", "mindmap"):
            print(f"[FAST-PATH] ⚠ Mindmap không có dữ liệu — sẽ không lưu vào DB")
            final["_mindmap_failed"] = True

        lat_total = int((time.time() - t0) * 1000)
        print(f"[FAST-PATH] Hoàn tất (Total: {lat_total/1000:.2f}s)")
        return final

    async def analyze_long_text(self, text: str, target: str = "both") -> dict:
        """Phân tích tài liệu: tự động chọn Fast-Path (ngắn) hoặc Map-Reduce (dài)."""
        FAST_PATH_THRESHOLD = 50_000  # chars — ~12,500 tokens, an toàn cho gpt-4o-mini
        if len(text) <= FAST_PATH_THRESHOLD:
            return await self._single_call_analysis(text, target)

        # MAP-REDUCE cho tài liệu dài: dùng chunk lớn hơn (15,000 chars) để giảm số chunks
        chunks = self.long_text_splitter.split_text(text)
        if not chunks: return {}
        print(f"[MAP-REDUCE] Tổng số chunks: {len(chunks)} (chunk_size=15000, Target: {target})")

        # Stage 1: Map (Parallel) — Timeout 90s/chunk để tránh treo pipeline
        CHUNK_TIMEOUT = 90  # seconds

        async def process_chunk(chunk_idx, chunk):
            t0 = time.time()
            # Tối ưu: khi chỉ cần Mindmap, dùng prompt/schema nhẹ hơn — bỏ qua bước sinh Summary thừa
            mindmap_only_mode = (target == "mindmap")
            if mindmap_only_mode:
                prompt_text = PROMPT_MAP_MINDMAP.format(text=chunk)
                struct = self.struct_map_mindmap
                mode_label = "[MINDMAP-ONLY]"
            else:
                prompt_text = PROMPT_EXTRACT_ALL.format(text=chunk)
                struct = self.struct_full
                mode_label = "[FULL]"
            print(f"[MAP] Chunk {chunk_idx} {mode_label}: Bắt đầu ({len(chunk):,} ký tự)...")
            async with self.semaphore:
              async with self.global_semaphore:
                t_api = time.time()
                try:
                    raw_result = await asyncio.wait_for(
                        struct.ainvoke(prompt_text),
                        timeout=CHUNK_TIMEOUT
                    )
                    res, input_tokens, output_tokens = self._unpack(raw_result)
                    latency = int((time.time() - t0) * 1000)
                    # Chuẩn hóa output: mindmap_only trả về MindmapOnly, full trả về FullExtraction
                    if mindmap_only_mode:
                        mm = res.mindmap.model_dump()
                        dumped = {"mindmap": mm}
                    else:
                        dumped = res.model_dump()
                        mm = dumped.get("mindmap", {})
                    n_children = len(mm.get("children", [])) if mm else 0
                    print(f"[MAP] Chunk {chunk_idx} {mode_label}: ✅ HOÀN TẤT | mindmap root='{mm.get('label','?')}', level-1={n_children} (Latency: {latency/1000:.2f}s)")
                    self._log("Extract", input_tokens, output_tokens, latency, True,
                              prompt=f"[Map chunk {chunk_idx}] {chunk[:200]}",
                              response=json.dumps(dumped, ensure_ascii=False)[:500])
                    return dumped
                except asyncio.TimeoutError:
                    latency = int((time.time() - t_api) * 1000)
                    print(f"[MAP] Chunk {chunk_idx}: ⏱ TIMEOUT sau {CHUNK_TIMEOUT}s — bỏ qua chunk này")
                    self._log("Extract", 0, 0, latency, False, error_message=f"Timeout after {CHUNK_TIMEOUT}s")
                    return {}
                except Exception as e:
                    switched = await self._fallback_to_system_key_if_invalid(e)
                    if switched:
                        try:
                            raw_result = await asyncio.wait_for(
                                struct.ainvoke(prompt_text),
                                timeout=CHUNK_TIMEOUT
                            )
                            res, input_tokens, output_tokens = self._unpack(raw_result)
                            latency = int((time.time() - t0) * 1000)
                            if mindmap_only_mode:
                                mm = res.mindmap.model_dump()
                                dumped = {"mindmap": mm}
                            else:
                                dumped = res.model_dump()
                                mm = dumped.get("mindmap", {})
                            n_children = len(mm.get("children", [])) if mm else 0
                            print(f"[MAP] Chunk {chunk_idx} {mode_label}: ✅ HOÀN TẤT sau fallback key | mindmap root='{mm.get('label','?')}', level-1={n_children} (Latency: {latency/1000:.2f}s)")
                            self._log("Extract", input_tokens, output_tokens, latency, True,
                                      prompt=f"[Map chunk {chunk_idx}] {chunk[:200]}",
                                      response=json.dumps(dumped, ensure_ascii=False)[:500])
                            return dumped
                        except Exception as retry_err:
                            e = retry_err
                    latency = int((time.time() - t0) * 1000)
                    print(f"[MAP] Chunk {chunk_idx}: ❌ LỖI: {e} (Latency: {latency/1000:.2f}s)")
                    self._log("Extract", 0, 0, latency, False, error_message=str(e))
                    return {}

        results = await asyncio.gather(*[process_chunk(i, c) for i, c in enumerate(chunks)])

        # Aggregate results for Reduce
        data_pool = {"tldr": [], "detailed": [], "highlights": [], "mindmap_nodes": []}
        for r in results:
            if not r: continue
            s = r.get("summary", {})
            data_pool["tldr"].extend(s.get("tldr", []))
            data_pool["detailed"].append(s.get("detailed", ""))
            data_pool["highlights"].extend(s.get("highlights", []))
            if r.get("mindmap"): data_pool["mindmap_nodes"].append(r["mindmap"])

        print(f"[MAP-REDUCE] Số mindmap_nodes từ Map phase: {len(data_pool['mindmap_nodes'])}")

        # Stage 2: Reduce (Synthesis)
        synthesis_input_summary = json.dumps({
            "tldr": data_pool["tldr"],
            "detailed_segments": data_pool["detailed"],
            "highlights": data_pool["highlights"]
        }, ensure_ascii=False)

        def _compact_node(node: dict, depth: int = 0, max_depth: int = 6) -> dict | None:
            """Nén node mindmap: chỉ giữ label, cắt tối đa 6 cấp, bỏ id."""
            if not node or depth >= max_depth:
                return None
            compact = {"label": node.get("label", "")}
            children = node.get("children", [])
            if children and depth < max_depth - 1:
                compact_kids = [_compact_node(c, depth + 1, max_depth) for c in children]
                compact["children"] = [c for c in compact_kids if c]
            return compact

        compacted_nodes = [_compact_node(n) for n in data_pool["mindmap_nodes"] if n]
        compacted_nodes = [n for n in compacted_nodes if n]
        synthesis_input_mindmap = json.dumps(compacted_nodes, ensure_ascii=False)
        print(f"[MAP-REDUCE] Mindmap input size: {len(synthesis_input_mindmap):,} chars (compacted from {len(json.dumps(data_pool['mindmap_nodes'], ensure_ascii=False)):,} chars)")

        try:
            async def _synth_summary():
                t0 = time.time()
                print(f"[SYNTHESIS] Bắt đầu tổng hợp Summary (LLM)...")
                raw_result = await self.struct_summary_only.ainvoke(
                    PROMPT_SYNTHESIS_SUMMARY.format(data=synthesis_input_summary)
                )
                res, input_tokens, output_tokens = self._unpack(raw_result)
                lat = int((time.time() - t0) * 1000)
                print(f"[SYNTHESIS] Summary xong (Latency: {lat/1000:.2f}s)")
                self._log("Summarize", input_tokens, output_tokens, lat, True,
                          prompt=f"[Synthesis Summary] {len(data_pool['tldr'])} tldr items",
                          response=json.dumps(res.model_dump(), ensure_ascii=False)[:500])
                return res

            def _deep_merge_mindmaps(nodes: list) -> list:
                """Fallback: gộp mindmap bằng Python khi LLM lỗi."""
                merged = {}
                for node in nodes:
                    if not node: continue
                    raw_label = node.get("label", "")
                    key = raw_label.lower().strip()
                    if not key: continue

                    if key not in merged:
                        merged[key] = {
                            "id": node.get("id", str(uuid.uuid4())),
                            "label": raw_label,
                            "children": node.get("children", []).copy()
                        }
                    else:
                        merged[key]["children"].extend(node.get("children", []))
                
                result = []
                for v in merged.values():
                    if v.get("children"):
                        v["children"] = _deep_merge_mindmaps(v["children"])
                    result.append(v)
                return result

            async def _synth_mindmap_llm():
                MINDMAP_TIMEOUT = 60
                t0 = time.time()
                print(f"[SYNTHESIS] Bắt đầu tổng hợp Mindmap (LLM, timeout={MINDMAP_TIMEOUT}s)...")
                try:
                    raw_result = await asyncio.wait_for(
                        self.struct_mindmap_only.ainvoke(
                            PROMPT_SYNTHESIS_MINDMAP.format(data=synthesis_input_mindmap)
                        ),
                        timeout=MINDMAP_TIMEOUT
                    )
                    res, input_tokens, output_tokens = self._unpack(raw_result)
                    final_mindmap = res.mindmap.model_dump()
                    lat = int((time.time() - t0) * 1000)
                    print(f"[SYNTHESIS] Mindmap LLM xong (Latency: {lat/1000:.2f}s)")
                    self._log("Mindmap", input_tokens, output_tokens, lat, True,
                              prompt=f"[LLM Synthesis] {len(data_pool['mindmap_nodes'])} nodes",
                              response=json.dumps(final_mindmap, ensure_ascii=False)[:500])
                    return final_mindmap
                except asyncio.TimeoutError:
                    lat = int((time.time() - t0) * 1000)
                    print(f"[SYNTHESIS] Mindmap LLM ⏱ TIMEOUT sau {MINDMAP_TIMEOUT}s — Thử fallback Python Merge")
                    self._log("Mindmap", 0, 0, lat, False, error_message=f"Timeout after {MINDMAP_TIMEOUT}s")
                    merged_children = _deep_merge_mindmaps(data_pool["mindmap_nodes"])
                    if merged_children:
                        if len(merged_children) == 1:
                            return merged_children[0]
                        return {"id": "root", "label": "Tổng quan Nội dung", "children": merged_children}
                    print(f"[SYNTHESIS] Mindmap fallback cũng rỗng — trả None")
                    return None
                except Exception as e:
                    lat = int((time.time() - t0) * 1000)
                    print(f"[SYNTHESIS] Mindmap LLM lỗi: {e} — Thử fallback Python Merge")
                    self._log("Mindmap", 0, 0, lat, False, error_message=str(e))
                    merged_children = _deep_merge_mindmaps(data_pool["mindmap_nodes"])
                    if merged_children:
                        if len(merged_children) == 1:
                            return merged_children[0]
                        return {"id": "root", "label": "Tổng quan Nội dung", "children": merged_children}
                    print(f"[SYNTHESIS] Mindmap fallback cũng rỗng — trả None")
                    return None

            # Chạy song song cả 2 tác vụ tổng hợp (LLM Summary + LLM Mindmap) tùy theo target
            summary_task = _synth_summary() if target in ("both", "summary") else asyncio.sleep(0, result=None)
            mindmap_task = _synth_mindmap_llm() if target in ("both", "mindmap") else asyncio.sleep(0, result=None)

            summary_res, final_mindmap = await asyncio.gather(summary_task, mindmap_task)
            
            print(f"[SYNTHESIS] Đã xong {target} (song song).")
            final_result = {}
            if summary_res:
                final_result["summary"] = summary_res.summary.model_dump()
            if final_mindmap and isinstance(final_mindmap, dict) and final_mindmap.get("children"):
                self._ensure_unique_ids(final_mindmap, set())
                final_result["mindmap"] = final_mindmap
            elif target in ("both", "mindmap"):
                print(f"[SYNTHESIS] ⚠ Mindmap không có dữ liệu — sẽ không lưu vào DB")
                final_result["_mindmap_failed"] = True
            
            return final_result
            
        except Exception as e:
            print(f"[SYNTHESIS] THẤT BẠI: {e}")
            self._log("Summarize", 0, 0, 0, False, error_message=str(e))
            return results[0] if results else {}


    # --- Shortcut methods for Pipeline compatibility ---
    async def generate_summary(self, text: str) -> dict:
        data = await self.analyze_long_text(text, target="summary")
        return data.get("summary", {"tldr": [], "detailed": "", "highlights": []})

    async def generate_mindmap(self, text: str) -> dict:
        data = await self.analyze_long_text(text, target="mindmap")
        return data.get("mindmap", {"id": "root", "label": "Main Topic", "children": []})

    async def generate_outline(self, summary_data: Any) -> list:
        async with self.lesson_semaphore:
          async with self.global_semaphore:
            prompt_text = PROMPT_OUTLINE.format(data=str(summary_data))
            t0 = time.time()
            try:
                raw_result = await self.struct_outline.ainvoke(prompt_text)
                res, input_tokens, output_tokens = self._unpack(raw_result)
                latency = int((time.time() - t0) * 1000)
                result = [i.model_dump() for i in res.items]
                self._log("Outline", input_tokens, output_tokens, latency, True,
                          prompt=prompt_text[:300])
                return result
            except Exception as e:
                latency = int((time.time() - t0) * 1000)
                self._log("Outline", 0, 0, latency, False, error_message=str(e))
                return []

    async def write_lesson(self, title: str, description: str, context: str) -> dict:
        async with self.lesson_semaphore:
          async with self.global_semaphore:
            prompt_text = PROMPT_WRITE_LESSON.format(title=title, description=description, context=context)
            t0 = time.time()
            try:
                raw_result = await self.struct_lesson.ainvoke(prompt_text)
                res, input_tokens, output_tokens = self._unpack(raw_result)
                latency = int((time.time() - t0) * 1000)
                result = res.model_dump()
                self._log("Write Lesson", input_tokens, output_tokens, latency, True,
                          prompt=f"Lesson: {title}",
                          response=str(result)[:500])
                return result
            except Exception as e:
                latency = int((time.time() - t0) * 1000)
                self._log("Write Lesson", 0, 0, latency, False, error_message=str(e))
                return {"title": title, "keyConcept": description, "example": ""}

    async def generate_quizzes(self, lesson_data: Any, difficulty: str = "intermediate") -> list:
        lesson_str = str(lesson_data)
        lesson_title = lesson_data.get('title', lesson_str[:50]) if isinstance(lesson_data, dict) else lesson_str[:50]
        print(f"[QUIZ] Bắt đầu tạo quiz cho: '{lesson_title}' (Difficulty: {difficulty})")
        async with self.quiz_semaphore:
          async with self.global_semaphore:
            prompt_text = PROMPT_GENERATE_QUIZZES.format(lesson=lesson_str, difficulty=difficulty)
            t0 = time.time()
            try:
                raw_result = await asyncio.wait_for(self.struct_quizzes.ainvoke(prompt_text), timeout=90.0)
                res, input_tokens, output_tokens = self._unpack(raw_result)
                latency = int((time.time() - t0) * 1000)
                result = [q.model_dump() for q in res.quizzes]
                print(f"[QUIZ] HOÀN TẤT quiz '{lesson_title}' ({len(result)} câu | Latency: {latency/1000:.2f}s)")
                self._log("Quiz", input_tokens, output_tokens, latency, True,
                          prompt=f"Quiz for: {lesson_str[:200]}",
                          response=str(result)[:500])
                return result
            except asyncio.TimeoutError:
                latency = int((time.time() - t0) * 1000)
                print(f"[QUIZ] ⏱ TIMEOUT sau 90s khi tạo quiz '{lesson_title}' (Latency: {latency/1000:.2f}s)")
                self._log("Quiz", 0, 0, latency, False, error_message="Timeout after 90s")
                return []
            except Exception as e:
                latency = int((time.time() - t0) * 1000)
                print(f"[QUIZ] ❌ LỖI quiz '{lesson_title}': {e} (Latency: {latency/1000:.2f}s)")
                self._log("Quiz", 0, 0, latency, False, error_message=str(e))
                return []

# Singleton instance
agentic_extractor = KnowledgeExtractor()
