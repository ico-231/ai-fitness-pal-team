"""Observability — ghi "trace" cho từng lượt chat.

Mỗi tin nhắn tạo 1 Trace gồm nhiều "span" (đoạn công việc có thời gian bắt đầu + độ dài):

    guard ─ router ─ agent:coachbro ┬ llm (Mercury, 1.2s, 850 token)
                                    ├ tool search_exercises (12ms)
                                    └ llm (Mercury, 0.9s)
                   ─ synthesis ─ followups

Trace được lưu vào bảng agent_traces (xem trang "Nhật ký AI") và in 1 dòng log JSON
→ trên Vercel/Render có thể tìm lại bằng log search.

Dùng contextvars nên lớp llm.py tự ghi span mà không cần truyền tham số qua mọi hàm.
"""
from __future__ import annotations

import contextvars
import json
import logging
import time
import uuid
from contextlib import contextmanager
from typing import Any

log = logging.getLogger("fitbro.trace")

_current: contextvars.ContextVar[Trace | None] = contextvars.ContextVar("fitbro_trace", default=None)


class Trace:
    def __init__(self, user_id: str, conversation_id: str | None, question: str):
        self.id = uuid.uuid4().hex
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.question = question
        self.t0 = time.perf_counter()
        self.spans: list[dict] = []
        self.stage = "main"  # agent / bước đang chạy — gắn vào mỗi span
        self.route: dict = {}
        self.guard: str | None = None
        self.status = "ok"
        self.error: str | None = None
        self.ttft_ms: int | None = None  # thời gian tới chữ đầu tiên người dùng thấy
        self.tokens_in = 0
        self.tokens_out = 0
        self.output_flags: list[dict] = []
        self.rag: list[dict] = []
        self.message_id: str | None = None

    # ---- tiện ích ----
    def ms(self) -> int:
        return int((time.perf_counter() - self.t0) * 1000)

    def add(self, kind: str, name: str, start_ms: int, dur_ms: int, **attrs: Any) -> dict:
        sp = {"kind": kind, "name": name, "stage": self.stage, "start_ms": start_ms, "ms": dur_ms,
              **{k: v for k, v in attrs.items() if v is not None}}
        self.spans.append(sp)
        return sp

    @contextmanager
    def span(self, kind: str, name: str, **attrs: Any):
        start = self.ms()
        sp = {"kind": kind, "name": name, "stage": self.stage, "start_ms": start, "ms": 0, **attrs}
        self.spans.append(sp)
        try:
            yield sp
        except Exception as e:
            sp["error"] = f"{type(e).__name__}: {str(e)[:200]}"
            raise
        finally:
            sp["ms"] = self.ms() - start

    def first_token(self) -> None:
        if self.ttft_ms is None:
            self.ttft_ms = self.ms()

    def add_usage(self, usage: Any) -> tuple[int, int]:
        if not usage:
            return 0, 0
        pin = int(getattr(usage, "prompt_tokens", 0) or 0)
        pout = int(getattr(usage, "completion_tokens", 0) or 0)
        self.tokens_in += pin
        self.tokens_out += pout
        return pin, pout

    # ---- tổng hợp ----
    def summary(self) -> dict:
        llm_spans = [s for s in self.spans if s["kind"] == "llm"]
        tool_spans = [s for s in self.spans if s["kind"] == "tool"]
        providers = sorted({f"{s.get('provider')}:{s.get('model')}" for s in llm_spans if s.get("model")})
        return {
            "id": self.id, "total_ms": self.ms(), "ttft_ms": self.ttft_ms, "status": self.status, "guard": self.guard,
            "agents": self.route.get("agents", []), "route_method": self.route.get("method"),
            "llm_calls": len(llm_spans), "llm_fallbacks": sum(int(s.get("fallbacks", 0)) for s in llm_spans),
            "tool_calls": len(tool_spans), "tool_errors": sum(1 for s in tool_spans if s.get("error")),
            "tokens_in": self.tokens_in, "tokens_out": self.tokens_out, "providers": providers,
            "output_flags": [f["kind"] for f in self.output_flags],
        }

    def log_line(self) -> None:
        log.info("trace %s", json.dumps(self.summary(), ensure_ascii=False))


def current() -> Trace | None:
    return _current.get()


def start(user_id: str, conversation_id: str | None, question: str) -> tuple[Trace, contextvars.Token]:
    t = Trace(user_id, conversation_id, question)
    return t, _current.set(t)


def stop(token: contextvars.Token) -> None:
    _current.reset(token)


@contextmanager
def span(kind: str, name: str, **attrs: Any):
    """Span an toàn: không có trace đang chạy (vd gọi từ test, MCP) thì không làm gì."""
    t = current()
    if t is None:
        yield {}
        return
    with t.span(kind, name, **attrs) as sp:
        yield sp


@contextmanager
def stage(name: str):
    t = current()
    if t is None:
        yield
        return
    prev, t.stage = t.stage, name
    try:
        yield
    finally:
        t.stage = prev
