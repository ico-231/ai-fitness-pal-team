"""Lớp gọi mô hình ngôn ngữ (LLM) theo chuẩn OpenAI Chat Completions.

Vì gần như mọi nhà cung cấp đều hỗ trợ chuẩn này (OpenAI, Gemini, Inception Mercury, OpenRouter,
Groq, DeepSeek, Ollama...), chỉ cần đổi biến môi trường là chạy, không phải sửa code.

Hỗ trợ 2 nhà cung cấp cùng lúc:
- PRIMARY  (LLM_*)            : model chính trả lời chat (vd Mercury — rất nhanh, chỉ đọc chữ).
- SECONDARY (SECONDARY_LLM_*) : dự phòng khi primary lỗi/hết hạn mức, và đọc ẢNH nếu
                                LLM_VISION_USE_SECONDARY=true (vd Gemini — có vision).
Mỗi nhà cung cấp có thể có nhiều key và nhiều model → hệ thống tự xoay vòng khi gặp 429.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from typing import TYPE_CHECKING

from ..config import get_settings
from . import tracing

if TYPE_CHECKING:
    from openai import AsyncOpenAI

log = logging.getLogger("fitbro.llm")


def _oa():
    """Nạp thư viện openai khi thật sự cần (gọi AI hoặc so khớp lỗi của nó).
    Nạp sẵn lúc khởi động tốn ~2 giây → mỗi lần Vercel khởi động lạnh đều chậm theo, kể cả request không dùng AI."""
    import openai

    return openai


class LLMError(Exception):
    """Lỗi thân thiện để hiển thị cho người dùng."""


class ToolsNotSupported(LLMError):
    pass


class ProviderRefusal(LLMError):
    """Nhà cung cấp từ chối nội dung (bộ lọc an toàn riêng của họ trả về HTTP 400)."""


REFUSAL_TEXT = ("Mình không thể hỗ trợ yêu cầu này. Mình vẫn sẵn sàng giúp bạn về tập luyện, dinh dưỡng "
                "hoặc theo dõi tiến độ nhé.")
_REFUSAL_PAT = re.compile(r"not able to|unable to (help|assist|share|comply)|can(no|')t (help|assist|share|comply)|"
                          r"content (policy|filter)|safety (system|filter)|violat|i'm sorry", re.IGNORECASE)


def _is_refusal(e: Exception) -> bool:
    m = str(e)
    return bool(_REFUSAL_PAT.search(m)) and not re.search(r"tool|function|response_format|stream_options|reasoning|schema|parameter", m, re.I)


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict = field(default_factory=dict)
    raw_arguments: str = ""
    # Dữ liệu riêng của nhà cung cấp phải gửi trả lại nguyên văn ở lượt sau
    # (vd Gemini 3: extra_content.google.thought_signature — thiếu là API báo lỗi 400)
    extra: dict | None = None


@dataclass
class StreamResult:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    model: str = ""


@dataclass(frozen=True)
class Endpoint:
    base_url: str
    key: str
    model: str
    effort: str
    tag: str  # "primary" | "secondary"


_clients: dict[tuple[str, str, int], AsyncOpenAI] = {}
_no_effort: dict[str, bool] = {}
_cooldown: dict[Endpoint, float] = {}
_no_usage: dict[str, bool] = {}  # nhà cung cấp không hỗ trợ stream_options.include_usage


def _split(v: str) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


def api_keys() -> list[str]:
    """Key chính (LLM_API_KEY) + các key dự phòng (LLM_BACKUP_API_KEYS, phẩy ngăn cách)."""
    s = get_settings()
    return list(dict.fromkeys([k for k in [s.llm_api_key, *_split(s.llm_backup_api_keys)] if k])) or ["missing"]


def client(key: str | None = None, base_url: str | None = None) -> AsyncOpenAI:
    s = get_settings()
    k, b = key or api_keys()[0], base_url or s.llm_base_url
    # Kết nối HTTP của client gắn với vòng lặp sự kiện tạo ra nó; môi trường tạo vòng lặp mới cho mỗi
    # request (test, một số runtime serverless) mà dùng lại client cũ sẽ lỗi "Event loop is closed".
    try:
        loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        loop_id = 0
    ck = (b, k, loop_id)
    if ck not in _clients:
        _clients[ck] = _oa().AsyncOpenAI(api_key=k, base_url=b, timeout=s.llm_timeout, max_retries=1)
    return _clients[ck]


def reset_client() -> None:
    _clients.clear()


def _friendly(e: Exception) -> LLMError:
    if isinstance(e, LLMError):
        return e
    msg = str(e)
    # Nhà cung cấp từ chối nội dung (có thể xảy ra giữa lúc stream, không chỉ lúc tạo request)
    if _is_refusal(e):
        log.warning("Nhà cung cấp từ chối nội dung: %s", msg[:200])
        return ProviderRefusal(REFUSAL_TEXT)
    if "401" in msg or "invalid api key" in msg.lower() or "unauthorized" in msg.lower():
        return LLMError("API key của mô hình AI không hợp lệ. Kiểm tra lại LLM_API_KEY.")
    if "404" in msg and "model" in msg.lower():
        return LLMError("Không tìm thấy model AI. Kiểm tra lại LLM_MODEL.")
    if "429" in msg or "rate" in msg.lower() or "quota" in msg.lower():
        return LLMError("Mô hình AI đang quá tải hoặc hết hạn mức. Thử lại sau ít phút.")
    if "timeout" in msg.lower() or "timed out" in msg.lower():
        return LLMError("Mô hình AI phản hồi quá lâu. Thử lại nhé.")
    # Không in nguyên văn lỗi kỹ thuật (thường là tiếng Anh, có thể lộ cấu hình) cho người dùng — chỉ ghi log
    log.warning("Lỗi gọi mô hình AI: %s", msg[:500])
    return LLMError("Mô hình AI đang gặp sự cố tạm thời. Bạn gửi lại câu hỏi sau ít giây nhé.")


# ---------------------------------------------------------------------------
# Chuỗi dự phòng: (nhà cung cấp, key, model). Khi 1 điểm bị 429/lỗi máy chủ/hết credit,
# tạm "nghỉ" điểm đó và thử điểm kế tiếp. Thứ tự primary: model chính trên mọi key → model dự phòng
# trên mọi key; sau đó tới secondary. Rất hữu ích với gói API miễn phí (mỗi key/model có hạn mức riêng).
# ---------------------------------------------------------------------------


def _primary(model: str) -> list[Endpoint]:
    s = get_settings()
    models = list(dict.fromkeys([model, *_split(s.llm_fallback_models)]))
    return [Endpoint(s.llm_base_url, k, m, s.llm_reasoning_effort, "primary") for m in models for k in api_keys()]


def _secondary() -> list[Endpoint]:
    s = get_settings()
    keys = _split(s.secondary_llm_api_keys)
    if not s.secondary_llm_base_url or not keys:
        return []
    return [Endpoint(s.secondary_llm_base_url, k, m, s.secondary_llm_reasoning_effort, "secondary")
            for m in _split(s.secondary_llm_models) for k in keys]


def _chain(model: str, vision: bool = False) -> list[Endpoint]:
    s = get_settings()
    if vision and s.llm_vision_use_secondary and _secondary():
        return _secondary()
    return _primary(model) + _secondary()


def _candidates(model: str, vision: bool = False) -> list[Endpoint]:
    chain = _chain(model, vision)
    now = time.time()
    ready = [c for c in chain if _cooldown.get(c, 0) <= now]
    return ready or [min(chain, key=lambda c: _cooldown.get(c, 0))]


def _rest(ep: Endpoint, e: Exception) -> None:
    per_day = "perday" in str(e).lower().replace("_", "")
    _cooldown[ep] = time.time() + (3600 if per_day else 60)


def _should_fallback(e: Exception) -> bool:
    if isinstance(e, (_oa().RateLimitError, _oa().APIConnectionError, _oa().APITimeoutError)):
        return True
    if isinstance(e, _oa().APIStatusError):
        return e.status_code in (401, 402, 403, 404) or e.status_code >= 500
    return False


async def _create(kwargs: dict, vision: bool = False):
    """Gọi API theo chuỗi dự phòng. Trả về (response, endpoint đã dùng, số endpoint lỗi trước đó).

    Tự bỏ tham số tuỳ chọn mà nhà cung cấp không hỗ trợ (reasoning_effort, stream_options) rồi gọi lại.
    """
    last: Exception | None = None
    fails = 0
    refused: set[str] = set()
    for ep in _candidates(kwargs["model"], vision):
        if ep.base_url in refused:
            continue
        kw = {**kwargs, "model": ep.model}
        kw.pop("reasoning_effort", None)
        kw.pop("stream_options", None)
        if ep.effort and not _no_effort.get(ep.model):
            kw["reasoning_effort"] = ep.effort
        if kw.get("stream") and not _no_usage.get(ep.base_url):
            kw["stream_options"] = {"include_usage": True}  # để đếm token khi stream
        cl = client(ep.key, ep.base_url)
        try:
            resp = None
            for _ in range(3):
                try:
                    resp = await cl.chat.completions.create(**kw)
                    break
                except _oa().BadRequestError as e:
                    m = str(e).lower()
                    if "stream_options" in kw and ("stream_options" in m or "include_usage" in m):
                        _no_usage[ep.base_url] = True
                        kw.pop("stream_options")
                    elif "reasoning_effort" in kw:
                        _no_effort[ep.model] = True
                        kw.pop("reasoning_effort")
                    else:
                        raise
            if resp is None:
                raise RuntimeError("Không gọi được model")
            if fails:
                log.info("Đã chuyển sang %s / %s", ep.tag, ep.model)
            return resp, ep, fails
        except _oa().BadRequestError as e:
            # Bộ lọc của nhà cung cấp chính từ chối → thử nhà cung cấp KHÁC (bỏ qua key/model cùng nơi)
            if _is_refusal(e):
                log.warning("%s / %s từ chối nội dung → thử nhà cung cấp khác", ep.tag, ep.model)
                last = ProviderRefusal(REFUSAL_TEXT)
                refused.add(ep.base_url)
                fails += 1
                continue
            raise
        except Exception as e:
            if not _should_fallback(e):
                raise
            log.warning("%s / %s lỗi (%s) → thử phương án dự phòng", ep.tag, ep.model, type(e).__name__)
            _rest(ep, e)
            last = e
            fails += 1
    if refused:
        raise ProviderRefusal(REFUSAL_TEXT)
    raise last  # type: ignore[misc]


def _looks_like_tools_unsupported(e: Exception) -> bool:
    m = str(e).lower()
    return any(k in m for k in ("tool", "function")) and any(k in m for k in ("support", "invalid", "unknown", "not allowed"))


async def complete(
    messages: list[dict],
    *,
    model: str | None = None,
    json_mode: bool = False,
    temperature: float | None = None,
    max_tokens: int | None = None,
    vision: bool = False,
    purpose: str | None = None,
) -> str:
    """Gọi 1 lần, trả về toàn bộ text (dùng cho router, phân tích ảnh, JSON...)."""
    s = get_settings()
    kwargs: dict = {
        "model": model or s.llm_model,
        "messages": messages,
        "temperature": s.llm_temperature if temperature is None else temperature,
    }
    if max_tokens:
        # model có "suy nghĩ" (Gemini 3, Mercury) tính cả token suy nghĩ vào max_tokens → để dư
        kwargs["max_tokens"] = max(max_tokens, 2048)
    if json_mode and s.llm_json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    tr = tracing.current()
    t0 = tr.ms() if tr else 0
    ep = None
    fails = 0
    err: str | None = None
    r = None
    try:
        try:
            r, ep, fails = await _create(kwargs, vision)
        except _oa().BadRequestError as e:
            if json_mode and "response_format" in str(e).lower():
                kwargs.pop("response_format", None)
                try:
                    r, ep, fails = await _create(kwargs, vision)
                except Exception as e2:  # pragma: no cover
                    raise _friendly(e2) from e2
            else:
                raise _friendly(e) from e
        except LLMError:
            raise
        except Exception as e:
            raise _friendly(e) from e
    except LLMError as e:
        err = str(e)[:200]
        raise
    finally:
        if tr:
            tin, tout = tr.add_usage(getattr(r, "usage", None))
            tr.add("llm", purpose or ("json" if json_mode else "complete"), t0, tr.ms() - t0,
                   provider=ep.tag if ep else None, model=ep.model if ep else kwargs["model"],
                   tokens_in=tin or None, tokens_out=tout or None, fallbacks=fails or None, vision=vision or None, error=err)
    return (r.choices[0].message.content or "").strip()


async def complete_json(messages: list[dict], **kw) -> dict:
    text = await complete(messages, json_mode=True, **kw)
    return parse_json(text)


def _as_object(data: object) -> dict:
    """Mọi nơi gọi đều đọc kết quả như một object. Model đôi khi trả về MẢNG (vd chỉ liệt kê các món ăn
    thay vì {"name":..., "items": [...]}) → trước đây gây lỗi 500 'list' object has no attribute 'get'."""
    if isinstance(data, dict):
        return data
    if isinstance(data, list):
        dicts = [x for x in data if isinstance(x, dict)]
        if len(dicts) == 1 and len(data) == 1:
            return dicts[0]
        return {"items": dicts}
    raise LLMError("Mô hình AI trả về dữ liệu không đúng định dạng. Bạn thử lại nhé.")


def parse_json(text: str) -> dict:
    """Bóc JSON kể cả khi model bọc trong ```json ... ``` hoặc thêm chữ thừa. Luôn trả về dict."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.MULTILINE).strip()
    try:
        return _as_object(json.loads(t))
    except json.JSONDecodeError:
        for pat in (r"\{.*\}", r"\[.*\]"):
            m = re.search(pat, t, flags=re.DOTALL)
            if m:
                try:
                    return _as_object(json.loads(m.group(0)))
                except json.JSONDecodeError:
                    pass
    raise LLMError("Mô hình AI trả về dữ liệu không đúng định dạng JSON.")


async def stream(
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    model: str | None = None,
    temperature: float | None = None,
    vision: bool = False,
) -> AsyncIterator[tuple[str, object]]:
    """Stream câu trả lời. Yield ("text", delta) liên tục, cuối cùng yield ("done", StreamResult).

    Nếu model gọi tool, các mảnh tool_call được ghép lại và trả về trong StreamResult.
    """
    s = get_settings()
    kwargs: dict = {
        "model": model or s.llm_model,
        "messages": messages,
        "temperature": s.llm_temperature if temperature is None else temperature,
        "stream": True,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    result = StreamResult()
    partial: dict[int, dict] = {}
    tr = tracing.current()
    t0 = tr.ms() if tr else 0
    ttft: int | None = None
    usage = None
    ep = None
    fails = 0
    err: str | None = None
    try:
        resp, ep, fails = await _create(kwargs, vision)
        async for chunk in resp:
            result.model = getattr(chunk, "model", "") or result.model
            if getattr(chunk, "usage", None):
                usage = chunk.usage
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta is None:
                continue
            if delta.content:
                if ttft is None and tr:
                    ttft = tr.ms() - t0
                result.text += delta.content
                yield ("text", delta.content)
            for tc in delta.tool_calls or []:
                if tc.index is not None:
                    idx = tc.index
                elif tc.id or not partial:  # một số nhà cung cấp (Gemini) không gửi index
                    idx = len(partial)
                else:
                    idx = max(partial)
                p = partial.setdefault(idx, {"id": "", "name": "", "args": "", "extra": None})
                extra = (tc.model_extra or {}).get("extra_content")
                if extra:
                    p["extra"] = extra
                if tc.id:
                    p["id"] = tc.id
                if tc.function and tc.function.name:
                    p["name"] += tc.function.name
                if tc.function and tc.function.arguments:
                    p["args"] += tc.function.arguments
    except _oa().BadRequestError as e:
        err = str(e)[:200]
        if tools and _looks_like_tools_unsupported(e):
            raise ToolsNotSupported(str(e)) from e
        raise _friendly(e) from e
    except _oa().APIError as e:
        err = str(e)[:200]
        raise _friendly(e) from e
    except LLMError as e:
        err = str(e)[:200]
        raise
    except Exception as e:
        err = str(e)[:200]
        raise _friendly(e) from e
    finally:
        if tr:
            tin, tout = tr.add_usage(usage)
            tr.add("llm", "stream", t0, tr.ms() - t0, provider=ep.tag if ep else None, model=ep.model if ep else kwargs["model"],
                   ttft_ms=ttft, tokens_in=tin or None, tokens_out=tout or None, fallbacks=fails or None,
                   tool_calls=[p["name"] for p in partial.values() if p["name"]] or None, vision=vision or None, error=err)

    for i, p in sorted(partial.items()):
        if not p["name"]:
            continue
        try:
            args = json.loads(p["args"]) if p["args"].strip() else {}
        except json.JSONDecodeError:
            args = {}
        result.tool_calls.append(ToolCall(id=p["id"] or f"call_{i}", name=p["name"], arguments=args, raw_arguments=p["args"] or "{}", extra=p["extra"]))
    yield ("done", result)
