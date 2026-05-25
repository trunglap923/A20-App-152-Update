import re
import httpx
from xml.sax.saxutils import escape
from fastapi import HTTPException
from app.config import settings

AZURE_TTS_PRESETS: dict[str, dict[str, str]] = {
    "auto": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "0%",
        "pitch": "0%",
        "region": "neutral",
    },
    "preset:nu_mien_bac": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "-16%",
        "pitch": "+3st",
        "region": "north",
    },
    "preset:nu_mien_nam": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "+8%",
        "pitch": "-1st",
        "region": "south",
    },
    "preset:nm_mien_bac": {
        "voice": "vi-VN-NamMinhNeural",
        "rate": "-12%",
        "pitch": "-3st",
        "region": "north",
    },
    "preset:nm_mien_nam": {
        "voice": "vi-VN-NamMinhNeural",
        "rate": "+10%",
        "pitch": "-1st",
        "region": "south",
    },
    "azure:vi-VN-HoaiMyNeural": {
        "voice": "vi-VN-HoaiMyNeural",
        "rate": "0%",
        "pitch": "0%",
        "region": "neutral",
    },
    "azure:vi-VN-NamMinhNeural": {
        "voice": "vi-VN-NamMinhNeural",
        "rate": "0%",
        "pitch": "0%",
        "region": "neutral",
    },
}


def resolve_azure_tts_profile(selection: str | None) -> dict[str, str]:
    safe_selection = (selection or "auto").strip()
    if safe_selection in AZURE_TTS_PRESETS:
        return AZURE_TTS_PRESETS[safe_selection]

    if safe_selection.startswith("azure:"):
        voice_name = safe_selection.split(":", 1)[1].strip()
        if re.fullmatch(r"[A-Za-z0-9-]+", voice_name):
            return {
                "voice": voice_name,
                "rate": "0%",
                "pitch": "0%",
                "region": "neutral",
            }

    return AZURE_TTS_PRESETS["auto"]


def regionalize_tts_text(text: str, region: str | None) -> str:
    safe_text = (text or "").strip()
    if not safe_text:
        return ""

    if region == "south":
        replacements = [
            (r"\bvâng\b", "dạ"),
            (r"\bVâng\b", "Dạ"),
            (r"\bkhông\b", "hông"),
            (r"\bKhông\b", "Hông"),
            (r"\bđấy\b", "đó"),
            (r"\bĐấy\b", "Đó"),
        ]
        for pattern, replacement in replacements:
            safe_text = re.sub(pattern, replacement, safe_text)
        return safe_text

    if region == "north":
        replacements = [
            (r"\bdạ\b", "vâng"),
            (r"\bDạ\b", "Vâng"),
            (r"\bhông\b", "không"),
            (r"\bHông\b", "Không"),
            (r"\bđó\b", "đấy"),
            (r"\bĐó\b", "Đấy"),
        ]
        for pattern, replacement in replacements:
            safe_text = re.sub(pattern, replacement, safe_text)
        if not re.search(r"\b(vâng|ạ)\b", safe_text.lower()):
            safe_text = f"Vâng, {safe_text}"
        return safe_text

    return safe_text


def build_azure_ssml(text: str, selection: str | None) -> str:
    profile = resolve_azure_tts_profile(selection)
    regional_text = regionalize_tts_text(text, profile.get("region"))
    safe_text = escape(regional_text)
    return f"""
<speak version="1.0" xml:lang="vi-VN">
  <voice name="{profile["voice"]}">
    <prosody rate="{profile["rate"]}" pitch="{profile["pitch"]}">{safe_text}</prosody>
  </voice>
</speak>
""".strip()

class TTSService:
    @staticmethod
    async def synthesize(text: str, voice_selection: str | None) -> tuple[bytes, str]:
        if not text:
            raise ValueError("Nội dung TTS không được để trống")

        if len(text) > 2200:
            text = text[:2200].rstrip() + "..."

        if not settings.AZURE_SPEECH_KEY or not settings.AZURE_SPEECH_REGION:
            raise HTTPException(
                status_code=503,
                detail="Azure TTS chưa được cấu hình. Hãy thêm AZURE_SPEECH_KEY và AZURE_SPEECH_REGION vào môi trường backend.",
            )

        endpoint = f"https://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
        ssml = build_azure_ssml(text, voice_selection)
        headers = {
            "Ocp-Apim-Subscription-Key": settings.AZURE_SPEECH_KEY,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
            "User-Agent": "Nexus-Chat-TTS",
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(endpoint, content=ssml.encode("utf-8"), headers=headers)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Không thể kết nối Azure TTS: {exc}") from exc

        if response.status_code >= 400:
            detail = response.text.strip() or f"Azure TTS lỗi HTTP {response.status_code}"
            raise HTTPException(status_code=502, detail=detail)

        voice_used = resolve_azure_tts_profile(voice_selection).get("voice", "unknown")
        return response.content, voice_used

tts_service = TTSService()
