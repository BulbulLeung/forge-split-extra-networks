import asyncio
import re
from functools import lru_cache
from typing import Any

import gradio as gr
import httpx
from fastapi import FastAPI
from pydantic import BaseModel

from modules import script_callbacks, shared

_LOCAL_AI_TIMEOUT_S = 30.0
_LOCAL_AI_CONNECT_ERROR = "Local AI connect error"
_QWEN_THINKING_PREFILL = "<think>\n\n</think>\n\n"
_SD_LORA_RE = re.compile(r"<lora:[^:>]+:[\d.]+>", re.I)
_SD_LORA_NEG_RE = re.compile(r"\(lora:[^:)]+:[\d.]+\)", re.I)
_SD_WEIGHT_RE = re.compile(r"\([^()]+:\d+\.?\d*\)")
_SD_WEIGHT_SINGLE_EXPLICIT_RE = re.compile(r"^\((.+):([\d.]+)\)$")
_SD_WEIGHT_SINGLE_IMPLICIT_RE = re.compile(r"^\((.+)\)$")
_SD_WEIGHT_OPEN_RE = re.compile(r"^\((.+)$")
_SD_WEIGHT_CLOSE_EXPLICIT_RE = re.compile(r"^(.+):([\d.]+)\)$")
_SD_WEIGHT_CLOSE_IMPLICIT_RE = re.compile(r"^(.+)\)$")
_SD_BREAK_RE = re.compile(r"\bBREAK\b", re.I)
_SD_PROT_FMT = "\u27e6SDPROT{index}\u27e7"
_SD_PROT_RE = re.compile(r"\u27e6SDPROT(\d+)\u27e7")
_NON_ENGLISH_SCRIPT_RE = re.compile(
    r"[\u0400-\u04FF"
    r"\u0600-\u06FF"
    r"\u3040-\u309F"
    r"\u30A0-\u30FF"
    r"\u4E00-\u9FFF"
    r"\u3400-\u4DBF"
    r"\uAC00-\uD7AF"
    r"]"
)


def _insert_needs_llm(text: str) -> bool:
    trimmed = (text or "").strip()
    if trimmed.startswith("#"):
        return True
    return _NON_ENGLISH_SCRIPT_RE.search(trimmed) is not None


class LocalAIConnectionError(Exception):
    pass


class TranslateTooltipRequest(BaseModel):
    text: str


class ProcessInsertRequest(BaseModel):
    text: str


def _local_ai_enabled() -> bool:
    return bool(getattr(shared.opts, "forge_en_local_ai_enabled", False))


def _local_ai_base_url() -> str:
    url = (getattr(shared.opts, "forge_en_local_ai_base_url", None) or "").strip()
    if not url:
        raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR)
    return url.rstrip("/")


def _local_ai_model() -> str:
    model = (getattr(shared.opts, "forge_en_local_ai_model", None) or "").strip()
    if not model:
        raise LocalAIConnectionError("Local AI model name is not configured")
    return model


def _chat_completions_url() -> str:
    base = _local_ai_base_url()
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def _wildcard_wrap_literal() -> str:
    wrap = getattr(shared.opts, "dp_parser_wildcard_wrap", None)
    if wrap is None or not str(wrap).strip():
        return "__"
    return str(wrap)


def _wildcard_pattern() -> re.Pattern[str] | None:
    return _wildcard_pattern_cached(_wildcard_wrap_literal())


@lru_cache(maxsize=8)
def _wildcard_pattern_cached(wrap: str) -> re.Pattern[str] | None:
    if not wrap:
        return None
    escaped = re.escape(wrap)
    return re.compile(escaped + r"[^\s" + escaped + r"]+" + escaped)


def _mask_sd_syntax(text: str) -> tuple[str, list[str]]:
    tokens: list[str] = []

    def replacer(match: re.Match[str]) -> str:
        tokens.append(match.group(0))
        return _SD_PROT_FMT.format(index=len(tokens) - 1)

    result = text
    patterns: list[re.Pattern[str] | None] = [
        _SD_LORA_RE,
        _SD_LORA_NEG_RE,
        _wildcard_pattern(),
        _SD_WEIGHT_RE,
        _SD_BREAK_RE,
    ]
    for pattern in patterns:
        if pattern is not None:
            result = pattern.sub(replacer, result)
    return result, tokens


def _unmask_sd_syntax(text: str, tokens: list[str]) -> str:
    result = text
    for index, token in enumerate(tokens):
        placeholder = _SD_PROT_FMT.format(index=index)
        result = result.replace(placeholder, token)
        result = re.sub(
            rf"\u27e6?\s*SDPROT{index}\s*\u27e7?",
            token,
            result,
            flags=re.I,
        )
    return result


def _strip_hallucinated_placeholders(text: str) -> str:
    result = re.sub(r"\u27e6SDPROT\d+\u27e7", "", text)
    result = re.sub(r"\bSDPROT\d+\b", "", result, flags=re.I)
    return result


def _clean_tooltip_translation(text: str, source: str) -> str:
    result = _strip_hallucinated_placeholders(text)
    result = result.split("\n")[0].strip()
    src = (source or "").strip()
    if src:
        src_lower = src.lower()
        parts = re.split(r"[,，]", result)
        cleaned: list[str] = []
        for part in parts:
            piece = part.strip()
            if not piece:
                continue
            if piece.lower() == src_lower:
                continue
            if re.fullmatch(r"SDPROT\d+", piece, flags=re.I):
                continue
            cleaned.append(piece)
        if cleaned:
            result = "，".join(cleaned)
    return result.strip(" ,，")


def _sd_tooltip_system(lang: str) -> str:
    return (
        f"Translate this single SDXL/booru prompt tag literally into {lang}. "
        f"Output ONLY the translation. No English. No extra tags or explanation."
    )


def _sd_insert_literal_system() -> str:
    return (
        "Translate this text literally into English. "
        "Output ONE single prompt fragment only. "
        "No comma-separated tag list. No explanation."
    )


def _translate_tooltip_chunk(chunk: str, lang: str) -> str:
    stripped = chunk.strip()
    if not stripped:
        return chunk
    raw = call_local_ai(_sd_tooltip_system(lang), stripped, max_tokens=32)
    return _clean_tooltip_translation(raw, stripped)


def _translate_weight_syntax_part(
    text: str,
    translate_inner,
) -> str | None:
    stripped = (text or "").strip()
    if not stripped:
        return None

    match = _SD_WEIGHT_SINGLE_EXPLICIT_RE.fullmatch(stripped)
    if match:
        return f"({translate_inner(match.group(1))}:{match.group(2)})"

    match = _SD_WEIGHT_SINGLE_IMPLICIT_RE.fullmatch(stripped)
    if match:
        return f"({translate_inner(match.group(1))})"

    match = _SD_WEIGHT_CLOSE_EXPLICIT_RE.fullmatch(stripped)
    if match:
        return f"{translate_inner(match.group(1))}:{match.group(2)})"

    match = _SD_WEIGHT_CLOSE_IMPLICIT_RE.fullmatch(stripped)
    if match:
        return f"{translate_inner(match.group(1))})"

    match = _SD_WEIGHT_OPEN_RE.fullmatch(stripped)
    if match and not stripped.endswith(")"):
        return f"({translate_inner(match.group(1))}"

    return None


def _translate_masked_segments(masked: str, tokens: list[str], lang: str) -> str:
    if not tokens:
        return _translate_tooltip_chunk(masked, lang)

    parts: list[str] = []
    last = 0
    for match in _SD_PROT_RE.finditer(masked):
        chunk = masked[last : match.start()]
        if chunk:
            parts.append(
                _translate_tooltip_chunk(chunk, lang) if chunk.strip() else chunk
            )
        idx = int(match.group(1))
        if 0 <= idx < len(tokens):
            parts.append(tokens[idx])
        last = match.end()

    tail = masked[last:]
    if tail:
        parts.append(_translate_tooltip_chunk(tail, lang) if tail.strip() else tail)
    return "".join(parts)


def _translate_insert_chunk(chunk: str) -> str:
    stripped = chunk.strip()
    if not stripped:
        return chunk
    raw = call_local_ai(_sd_insert_literal_system(), stripped, max_tokens=32)
    return _clean_tooltip_translation(raw, stripped)


def _translate_insert_masked(masked: str, tokens: list[str]) -> str:
    if not tokens:
        return _translate_insert_chunk(masked)

    parts: list[str] = []
    last = 0
    for match in _SD_PROT_RE.finditer(masked):
        chunk = masked[last : match.start()]
        if chunk:
            parts.append(_translate_insert_chunk(chunk) if chunk.strip() else chunk)
        idx = int(match.group(1))
        if 0 <= idx < len(tokens):
            parts.append(tokens[idx])
        last = match.end()

    tail = masked[last:]
    if tail:
        parts.append(_translate_insert_chunk(tail) if tail.strip() else tail)
    return _strip_hallucinated_placeholders("".join(parts))


def _sd_generate_system() -> str:
    return (
        "You are a Stable Diffusion XL prompt expert. "
        "Interpret the meaning of the user's description and generate "
        "English SD/SDXL-compatible prompt tags from it ONLY. "
        "Include ONLY tags explicitly stated or directly implied by the description. "
        "Do NOT add quality tags (masterpiece, best quality, highly detailed, etc.), "
        "style or rendering tags, or any tag not grounded in the user's text. "
        "Use booru-style comma-separated tags, not long sentences. "
        "Return ONLY the prompt text."
    )


_GENERIC_QUALITY_TAGS = frozenset(
    {
        "masterpiece",
        "best quality",
        "amazing quality",
        "great quality",
        "good quality",
        "high quality",
        "normal quality",
        "low quality",
        "worst quality",
        "very aesthetic",
        "aesthetic",
        "highly detailed",
        "ultra-detailed",
        "ultra detailed",
        "extremely detailed",
        "super detailed",
        "incredibly detailed",
        "absurdres",
        "incredibly absurdres",
        "newest",
        "highres",
        "wallpaper",
        "8k",
        "4k",
        "2k",
        "ray tracing",
        "chromatic aberration",
        "dynamic lighting",
        "ambient occlusion",
        "detailed background",
        "intricate details",
        "sharp focus",
        "professional",
        "cinematic lighting",
        "studio lighting",
        "perfect lighting",
        "beautiful lighting",
    }
)


def _tag_grounded_in_source(tag: str, source: str) -> bool:
    tag_lower = tag.strip().lower()
    source_lower = source.strip().lower()
    return tag_lower in source_lower


def _is_generic_boilerplate_tag(tag: str) -> bool:
    return tag.strip().lower() in _GENERIC_QUALITY_TAGS


def _filter_generate_parts(source: str, parts: list[str]) -> list[str]:
    filtered: list[str] = []
    for part in parts:
        piece = part.strip()
        if not piece:
            continue
        if _is_generic_boilerplate_tag(piece) and not _tag_grounded_in_source(
            piece, source
        ):
            continue
        filtered.append(piece)
    return filtered


def _strip_llm_response(text: str) -> str:
    result = (text or "").strip()
    result = re.sub(
        r"<think>\n?[\s\S]*?</think>\n?",
        "",
        result,
        flags=re.DOTALL,
    ).strip()
    if result.startswith("```"):
        result = re.sub(r"^```[a-zA-Z]*\n?", "", result)
        result = re.sub(r"\n?```$", "", result)
    return result.strip()


def call_local_ai(
    system_prompt: str,
    user_text: str,
    *,
    max_tokens: int = 128,
    disable_thinking: bool = True,
    temperature: float = 0.3,
) -> str:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_text},
    ]
    if disable_thinking:
        messages.append({"role": "assistant", "content": _QWEN_THINKING_PREFILL})

    payload: dict[str, Any] = {
        "model": _local_ai_model(),
        "messages": messages,
        "temperature": temperature,
        "stream": False,
        "max_tokens": max_tokens,
    }
    if disable_thinking:
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    try:
        with httpx.Client(timeout=_LOCAL_AI_TIMEOUT_S) as client:
            response = client.post(_chat_completions_url(), json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as ex:
        raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR) from ex
    except httpx.RequestError as ex:
        raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR) from ex
    except httpx.HTTPStatusError as ex:
        raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR) from ex
    except Exception as ex:
        raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR) from ex

    try:
        message = data["choices"][0]["message"]
        content = message.get("content")
        reasoning = message.get("reasoning_content") or ""
        if not str(content or "").strip() and str(reasoning).strip():
            raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR)
    except LocalAIConnectionError:
        raise
    except (KeyError, IndexError, TypeError) as ex:
        raise LocalAIConnectionError(_LOCAL_AI_CONNECT_ERROR) from ex

    return _strip_llm_response(str(content))


def _translate_lang() -> str:
    return (
        getattr(shared.opts, "forge_en_local_ai_translate_lang", None) or "繁體中文"
    ).strip()


def _is_lora_part(text: str) -> bool:
    stripped = text.strip()
    return bool(
        _SD_LORA_RE.fullmatch(stripped) or _SD_LORA_NEG_RE.fullmatch(stripped)
    )


def _is_wildcard_part(text: str) -> bool:
    pattern = _wildcard_pattern()
    if pattern is None:
        return False
    return bool(pattern.fullmatch(text.strip()))


def translate_for_tooltip(text: str) -> str:
    if _is_lora_part(text) or _is_wildcard_part(text):
        return ""
    lang = _translate_lang()

    def translate_inner(inner: str) -> str:
        return _translate_tooltip_chunk(inner, lang)

    weighted = _translate_weight_syntax_part(text, translate_inner)
    if weighted is not None:
        return _clean_tooltip_translation(weighted, text)

    masked, tokens = _mask_sd_syntax(text)
    result = _translate_masked_segments(masked, tokens, lang)
    return _clean_tooltip_translation(result, text)


def process_insert_text(text: str) -> dict[str, Any]:
    trimmed = (text or "").strip()
    if not trimmed:
        return {"text": "", "parts": None, "error": None}

    if not _local_ai_enabled():
        return {"text": trimmed, "parts": None, "error": None}

    if not _insert_needs_llm(trimmed):
        return {"text": trimmed, "parts": None, "error": None}

    if trimmed.startswith("#"):
        sentence = trimmed[1:].strip()
        if not sentence:
            return {"text": "", "parts": [], "error": None}

        raw = call_local_ai(
            _sd_generate_system(), sentence, max_tokens=256, temperature=0.2
        )
        parts = _filter_generate_parts(
            sentence, [p.strip() for p in raw.split(",") if p.strip()]
        )
        return {"text": None, "parts": parts, "error": None}

    weighted = _translate_weight_syntax_part(trimmed, _translate_insert_chunk)
    if weighted is not None:
        return {
            "text": _clean_tooltip_translation(weighted, trimmed),
            "parts": None,
            "error": None,
        }

    masked, tokens = _mask_sd_syntax(trimmed)
    return {
        "text": _translate_insert_masked(masked, tokens),
        "parts": None,
        "error": None,
    }


def register_local_ai_routes(_: gr.Blocks, app: FastAPI):
    @app.get("/forge-en-local-ai/ping")
    async def ping_local_ai():
        if not _local_ai_enabled():
            return {"ok": True, "error": None}

        try:
            await asyncio.to_thread(
                call_local_ai,
                "Reply with exactly: ok",
                "ping",
            )
            return {"ok": True, "error": None}
        except LocalAIConnectionError as ex:
            return {"ok": False, "error": str(ex)}
        except Exception:
            return {"ok": False, "error": _LOCAL_AI_CONNECT_ERROR}

    @app.post("/forge-en-local-ai/translate-tooltip")
    async def translate_tooltip(req: TranslateTooltipRequest):
        text = (req.text or "").strip()
        if not text:
            return {"translation": "", "error": None}

        if not _local_ai_enabled():
            return {"translation": "", "error": None}

        try:
            translation = await asyncio.to_thread(translate_for_tooltip, text)
            return {"translation": translation, "error": None}
        except LocalAIConnectionError as ex:
            return {"translation": "", "error": str(ex)}
        except Exception:
            return {"translation": "", "error": _LOCAL_AI_CONNECT_ERROR}

    @app.post("/forge-en-local-ai/process-insert")
    async def process_insert(req: ProcessInsertRequest):
        try:
            result = await asyncio.to_thread(process_insert_text, req.text)
            return {**result, "error": None}
        except LocalAIConnectionError as ex:
            return {"text": None, "parts": None, "error": str(ex)}
        except Exception:
            return {"text": None, "parts": None, "error": _LOCAL_AI_CONNECT_ERROR}


script_callbacks.on_app_started(
    register_local_ai_routes,
    name="forge-split-extra-networks-local-ai-api",
)
