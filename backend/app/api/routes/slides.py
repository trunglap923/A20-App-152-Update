from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import uuid
import json
import re
import os
from openai import OpenAI
from typing import Any, List

from app.db.session import get_db
from app.api import schemas
from app.api.deps import get_current_user, UserInfo
from app.ai.providers import get_chat_provider
from app.models.knowledge_items import KnowledgeItem
from app.models.chunks import ItemChunk
from app.services.vector_search_service import search_service


router = APIRouter(prefix="/slides", tags=["slides"])


def _clean_key(value: str | None) -> str | None:
    if not value:
        return None
    key = str(value).strip().strip('"').strip("'").strip()
    return key or None


def _validate_item_ownership(db: Session, current_user: UserInfo, item_id: str) -> uuid.UUID:
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="item_id không hợp lệ")

    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
    if not item or str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Không có quyền truy cập item này")
    return item_uuid


def _safe_json_extract(text: str) -> dict:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Empty model response")

    # Strip common markdown fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)

    # Try direct JSON
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Fallback: extract first {...} block
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError("No JSON object found in model response")
    return json.loads(match.group(0))


def _get_user_text_runtime(request: Request) -> tuple[str, str, str | None]:
    provider = (request.headers.get("x-user-ai-provider") or "openai").strip()
    model = (request.headers.get("x-user-ai-model") or "gpt-4o-mini").strip()
    api_key = (request.headers.get("x-user-ai-key") or "").strip() or None
    return provider, model, api_key


def _build_context_from_chunks(db: Session, item_uuid: uuid.UUID, max_chunks: int = 40, max_chars: int = 9000) -> str:
    rows = (
        db.query(ItemChunk.content)
        .filter(ItemChunk.item_id == item_uuid)
        .order_by(ItemChunk.chunk_index.asc())
        .limit(max_chunks)
        .all()
    )
    parts: list[str] = []
    total = 0
    for (content,) in rows:
        if not content:
            continue
        c = str(content).strip()
        if not c:
            continue
        remain = max_chars - total
        if remain <= 0:
            break
        if len(c) > remain:
            c = c[:remain].rstrip() + " ..."
        parts.append(c)
        total += len(c)
    return "\n---\n".join(parts) if parts else ""


async def _build_context_from_vectordb(
    item_id: str,
    item_title: str,
    extra_instructions: str,
    page_count: int,
    max_queries: int = 10,
    top_k_per_query: int = 4,
    max_context_chars: int = 14000,
) -> str:
    outline_lines: list[str] = []
    if extra_instructions:
        m = re.search(r"REVIEWED_OUTLINE[\s\S]*?:\s*([\s\S]*?)(?:\n[A-Z_]{2,}|\Z)", extra_instructions, flags=re.IGNORECASE)
        raw = (m.group(1) if m else "").strip()
        if raw:
            outline_lines = [ln.strip() for ln in raw.splitlines() if ln.strip()][: max(3, min(page_count, 12))]
        else:
            m2 = re.search(r"OUTLINE_DRAFT[\s\S]*?:\s*([\s\S]*?)(?:\n[A-Z_]{2,}|\Z)", extra_instructions, flags=re.IGNORECASE)
            raw2 = (m2.group(1) if m2 else "").strip()
            if raw2:
                outline_lines = [ln.strip() for ln in raw2.splitlines() if ln.strip()][: max(3, min(page_count, 12))]

    queries: list[str] = []
    if item_title:
        queries.append(f"{item_title} — tổng quan và các điểm chính")
    if outline_lines:
        queries.extend([f"{item_title}: {ln}" for ln in outline_lines])
    if extra_instructions:
        short_extra = extra_instructions.strip()
        if len(short_extra) > 700:
            short_extra = short_extra[:700].rsplit("\n", 1)[0].strip() or short_extra[:700]
        queries.append(f"{item_title}: {short_extra}")

    picked = []
    seen = set()
    for q in queries[:max_queries]:
        try:
            chunks = await search_service.search_chunks(
                query=q,
                top_k=top_k_per_query,
                item_id=item_id,
                max_context_chars=3600,
                max_chunk_chars=900,
            )
            for c in chunks:
                key = re.sub(r"\s+", " ", c.strip())
                if not key or key in seen:
                    continue
                seen.add(key)
                picked.append(c.strip())
                if sum(len(x) for x in picked) >= max_context_chars:
                    break
            if sum(len(x) for x in picked) >= max_context_chars:
                break
        except Exception as e:
            print(f"[SLIDES] Vector context error: {e}")
            continue

    return "\n---\n".join(picked) if picked else ""


def _build_design_instructions(category: str) -> str:
    cat = (category or "").lower().strip()
    if cat == "business":
        return (
            "Chuyên nghiệp, rõ ràng, ưu tiên insight & số liệu. "
            "Mỗi slide tối đa 3 bullet, mỗi bullet <= 15 từ. "
            "Ưu tiên layout split/grid cho slide nội dung."
        )
    if cat == "creative":
        return (
            "Sáng tạo, cô đọng, tiêu đề mạnh. "
            "Ưu tiên layout full/split, có 1 câu tagline ngắn. "
            "Bullet ít, nhấn mạnh key phrase."
        )
    if cat == "children":
        return (
            "Đơn giản, dễ hiểu, ví dụ gần gũi. "
            "Câu ngắn, dùng tối đa 3 bullet/slide. "
            "Ưu tiên layout full/title-only."
        )
    return (
        "Học thuật, mạch lạc, có cấu trúc. "
        "Mỗi slide tối đa 3 bullet, mỗi bullet <= 15 từ. "
        "Ưu tiên: khái niệm -> ví dụ -> ứng dụng."
    )


def _get_category_density_profile(category: str) -> dict:
    cat = (category or "").lower().strip()
    if cat == "business":
        return {
            "title_words": 10,
            "subtitle_words": 14,
            "bullet_items": 3,
            "bullet_words": 12,
            "quote_words": 20,
            "side_title_words": 5,
        }
    if cat == "creative":
        return {
            "title_words": 14,
            "subtitle_words": 16,
            "bullet_items": 2,
            "bullet_words": 12,
            "quote_words": 26,
            "side_title_words": 6,
        }
    if cat == "children":
        return {
            "title_words": 9,
            "subtitle_words": 10,
            "bullet_items": 2,
            "bullet_words": 8,
            "quote_words": 16,
            "side_title_words": 4,
        }
    return {
        "title_words": 12,
        "subtitle_words": 16,
        "bullet_items": 3,
        "bullet_words": 14,
        "quote_words": 22,
        "side_title_words": 6,
    }


def _get_speaker_notes_profile(category: str) -> dict:
    cat = (category or "").lower().strip()
    if cat == "business":
        return {
            "opening": "executive, rõ luận điểm, đi thẳng vào tác động",
            "transition": "chốt quyết định hoặc hành động kế tiếp",
            "bridge": "Điểm cần nhấn mạnh với đội ngũ là",
        }
    if cat == "creative":
        return {
            "opening": "storytelling, có hook ngắn, giàu hình ảnh",
            "transition": "chuyển mượt sang ý tiếp theo như một câu chuyện",
            "bridge": "Điều thú vị ở đây là",
        }
    if cat == "children":
        return {
            "opening": "rất đơn giản, thân thiện, dễ nói thành lời",
            "transition": "chuyển ý nhẹ nhàng, dễ hiểu",
            "bridge": "Các em có thể hiểu đơn giản là",
        }
    return {
        "opening": "mạch lạc, giải thích rõ khái niệm rồi mới đi vào ý chính",
        "transition": "kết lại bằng ý nghĩa học được và chuyển sang phần sau",
        "bridge": "Ý quan trọng cần nhớ là",
    }


def _normalize_language(value: Any) -> str:
    raw = str(value or "vi").strip().lower()
    return "en" if raw.startswith("en") else "vi"


def _special_slide_copy(language: str) -> dict[str, str]:
    lang = _normalize_language(language)
    if lang == "en":
        return {
            "missing_data": "No data found in the source material",
            "closing_title": "Thank You",
            "closing_subtitle": "Thank you for listening, and I am ready to discuss further.",
            "summary_title": "Quick Summary",
            "summary_subtitle": "A high-level view before diving into the details",
            "mindmap_title": "Mind Map Overview",
            "mindmap_subtitle": "Overall structure of the lesson",
            "mindmap_empty_content": "Mind map overview of the main lesson content.",
            "mindmap_content_prefix": "Mind map overview of: ",
            "quiz_title": "Review Questions",
            "quiz_subtitle": "Check understanding",
            "quiz_content": "Review questions to check understanding of the lesson content.",
            "quiz_fallback_1": "Question 1: What is the main idea?",
            "quiz_fallback_2": "Question 2: Why does this topic matter?",
            "summary_fallback_1": "Main goal: Quickly grasp the structure of the content.",
            "summary_fallback_2": "Focus 1: Identify the main ideas before the details.",
            "summary_fallback_3": "Focus 2: Follow the arguments, evidence, and next actions.",
        }
    return {
        "missing_data": "Chưa có dữ liệu trong tài liệu",
        "closing_title": "Cảm ơn đã lắng nghe",
        "closing_subtitle": "Trân trọng cảm ơn và sẵn sàng trao đổi thêm.",
        "summary_title": "Tổng kết nhanh",
        "summary_subtitle": "Bức tranh tổng quan trước khi vào nội dung chi tiết",
        "mindmap_title": "Sơ đồ tư duy tổng quan",
        "mindmap_subtitle": "Tổng thể nội dung bài học",
        "mindmap_empty_content": "Sơ đồ tư duy tổng quan nội dung chính của bài học.",
        "mindmap_content_prefix": "Sơ đồ tư duy tổng quan về: ",
        "quiz_title": "Câu hỏi ôn tập",
        "quiz_subtitle": "Kiểm tra hiểu biết",
        "quiz_content": "Câu hỏi ôn tập để kiểm tra hiểu biết nội dung bài học.",
        "quiz_fallback_1": "Câu hỏi 1: Nội dung chính là gì?",
        "quiz_fallback_2": "Câu hỏi 2: Ý nghĩa của bài học?",
        "summary_fallback_1": "Mục tiêu chính: Nắm nhanh cấu trúc nội dung của bài học.",
        "summary_fallback_2": "Trọng tâm 1: Xác định các ý chính trước khi đi vào chi tiết.",
        "summary_fallback_3": "Trọng tâm 2: Theo dõi luận điểm, bằng chứng và hướng hành động.",
    }


def _extract_instruction_block(extra_instructions: str, label: str) -> str:
    if not extra_instructions:
        return ""
    pattern = rf"{re.escape(label)}\s*:\s*([\s\S]*?)(?:\n[A-Z_][A-Z0-9_ ()-]*:|\Z)"
    match = re.search(pattern, extra_instructions, flags=re.IGNORECASE)
    return (match.group(1) if match else "").strip()


def _limit_words(text: Any, max_words: int) -> str:
    raw = re.sub(r"\s+", " ", str(text or "").replace("\n", " ").strip())
    if not raw:
        return ""
    words = raw.split(" ")
    if len(words) <= max_words:
        return raw
    return " ".join(words[:max_words]).rstrip(" ,;:.") + "..."


def _sanitize_bullet_text(text: Any, max_words: int = 15) -> str:
    raw = re.sub(r"^[-*•\d\.\)\(]+\s*", "", str(text or "").strip())
    raw = re.sub(r"\s+", " ", raw)
    return _limit_words(raw, max_words)


def _sanitize_bullets(values: Any, max_items: int = 3, max_words: int = 15) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for value in values:
        bullet = _sanitize_bullet_text(value, max_words=max_words)
        if not bullet:
            continue
        cleaned.append(bullet)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _extract_bullets_from_text(text: str, max_items: int = 3) -> list[str]:
    raw = str(text or "").strip()
    if not raw:
        return []
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    explicit = [re.sub(r"^[-*•]\s+", "", ln).strip() for ln in lines if re.match(r"^[-*•]\s+", ln)]
    if explicit:
        return [x for x in explicit if x][:max_items]

    split = re.split(r"(?<=[\.\!\?;:])\s+|\n+", raw)
    bullets: list[str] = []
    for part in split:
        cleaned = str(part).strip(" -•\t\r\n")
        if not cleaned:
            continue
        if len(cleaned) < 12:
            continue
        bullets.append(cleaned)
        if len(bullets) >= max_items:
            break
    return bullets


def _parse_outline_lines(extra_instructions: str, page_count: int) -> list[str]:
    reviewed_outline = _extract_instruction_block(extra_instructions or "", "REVIEWED_OUTLINE")
    outline_draft = _extract_instruction_block(extra_instructions or "", "OUTLINE_DRAFT")
    raw = reviewed_outline or outline_draft
    if not raw:
        return []

    lines: list[str] = []
    for line in raw.splitlines():
        cleaned = re.sub(r"^\s*[-*•]?\s*\d+[.)]?\s*", "", line).strip()
        cleaned = re.sub(r"^\s*[-*•]\s*", "", cleaned).strip()
        if cleaned:
            lines.append(cleaned)
        if len(lines) >= page_count:
            break
    return lines


def _sanitize_outline_items(values: Any, page_count: int, language: str) -> list[dict]:
    items = values if isinstance(values, list) else []
    normalized_language = _normalize_language(language)
    fallback_title_prefix = "Section" if normalized_language == "en" else "Phần"
    fallback_intent = (
        "Present the key idea clearly, briefly, and in presentation-ready form."
        if normalized_language == "en"
        else "Trình bày ý chính rõ ràng, ngắn gọn và phù hợp thuyết trình."
    )

    cleaned: list[dict] = []
    for idx, item in enumerate(items[:page_count]):
        if isinstance(item, dict):
            title = _limit_words(item.get("title"), 12)
            intent = _limit_words(item.get("intent"), 24)
        else:
            title = _limit_words(item, 12)
            intent = ""

        cleaned.append({
            "index": idx + 1,
            "title": title or f"{fallback_title_prefix} {idx + 1}",
            "intent": intent or fallback_intent,
        })

    return cleaned


def _build_outline_fallback(item_title: str, page_count: int, language: str, extra_instructions: str) -> list[dict]:
    normalized_language = _normalize_language(language)
    parsed_lines = _parse_outline_lines(extra_instructions, page_count)
    if parsed_lines:
        return [
            {
                "index": idx + 1,
                "title": _limit_words(line, 12),
                "intent": (
                    f'Present the section "{_limit_words(line, 10)}" clearly with a logical narrative.'
                    if normalized_language == "en"
                    else f'Triển khai phần "{_limit_words(line, 10)}" rõ ràng với mạch trình bày logic.'
                ),
            }
            for idx, line in enumerate(parsed_lines[:page_count])
        ]

    return [
        {
            "index": idx + 1,
            "title": (f"Key Part {idx + 1}" if normalized_language == "en" else f"Phần chính {idx + 1}"),
            "intent": (
                f"Develop a clear presentation section for {item_title or 'the topic'}."
                if normalized_language == "en"
                else f"Triển khai một phần trình bày rõ ràng cho chủ đề {item_title or 'này'}."
            ),
        }
        for idx in range(page_count)
    ]


def _is_quiz_slide(slide: dict) -> bool:
    slide_id = str(slide.get("id") or "").strip().lower()
    title = str(slide.get("title") or "").strip().lower()
    return slide_id == "slide-quiz" or "câu hỏi" in title or "quiz" in title or "trắc nghiệm" in title


def _is_closing_slide(slide: dict) -> bool:
    slide_id = str(slide.get("id") or "").strip().lower()
    title = str(slide.get("title") or "").strip().lower()
    return slide_id == "slide-closing" or any(token in title for token in ["cảm ơn", "cam on", "thank"])


def _is_summary_slide(slide: dict) -> bool:
    slide_id = str(slide.get("id") or "").strip().lower()
    title = str(slide.get("title") or "").strip().lower()
    return slide_id == "slide-summary" or any(token in title for token in ["tổng kết nhanh", "tổng quan", "overview", "summary", "điểm chính"])


def _is_mindmap_slide(slide: dict) -> bool:
    slide_id = str(slide.get("id") or "").strip().lower()
    title = str(slide.get("title") or "").strip().lower()
    return slide_id == "slide-mindmap" or any(token in title for token in ["mindmap", "sơ đồ", "tư duy"])


def _fallback_layout_without_image(slide: dict) -> str:
    if isinstance(slide.get("leftBullets"), list) and isinstance(slide.get("rightBullets"), list):
        if slide.get("leftBullets") and slide.get("rightBullets"):
            return "split"
    bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
    return "grid" if bullets else "full"


def _build_image_prompt_for_slide(slide: dict) -> str:
    title = _limit_words(slide.get("title") or "Insight chính", 10)
    subtitle = _limit_words(slide.get("subtitle") or slide.get("content") or "", 18)
    bullets = _sanitize_bullets(slide.get("bullets"), max_items=2, max_words=10)
    details = ", ".join(bullets)
    parts = [f"Professional presentation illustration about {title}"]
    if subtitle:
        parts.append(f"Focus on {subtitle}")
    if details:
        parts.append(f"Visual cues: {details}")
    parts.append("Dark blue business style, clean composition, no text, no labels")
    return ". ".join(parts)


def _prefer_layout_for_category(slide: dict, category: str) -> str:
    current_layout = str(slide.get("layout") or "").strip()
    if current_layout == "title-only":
        return "title-only"
    if _is_quiz_slide(slide):
        return "grid"
    if _is_summary_slide(slide):
        return "grid"
    if _is_closing_slide(slide):
        return "title-only"
    if _is_mindmap_slide(slide):
        return "grid"

    has_image = bool(str(slide.get("imagePrompt") or "").strip()) or bool(str(slide.get("image") or "").strip())
    bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
    left_bullets = slide.get("leftBullets") if isinstance(slide.get("leftBullets"), list) else []
    right_bullets = slide.get("rightBullets") if isinstance(slide.get("rightBullets"), list) else []
    has_split_data = bool(left_bullets and right_bullets)
    if has_image:
        return "image-right"
    if has_split_data:
        return "split"
    return "grid" if bullets else "full"


def _apply_category_layout_strategy(slides: List[dict], category: str) -> List[dict]:
    for slide in slides:
        if not isinstance(slide, dict):
            continue
        slide["layout"] = _prefer_layout_for_category(slide, category)
    return slides


def _score_slide_for_visual(slide: dict) -> int:
    score = 0
    title = str(slide.get("title") or "").strip().lower()
    subtitle = str(slide.get("subtitle") or "").strip().lower()
    content = str(slide.get("content") or "").strip().lower()
    joined = " ".join([title, subtitle, content])
    bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
    left_bullets = slide.get("leftBullets") if isinstance(slide.get("leftBullets"), list) else []
    right_bullets = slide.get("rightBullets") if isinstance(slide.get("rightBullets"), list) else []

    if bullets:
        score += 3
    if left_bullets or right_bullets:
        score += 2
    if any(token in joined for token in ["quy trình", "process", "workflow", "lộ trình", "roadmap"]):
        score += 5
    if any(token in joined for token in ["kiến trúc", "architecture", "hệ thống", "system"]):
        score += 5
    if any(token in joined for token in ["mô hình", "model", "khung", "framework"]):
        score += 4
    if any(token in joined for token in ["giải pháp", "solution", "đề xuất", "recommendation"]):
        score += 4
    if any(token in joined for token in ["so sánh", "compare", "before", "after", "đối chiếu"]):
        score += 3
    if any(token in joined for token in ["chỉ số", "kpi", "metric", "dashboard", "số liệu"]):
        score += 2
    if any(token in joined for token in ["ví dụ", "example", "minh họa", "illustration"]):
        score += 2
    if len(joined.split()) > 18:
        score += 1
    return score


def _apply_selective_images(slides: List[dict]) -> List[dict]:
    if not slides:
        return slides

    eligible_indices: list[int] = []
    selected_indices: list[int] = []
    for idx, slide in enumerate(slides):
        if not isinstance(slide, dict):
            continue
        if _is_quiz_slide(slide) or _is_closing_slide(slide) or _is_summary_slide(slide) or _is_mindmap_slide(slide):
            slide["imagePrompt"] = None
            slide["image"] = None
            continue
        if str(slide.get("layout") or "").strip() == "title-only":
            slide["imagePrompt"] = None
            slide["image"] = None
            continue

        eligible_indices.append(idx)
        has_visual = bool(str(slide.get("imagePrompt") or "").strip()) or bool(str(slide.get("image") or "").strip())
        if has_visual:
            selected_indices.append(idx)
            if str(slide.get("layout") or "").strip() not in ("image-left", "image-right"):
                slide["layout"] = "image-right"

    if not eligible_indices:
        return slides

    target_visual_count = 1 if len(eligible_indices) <= 3 else 2

    if len(selected_indices) > target_visual_count:
        for idx in selected_indices[target_visual_count:]:
            slide = slides[idx]
            slide["imagePrompt"] = None
            slide["image"] = None
            if str(slide.get("layout") or "").strip() in ("image-left", "image-right"):
                slide["layout"] = _fallback_layout_without_image(slide)
        selected_indices = selected_indices[:target_visual_count]

    if len(selected_indices) < target_visual_count:
        remaining = [idx for idx in eligible_indices if idx not in selected_indices]
        if remaining:
            ranked = sorted(remaining, key=lambda idx: (_score_slide_for_visual(slides[idx]), -idx), reverse=True)
            chosen = ranked[: target_visual_count - len(selected_indices)]
            for idx in chosen:
                slide = slides[idx]
                slide["layout"] = "image-right"
                slide["imagePrompt"] = _build_image_prompt_for_slide(slide)
                slide["image"] = None

    for idx in eligible_indices:
        if idx in selected_indices:
            continue
        slide = slides[idx]
        has_visual = bool(str(slide.get("imagePrompt") or "").strip()) or bool(str(slide.get("image") or "").strip())
        if not has_visual and str(slide.get("layout") or "").strip() in ("image-left", "image-right"):
            slide["layout"] = _fallback_layout_without_image(slide)

    return slides


def _ensure_important_slides_have_images(slides: List[dict]) -> List[dict]:
    if not slides:
        return slides

    eligible: list[tuple[int, int]] = []
    visible_count = 0
    for idx, slide in enumerate(slides):
        if not isinstance(slide, dict):
            continue
        if _is_quiz_slide(slide) or _is_closing_slide(slide) or _is_summary_slide(slide) or _is_mindmap_slide(slide):
            continue
        if str(slide.get("layout") or "").strip() == "title-only":
            continue
        if str(slide.get("image") or "").strip():
            visible_count += 1
        eligible.append((idx, _score_slide_for_visual(slide)))

    if not eligible:
        return slides

    target_visual_count = 1 if len(eligible) <= 3 else 2
    if visible_count >= target_visual_count:
        return slides

    ranked = [idx for idx, _score in sorted(eligible, key=lambda item: (item[1], -item[0]), reverse=True)]
    for idx in ranked:
        slide = slides[idx]
        if str(slide.get("image") or "").strip():
            continue
        if not str(slide.get("imagePrompt") or "").strip():
            slide["imagePrompt"] = _build_image_prompt_for_slide(slide)
        slide["layout"] = "image-right"
        slide["image"] = _resolve_image_for_prompt(slide.get("imagePrompt"))
        if str(slide.get("image") or "").strip():
            visible_count += 1
        if visible_count >= target_visual_count:
            break

    return slides


def _resolve_image_for_prompt(image_prompt: str | None) -> str | None:
    if not image_prompt:
        return None
    prompt = str(image_prompt).strip()
    if not prompt:
        return None
    try:
        openai_key = _clean_key(os.getenv("OPENAI_API_KEY"))
        if openai_key:
            client = OpenAI(api_key=openai_key)
            dalle_prompt = f"Professional, educational illustration for a presentation slide: {prompt}"
            dalle_response = client.images.generate(
                model="dall-e-3",
                prompt=dalle_prompt,
                size="1024x1792",
                quality="standard",
                n=1,
            )
            if dalle_response.data and len(dalle_response.data) > 0:
                return dalle_response.data[0].url
        from urllib.parse import quote
        safe_prompt = quote(prompt[:120])
        return f"https://image.pollinations.ai/prompt/{safe_prompt}?width=1200&height=675&nologo=true"
    except Exception as img_err:
        print(f"[SLIDES] Image generation failed: {img_err}")
        from urllib.parse import quote
        safe_prompt = quote(prompt[:120])
        return f"https://image.pollinations.ai/prompt/{safe_prompt}?width=1200&height=675&nologo=true"


def _build_category_speaker_notes(slide: dict, category: str, item_title: str = "") -> str:
    profile = _get_speaker_notes_profile(category)
    title = str(slide.get("title") or "").strip() or "Nội dung"
    subtitle = str(slide.get("subtitle") or "").strip()
    layout = str(slide.get("layout") or "").strip()
    bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
    left_title = str(slide.get("leftTitle") or "").strip()
    right_title = str(slide.get("rightTitle") or "").strip()
    left_bullets = slide.get("leftBullets") if isinstance(slide.get("leftBullets"), list) else []
    right_bullets = slide.get("rightBullets") if isinstance(slide.get("rightBullets"), list) else []
    bridge = profile["bridge"]

    lines: list[str] = []
    if layout == "title-only":
        if _is_closing_slide(slide):
            if category == "business":
                lines = [
                    f"Chúng ta vừa đi qua toàn bộ nội dung chính của {item_title or title}.",
                    "Ở góc độ điều hành, bức tranh vấn đề, nguyên nhân và hướng hành động đã đủ rõ để ra quyết định bước tiếp theo.",
                    "Nếu cần ưu tiên triển khai, chúng ta có thể quay lại các slide trọng tâm để chốt thứ tự hành động.",
                    "Cảm ơn mọi người đã theo dõi và sẵn sàng trao đổi thêm ở phần hỏi đáp.",
                ]
            elif category == "creative":
                lines = [
                    f"Vậy là hành trình của {item_title or title} đã khép lại ở đây.",
                    "Điều còn đọng lại không chỉ là thông tin, mà là bức tranh lớn và cảm hứng để hành động tiếp.",
                    "Nếu muốn, chúng ta có thể mở rộng từng ý thành những bước triển khai cụ thể hơn.",
                    "Cảm ơn mọi người đã lắng nghe và đồng hành đến cuối phần trình bày.",
                ]
            elif category == "children":
                lines = [
                    f"Vậy là chúng ta đã học xong phần {item_title or title}.",
                    "Điều quan trọng là các em đã biết những ý chính và hiểu vì sao chúng ta cần chúng.",
                    "Nếu còn chỗ nào chưa rõ, chúng ta có thể cùng xem lại từng phần thật chậm.",
                    "Cảm ơn các em đã lắng nghe.",
                ]
            else:
                lines = [
                    f"Chúng ta vừa khép lại phần trình bày về {item_title or title}.",
                    "Điểm quan trọng là đã nắm được cấu trúc, luận điểm và ý nghĩa của toàn bộ nội dung.",
                    "Nếu cần học sâu hơn, chúng ta có thể quay lại từng slide để phân tích kỹ hơn.",
                    "Cảm ơn mọi người đã lắng nghe và theo dõi.",
                ]
            return "\n".join(lines)

        lines.append(f"Chúng ta bắt đầu với chủ đề: {title}.")
        if subtitle:
            lines.append(subtitle)
        lines.append(f"Phần trình bày này nên được nói theo giọng {profile['opening']}.")
        lines.append("Mục tiêu là giúp người nghe nắm được khung ý chính ngay từ đầu.")
        lines.append("Sau đó mình sẽ đi từng phần theo đúng outline đã xây dựng.")
        lines.append("Giờ mình chuyển sang slide kế tiếp.")
        return "\n".join(lines)

    lines.append(f"Slide này tập trung vào: {title}.")
    if subtitle:
        lines.append(subtitle)
    if layout == "split" and (left_bullets or right_bullets):
        lines.append(f"{bridge} trước hết hãy nhìn vào {left_title or 'nhóm ý thứ nhất'}.")
        for b in left_bullets[:3]:
            btxt = str(b).strip()
            if btxt:
                lines.append(f"- {btxt}.")
        lines.append(f"Tiếp theo là {right_title or 'nhóm ý thứ hai'} để đối chiếu và rút ra kết luận.")
        for b in right_bullets[:3]:
            btxt = str(b).strip()
            if btxt:
                lines.append(f"- {btxt}.")
        lines.append(f"Cách chuyển ý nên {profile['transition']}.")
    elif bullets:
        lines.append(f"{bridge} có {len(bullets[:3])} ý cần ghi nhớ.")
        for b in bullets[:3]:
            btxt = str(b).strip()
            if btxt:
                lines.append(f"- {btxt}.")
        if category == "business":
            lines.append("Khi trình bày, nên chốt lại tác động và hành động đề xuất.")
        elif category == "creative":
            lines.append("Khi trình bày, nên dùng nhịp kể chuyện và nhấn vào hình ảnh chính.")
        elif category == "children":
            lines.append("Khi trình bày, hãy dùng câu ngắn và ví dụ thật gần gũi.")
        else:
            lines.append("Khi trình bày, nên gắn các ý này thành một mạch logic dễ nhớ.")
    else:
        content_text = str(slide.get("content") or "").strip()
        if content_text:
            lines.append("Phần này nên được diễn giải theo bối cảnh, ý chính và ý nghĩa.")
        else:
            lines.append("Slide này chưa có đủ dữ liệu trong tài liệu để diễn giải sâu.")
    lines.append("Giờ mình chuyển sang slide tiếp theo.")
    return "\n".join(lines)


def _sanitize_slide_for_layout(slide: dict, content_text: str = "", category: str = "academic", language: str = "vi") -> dict:
    safe = dict(slide)
    layout = str(safe.get("layout") or "").strip()
    is_quiz = _is_quiz_slide(safe)
    is_closing = _is_closing_slide(safe)
    density = _get_category_density_profile(category)
    copy = _special_slide_copy(language)
    bullet_max_items = 3 if is_quiz else int(density["bullet_items"])
    bullet_max_words = 18 if is_quiz else int(density["bullet_words"])

    safe["title"] = _limit_words(safe.get("title") or copy["missing_data"], int(density["title_words"]))
    if is_closing:
        safe["title"] = copy["closing_title"]
        safe["subtitle"] = copy["closing_subtitle"]
        safe["content"] = safe["subtitle"]
        safe["bullets"] = None
        safe["layout"] = "title-only"
        return safe
    if safe.get("subtitle"):
        safe["subtitle"] = _limit_words(safe.get("subtitle"), int(density["subtitle_words"]))
    if safe.get("leftTitle"):
        safe["leftTitle"] = _limit_words(safe.get("leftTitle"), int(density["side_title_words"]))
    if safe.get("rightTitle"):
        safe["rightTitle"] = _limit_words(safe.get("rightTitle"), int(density["side_title_words"]))
    if safe.get("quote"):
        safe["quote"] = _limit_words(safe.get("quote"), int(density["quote_words"]))

    bullets = _sanitize_bullets(safe.get("bullets"), max_items=bullet_max_items, max_words=bullet_max_words)
    left_bullets = _sanitize_bullets(safe.get("leftBullets"), max_items=bullet_max_items, max_words=bullet_max_words)
    right_bullets = _sanitize_bullets(safe.get("rightBullets"), max_items=bullet_max_items, max_words=bullet_max_words)

    if not bullets and content_text:
        bullets = _sanitize_bullets(
            _extract_bullets_from_text(str(content_text or ""), max_items=bullet_max_items),
            max_items=bullet_max_items,
            max_words=bullet_max_words,
        )

    if layout == "split":
        if not left_bullets and not right_bullets and bullets:
            midpoint = max(1, min(2, len(bullets) // 2 or 1))
            left_bullets = bullets[:midpoint]
            right_bullets = bullets[midpoint: midpoint + 2]
        safe["leftBullets"] = left_bullets or None
        safe["rightBullets"] = right_bullets or None
        if bullets:
            safe["bullets"] = bullets
    else:
        safe["bullets"] = bullets or None
        if left_bullets:
            safe["leftBullets"] = left_bullets
        if right_bullets:
            safe["rightBullets"] = right_bullets

    normalized_lines: list[str] = []
    subtitle = str(safe.get("subtitle") or "").strip()
    if subtitle:
        normalized_lines.append(subtitle)
    if isinstance(safe.get("bullets"), list) and safe["bullets"]:
        normalized_lines.extend([f"- {b}" for b in safe["bullets"] if str(b).strip()])
    elif layout == "split":
        if isinstance(safe.get("leftBullets"), list):
            normalized_lines.extend([f"- {str(b).strip()}" for b in safe["leftBullets"] if str(b).strip()])
        if isinstance(safe.get("rightBullets"), list):
            normalized_lines.extend([f"- {str(b).strip()}" for b in safe["rightBullets"] if str(b).strip()])

    if normalized_lines:
        safe["content"] = "\n".join(normalized_lines).strip()
    else:
        safe["content"] = _limit_words(content_text or safe.get("content") or safe["title"], 26)

    return safe


def _convert_mindmap_to_content(mindmap_data: Any, language: str = "vi") -> tuple[str, list[str]]:
    """Convert mindmap data to readable content for slide"""
    print(f"[DEBUG] Mindmap data received: {json.dumps(mindmap_data, ensure_ascii=False)}")
    copy = _special_slide_copy(language)

    if not mindmap_data:
        return copy["mindmap_empty_content"], []

    bullets = []

    def traverse(node: Any, level: int = 0):
        if not node:
            return

        label = node.get('label') or node.get('title') or node.get('name') or ''
        print(f"[DEBUG] Node at level {level}: label='{label}'")

        if label and level > 0:
            prefix = '  ' * (level - 1) + '• '
            bullets.append(f"{prefix}{label}")

        children = node.get('children') or []
        for child in children:
            traverse(child, level + 1)

    traverse(mindmap_data)

    main_title = mindmap_data.get('label') or mindmap_data.get('title') or mindmap_data.get('name') or copy["mindmap_title"]
    content = f"{copy['mindmap_content_prefix']}{main_title}"

    print(f"[DEBUG] Main title: {main_title}")
    print(f"[DEBUG] Bullets found: {bullets}")

    return content, bullets[:15]


def _convert_quiz_to_content(quiz_data: List[Any], selected_ids: List[str], language: str = "vi") -> tuple[str, list[str]]:
    """Convert quiz data to readable content for slide"""
    copy = _special_slide_copy(language)
    if not quiz_data:
        return copy["quiz_content"], [
            copy["quiz_fallback_1"],
            copy["quiz_fallback_2"],
        ]

    bullets = []

    # Filter selected quiz questions
    filtered_quiz = []
    if selected_ids and len(selected_ids) > 0:
        for q in quiz_data:
            q_id = str(q.get('id', ''))
            if q_id in selected_ids:
                filtered_quiz.append(q)
    else:
        filtered_quiz = quiz_data[:3]  # Default to first 3 if no selection
    
    for idx, q in enumerate(filtered_quiz[:3], 1):
        question = q.get('question', f"{copy['quiz_title']} {idx}")
        bullets.append(f"{idx}. {question}")

    content = copy["quiz_content"]

    return content, bullets


def _build_closing_slide(item_title: str, slides: List[dict], category: str = "academic", language: str = "vi") -> dict:
    copy = _special_slide_copy(language)
    summary_text = copy["closing_subtitle"]
    slide = {
        "id": "slide-closing",
        "title": copy["closing_title"],
        "subtitle": summary_text,
        "content": summary_text,
        "layout": "title-only",
        "bullets": None,
        "speakerNotes": None,
        "imagePrompt": None,
        "image": None,
    }
    slide["speakerNotes"] = _build_category_speaker_notes(slide, category, item_title=item_title)
    return slide


def _build_summary_slide(item_title: str, slides: List[dict], category: str = "academic", language: str = "vi") -> dict:
    copy = _special_slide_copy(language)
    bullets: list[str] = []
    for slide in slides:
        if not isinstance(slide, dict):
            continue
        if _is_quiz_slide(slide) or _is_closing_slide(slide) or _is_summary_slide(slide):
            continue
        title = _limit_words(slide.get("title") or "", 10)
        subtitle = _limit_words(slide.get("subtitle") or "", 12)
        if title:
            if subtitle:
                bullets.append(_limit_words(f"{title}: {subtitle}", 22))
            else:
                bullets.append(_limit_words(title, 22))
        if len(bullets) >= 3:
            break

    if not bullets:
        bullets = [
            copy["summary_fallback_1"],
            copy["summary_fallback_2"],
            copy["summary_fallback_3"],
        ]

    content = "\n".join([f"- {b}" for b in bullets])
    slide = {
        "id": "slide-summary",
        "title": copy["summary_title"],
        "subtitle": copy["summary_subtitle"],
        "content": content,
        "layout": "grid",
        "bullets": bullets,
        "speakerNotes": None,
        "imagePrompt": None,
        "image": None,
    }
    slide["speakerNotes"] = _build_category_speaker_notes(slide, category, item_title=item_title)
    return slide

@router.post("/outline", response_model=schemas.SlideOutlineResponse)
async def generate_slide_outline(
    req: schemas.GenerateOutlineRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    try:
        item_uuid = _validate_item_ownership(db, current_user, req.item_id)
        req.language = _normalize_language(req.language)
        req.page_count = max(1, min(int(req.page_count or 10), 20))

        item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
        item_title = item.title if item else ("Presentation" if req.language == "en" else "Bài thuyết trình")
        extra_instructions = (req.additional_instructions or "").strip()

        context_text = await _build_context_from_vectordb(
            item_id=req.item_id,
            item_title=item_title,
            extra_instructions=extra_instructions,
            page_count=req.page_count,
        )
        if not context_text:
            context_text = _build_context_from_chunks(db, item_uuid, max_chunks=24, max_chars=7000)

        provider, model, api_key = _get_user_text_runtime(request)
        llm = get_chat_provider(provider=provider, model=model, api_key=api_key, temperature=0.2)

        extra_instr_text = f"Additional instructions:\n{extra_instructions}\n" if extra_instructions else ""
        prompt = f"""
You are an expert presentation strategist.
Generate a concise slide outline in {req.language} for a deck about "{item_title}".

Requirements:
- Return valid JSON only, no markdown.
- Output format:
{{
  "outline": [
    {{
      "index": 1,
      "title": "<short action title, max 12 words>",
      "intent": "<1 sentence explaining what this slide should present, max 24 words>"
    }}
  ]
}}
- Create exactly {req.page_count} outline items.
- Titles must be presentation-ready and specific, not generic placeholders.
- Keep the structure logical from opening -> analysis -> recommendation -> close.
- If the user already provided OUTLINE_DRAFT or REVIEWED_OUTLINE, follow it closely and refine wording only when needed.
- Do not invent facts outside the provided context.

{extra_instr_text}
Context:
{context_text or item_title}
""".strip()

        try:
            response = await llm.ainvoke(prompt)
            content = getattr(response, "content", None) or str(response)
            payload = _safe_json_extract(str(content))
            outline = _sanitize_outline_items(payload.get("outline"), req.page_count, req.language)
            if outline:
                return {"outline": outline}
        except Exception as model_err:
            print(f"[SLIDES] Outline generation fallback: {model_err}")

        return {
            "outline": _build_outline_fallback(
                item_title=item_title,
                page_count=req.page_count,
                language=req.language,
                extra_instructions=extra_instructions,
            )
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=schemas.SlideShow)
async def generate_slides(
    req: schemas.GenerateSlidesRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    from app.services.credit_service import check_user_balance
    if not check_user_balance(str(current_user.id), 1):
        raise HTTPException(status_code=402, detail="Bạn đã hết credit, vui lòng nạp thêm.")

    try:
        item_uuid = _validate_item_ownership(db, current_user, req.item_id)
        req.language = _normalize_language(req.language)
        
        # Get item from DB to get real title
        item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_uuid).first()
        item_title = item.title if item else "Bài thuyết trình"

        content_slide_count = req.page_count
        extra_instructions = (req.additional_instructions or "").strip()
        user_notes = _extract_instruction_block(extra_instructions, "USER_ADDITIONAL_REQUIREMENTS")
        style_brief = _extract_instruction_block(extra_instructions, "STYLE_BRIEF_FROM_USER") or _extract_instruction_block(extra_instructions, "STYLE_BRIEF")
        outline_draft = _extract_instruction_block(extra_instructions, "OUTLINE_DRAFT")
        reviewed_outline = _extract_instruction_block(extra_instructions, "REVIEWED_OUTLINE")
        context_text = await _build_context_from_vectordb(
            item_id=req.item_id,
            item_title=item_title,
            extra_instructions=extra_instructions,
            page_count=content_slide_count,
        )
        if not context_text:
            context_text = _build_context_from_chunks(db, item_uuid)
        if not context_text:
            raise HTTPException(status_code=400, detail="Không tìm thấy nội dung tài liệu để tạo slide.")

        provider, model, api_key = _get_user_text_runtime(request)
        llm = get_chat_provider(provider=provider, model=model, api_key=api_key, temperature=0.2)

        style = req.style.model_dump() if req.style else {}
        category = str(style.get("category") or "academic")
        design_instructions = _build_design_instructions(category)

        extra_part = f"YÊU CẦU BỔ SUNG TỪ NGƯỜI DÙNG:\n{extra_instructions}\n" if extra_instructions else ""
        user_notes_text = f"GHI CHÚ THÊM TỪ NGƯỜI DÙNG (bắt buộc phải đáp ứng):\n{user_notes}\n" if user_notes else ""
        style_brief_text = f"YÊU CẦU THẨM MỸ TỪ NGƯỜI DÙNG (bắt buộc phải phản ánh vào deck):\n{style_brief}\n" if style_brief else ""
        outline_draft_text = f"OUTLINE DRAFT NGƯỜI DÙNG/AI ĐANG DÙNG:\n{outline_draft}\n" if outline_draft else ""
        reviewed_outline_text = f"REVIEWED OUTLINE BẮT BUỘC BÁM SÁT:\n{reviewed_outline}\n" if reviewed_outline else ""
        extra_instr_text = f"THÔNG TIN ĐIỀU KHIỂN BỔ SUNG:\n{extra_instructions}\n" if extra_instructions else ""

        prompt = f"""Bạn là một chuyên gia thiết kế bài thuyết trình (Senior Presentation Designer) chuyên nghiệp.
Nhiệm vụ: Chuyển đổi nội dung ngữ cảnh thành một bộ Slide bài giảng (Pitch Deck) đỉnh cao.

YÊU CẦU THIẾT KẾ (Consulting Strategic Dark Deck):
- Nền tối #0B1220, điểm nhấn Neon Blue #0EA5E9, chữ chính #F8FAFC.
- Thẩm mỹ giống strategic consulting deck: ít chữ thừa, khoảng trắng rộng, cấu trúc cực rõ.
- Panel/card phải phù hợp kiểu glassmorphism: gọn, sang, có nhịp thị giác.
- Tuyệt đối không làm slide giống tài liệu word; slide phải là công cụ thuyết trình, không phải bài viết.

YÊU CẦU NỘI DUNG (quan trọng):
- Không được bịa đặt. Mọi ý trên slide phải rút ra từ ngữ cảnh đã truy xuất từ vector DB / tài liệu gốc.
- Mỗi slide phải có ACTION TITLE: tiêu đề là 1 câu kết luận có giá trị insight, không dùng tiêu đề chung chung.
  Ví dụ tốt: "Tăng trưởng doanh thu cải thiện nhờ tối ưu hóa kênh phân phối"
  Ví dụ không đạt: "Doanh thu", "Phân tích doanh thu", "Tăng trưởng"
- Bố cục MECE: các ý không trùng lặp, có thứ tự logic, chia nhóm rõ ràng.
- Không trình bày nội dung chính theo paragraph dài. Ưu tiên cấu trúc theo Ý / Bullet / Cột / Card.
- Mỗi slide phải có nội dung triển khai rõ ràng:
  - subtitle: 1 câu ngắn để giải thích luận điểm chính hoặc bối cảnh.
  - bullets (ưu tiên cao nhất): tối đa 3 ý súc tích, theo format "Keyword: Description".
  - content: chỉ dùng các dòng ý hỗ trợ hiển thị bullet; KHÔNG viết thành đoạn văn dài.
- Tất cả nội dung phải bám sát ngữ cảnh; nếu thiếu dữ liệu thì ghi rõ "Chưa có dữ liệu trong tài liệu" thay vì bịa.

[QUAN TRỌNG - RÀNG BUỘC KÍCH THƯỚC ĐỂ KHÔNG BỊ VỠ LAYOUT]:
- slide.title (Tiêu đề): Tối đa 12 từ. Khẳng định ngắn gọn.
- slide.bullets (Nội dung): TỐI ĐA 3 bullet mỗi slide. MỖI BULLET TỐI ĐA 15 TỪ. Tuyệt đối không viết dài hơn. Nếu viết dài, chữ sẽ bị cắt khỏi màn hình.
- Rút gọn mọi câu từ, chỉ giữ lại Key Insight.

SPEAKER NOTES (bắt buộc, phải hay):
- Mỗi slide phải có speakerNotes (không null).
- speakerNotes phải phù hợp category:
  - academic: giọng giải thích mạch lạc, nhấn khái niệm -> ví dụ -> ý nghĩa.
  - business: giọng executive, rõ tác động -> bằng chứng -> hành động.
  - creative: giọng storytelling, có hook ngắn và chuyển ý giàu hình ảnh.
  - children: giọng đơn giản, thân thiện, câu ngắn và dễ hiểu.
- speakerNotes dài 45–90 giây/slide, chia 6–10 dòng, có mở bài → luận điểm → bằng chứng → hàm ý → chuyển slide.
- Không lặp y nguyên bullets; phải có cách diễn đạt nói tự nhiên, chắc, thuyết phục.

Yêu cầu chi tiết:
- Ngôn ngữ: {req.language}
- SỐ SLIDE NỘI DUNG CHÍNH: {content_slide_count} slide
- Phong cách: {json.dumps(style, ensure_ascii=False)}
- Thiết kế: {design_instructions}
- Tránh bịa đặt: chỉ dùng thông tin có trong ngữ cảnh.
- Mỗi slide phải có layout phù hợp:
  - "title-only": slide mở đầu/kết, title rất lớn + subtitle, tone executive.
  - "grid": bento style 3 ô, mỗi ô là 1 trụ cột riêng biệt; bullets theo "Keyword: Description".
  - "split": consulting contrast, so sánh 2 nhóm ý; bắt buộc có leftTitle/rightTitle và mỗi bên tối đa 3 bullet.
  - "full": 1 insight trung tâm + 3–4 ý supporting.
  - "image-right": text bên trái, hình minh họa bên phải; hình phải hỗ trợ luận điểm.
- Ưu tiên dùng "grid", "split", "image-right"; chỉ dùng "full" khi thực sự cần nhấn mạnh 1 insight lớn.
- Không lạm dụng "image-left".
- Chỉ dùng ảnh minh họa cho MỘT SỐ slide nội dung thật sự cần trực quan hóa, khoảng 20%–35% số slide nội dung.
- Không gán ảnh cho slide mở đầu, tổng kết nhanh, câu hỏi ôn tập, sơ đồ tư duy, hoặc slide cảm ơn.
- Nếu slide không cần ảnh, đặt "imagePrompt": null và không chọn layout image-left/image-right.
- Nếu slide cần ảnh, ảnh phải mô tả khái niệm/quy trình/bối cảnh của slide, không phải ảnh trang trí chung chung.
- HỆ THỐNG LUÔN DÙNG OUTLINE: mọi slide phải bám theo outline người dùng/AI đã duyệt, không tự đổi cấu trúc deck.
- CHIẾN LƯỢC LAYOUT THEO CATEGORY:
  - academic: ưu tiên "grid" và "split"; chỉ dùng "image-right" khi có minh hoạ thực sự hữu ích.
  - business: ưu tiên "split", "grid", "image-right"; hạn chế "full" trừ insight lớn.
  - creative: ưu tiên "image-right" và "full"; dùng "split" khi cần đối chiếu 2 phía.
  - children: ưu tiên "full", "grid", "image-right"; bố cục phải đơn giản, ít chia cột dày đặc.
- Output CHỈ trả về JSON hợp lệ, KHÔNG markdown:
{{
  "id": "<string>",
  "title": "{item_title}",
  "slides": [
    {{
      "id": "<string>",
      "title": "<string>",
      "subtitle": "<string|null>",
      "bullets": ["<string>", "..."] | null,
      "leftTitle": "<string|null>",
      "leftBullets": ["<string>", "..."] | null,
      "rightTitle": "<string|null>",
      "rightBullets": ["<string>", "..."] | null,
      "quote": "<string|null>",
      "content": "<string>",
      "layout": "title-only|split|grid|full|image-left|image-right",
      "speakerNotes": "<string>",
      "imagePrompt": "<string|null>",
      "image": "<string|null>"
    }}
  ],
  "style": {{
    "category": "<string>",
    "colorPalette": ["#0EA5E9", "#38BDF8", "#1D4ED8"],
    "font": "Inter"
  }}
}}

{user_notes_text}
{style_brief_text}
{outline_draft_text}
{reviewed_outline_text}
{extra_instr_text}

Ngữ cảnh tài liệu:
{context_text}
""".strip()

        response = await llm.ainvoke(prompt)
        content = getattr(response, "content", None) or str(response)

        # ─── Credit deduction for Slides ───
        try:
            usage = getattr(response, "usage_metadata", None) or {}
            input_tokens = usage.get("input_tokens", 0) or 0
            output_tokens = usage.get("output_tokens", 0) or 0

            if input_tokens + output_tokens > 0:
                from app.services.credit_service import deduct_credits_for_ai
                deduct_credits_for_ai(
                    user_id=str(current_user.id),
                    task_type="Slides",
                    model_name=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
        except Exception as credit_err:
            print(f"[SLIDES] Credit deduction skipped: {credit_err}")

        data = _safe_json_extract(str(content))
        
        # Set correct title
        data["title"] = item_title

        # Ensure data has slides
        if 'slides' not in data or not isinstance(data['slides'], list):
            data['slides'] = []

        def _fallback_content(slide: dict) -> str:
            parts: list[str] = []
            subtitle = (slide.get("subtitle") or "").strip()
            quote = (slide.get("quote") or "").strip()
            bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
            left_title = (slide.get("leftTitle") or "").strip()
            right_title = (slide.get("rightTitle") or "").strip()
            left_bullets = slide.get("leftBullets") if isinstance(slide.get("leftBullets"), list) else []
            right_bullets = slide.get("rightBullets") if isinstance(slide.get("rightBullets"), list) else []

            if subtitle:
                parts.append(subtitle)
            if quote:
                parts.append(f"“{quote}”")
            if bullets:
                parts.append("\n".join([f"- {str(b).strip()}" for b in bullets if str(b).strip()]))
            if left_bullets or right_bullets:
                if left_title or left_bullets:
                    left_lines = "\n".join([f"- {str(b).strip()}" for b in left_bullets if str(b).strip()])
                    parts.append("\n".join([left_title or "Phần 1", left_lines]).strip())
                if right_title or right_bullets:
                    right_lines = "\n".join([f"- {str(b).strip()}" for b in right_bullets if str(b).strip()])
                    parts.append("\n".join([right_title or "Phần 2", right_lines]).strip())

            content_text = "\n\n".join([p for p in parts if p]).strip()
            return content_text

        def _fallback_speaker_notes(slide: dict) -> str:
            return _build_category_speaker_notes(slide, category, item_title=item_title)

        # Ensure every slide has content & speaker notes - fall back if missing
        processed_slides = []
        for slide in data['slides']:
            if not isinstance(slide, dict):
                continue
                
            # Build content from available fields
            content = slide.get('content')
            if not content and slide.get('subtitle'):
                content = slide['subtitle']
            if not content and slide.get('bullets') and isinstance(slide['bullets'], list):
                content = '\n'.join([f'- {b}' for b in slide['bullets']])
            if not content and slide.get('quote'):
                content = slide['quote']
            if not content and slide.get('title'):
                content = slide['title']
            if not content:
                content = _fallback_content(slide)

            bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
            if not bullets:
                derived = _extract_bullets_from_text(str(content or ""), max_items=3)
                if derived:
                    slide["bullets"] = derived

            left_bullets = slide.get("leftBullets") if isinstance(slide.get("leftBullets"), list) else []
            right_bullets = slide.get("rightBullets") if isinstance(slide.get("rightBullets"), list) else []
            if slide.get("layout") == "split" and (not left_bullets and not right_bullets):
                derived = _extract_bullets_from_text(str(content or ""), max_items=3)
                if derived:
                    mid = max(1, len(derived) // 2)
                    slide["leftBullets"] = derived[:mid]
                    slide["rightBullets"] = derived[mid:]
            slide = _sanitize_slide_for_layout(slide, str(content or ""), category, req.language)
            content = slide.get("content") or str(content or "")

            speaker_notes = slide.get("speakerNotes")
            if not isinstance(speaker_notes, str) or len(speaker_notes.strip()) < 80:
                speaker_notes = _fallback_speaker_notes({**slide, "content": content})
                
            image = slide.get('image') or _resolve_image_for_prompt(slide.get('imagePrompt'))
                
            processed_slides.append({
                **slide,
                'content': content,
                'image': image,
                'speakerNotes': speaker_notes
            })
        
        data['slides'] = processed_slides

        # ARRANGE SLIDES IN CORRECT ORDER
        final_slides = []
        
        # Extract title slide if exists
        title_slide = None
        if len(data['slides']) >= 1:
            title_slide = data['slides'][0]
            final_slides.append(title_slide)
            
            # Add mindmap after title slide if enabled
            if req.include_mindmap:
                print(f"[SLIDES] Adding mindmap slide")
                # Create mindmap slide with real data
                copy = _special_slide_copy(req.language)
                mindmap_content, mindmap_bullets = _convert_mindmap_to_content(req.mindmap_data, req.language)
                mindmap_slide = {
                    "id": "slide-mindmap",
                    "title": copy["mindmap_title"],
                    "subtitle": copy["mindmap_subtitle"],
                    "content": mindmap_content,
                    "layout": "grid",
                    "bullets": mindmap_bullets if mindmap_bullets else None,
                    "speakerNotes": None,
                    "imagePrompt": "A professional educational mind map overview",
                    "image": None
                }
                final_slides.append(mindmap_slide)
                
        # Add content slides (from index 1 onwards, without mindmap/quiz)
        content_slides = []
        closing_candidate = None
        summary_candidate = None
        for slide in data['slides']:
            slide_title = slide.get('title', '').lower()
            is_mindmap = 'mindmap' in slide_title or 'sơ đồ' in slide_title or 'tư duy' in slide_title
            is_quiz = 'quiz' in slide_title or 'câu hỏi' in slide_title or 'trắc nghiệm' in slide_title
            is_summary = _is_summary_slide(slide)
            is_closing = _is_closing_slide(slide)
            
            if is_summary:
                if summary_candidate is None:
                    summary_candidate = slide
                continue

            if is_closing:
                if closing_candidate is None:
                    closing_candidate = slide
                continue

            if not is_mindmap and not is_quiz and slide != title_slide:
                content_slides.append(slide)
                
        # Trim if too many content slides, but never auto-create placeholder slides
        if len(content_slides) > content_slide_count:
            # Trim if too many
            content_slides = content_slides[:content_slide_count]

        final_slides.append(summary_candidate or _build_summary_slide(item_title, content_slides, category, req.language))

        final_slides.extend(content_slides)
        
        # Add quiz before last slide if enabled
        if req.include_quiz:
            print(f"[SLIDES] Adding quiz slide")
            copy = _special_slide_copy(req.language)
            quiz_content, quiz_bullets = _convert_quiz_to_content(req.quiz_data, req.selected_quiz_ids or [], req.language)
            quiz_slide = {
                "id": "slide-quiz",
                "title": copy["quiz_title"],
                "subtitle": copy["quiz_subtitle"],
                "content": quiz_content,
                "layout": "grid",
                "bullets": quiz_bullets,
                "speakerNotes": None,
                "imagePrompt": "Educational quiz or questions illustration",
                "image": None
            }
            final_slides.append(quiz_slide)

        final_slides.append(closing_candidate or _build_closing_slide(item_title, content_slides, category, req.language))
        final_slides = _apply_selective_images(final_slides)
        final_slides = _apply_category_layout_strategy(final_slides, category)
                
        # Update final slides
        sanitized_final_slides = []
        for slide in final_slides:
            if not isinstance(slide, dict):
                continue
            if not slide.get("content"):
                slide["content"] = _fallback_content(slide)
            slide = _sanitize_slide_for_layout(slide, str(slide.get("content") or ""), category, req.language)
            if slide.get("imagePrompt") and not slide.get("image"):
                slide["image"] = _resolve_image_for_prompt(slide.get("imagePrompt"))
            speaker_notes = slide.get("speakerNotes")
            if not isinstance(speaker_notes, str) or len(speaker_notes.strip()) < 80:
                slide["speakerNotes"] = _fallback_speaker_notes(slide)
            slide["content"] = str(slide.get("content") or "").strip()
            sanitized_final_slides.append(slide)
        sanitized_final_slides = _ensure_important_slides_have_images(sanitized_final_slides)
        data['slides'] = sanitized_final_slides
        
        print(f"[SLIDES] Final slide count: {len(final_slides)}")
        
        # UI style is the single source of truth; do not trust model-generated style
        if req.style:
            data["style"] = req.style.model_dump()

        return schemas.SlideShow(**data)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SLIDES] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

