"""Observability API — "Nhật ký AI": xem lại từng lượt chat đã chạy thế nào và thống kê tổng hợp.

- GET /api/traces              danh sách lượt gần đây (của bạn; admin xem toàn hệ thống với scope=all)
- GET /api/traces/stats        thống kê N ngày: độ trễ p50/p95, lỗi, fallback, token, công cụ, cờ an toàn
- GET /api/traces/{id}         chi tiết 1 lượt: các span (guard → router → agent → LLM/tool → tổng kết)
"""
from __future__ import annotations

import datetime as dt
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import AgentTrace, User, _now
from ..security import get_current_user

router = APIRouter(prefix="/api/traces", tags=["observability"])


def _is_admin(user: User) -> bool:
    return user.email.lower() in get_settings().admin_list


def _scope(q, user: User, scope: str):
    if scope == "all":
        if not _is_admin(user):
            raise HTTPException(403, "Chỉ quản trị viên (ADMIN_EMAILS) mới xem được toàn hệ thống")
        return q
    return q.where(AgentTrace.user_id == user.id)


def _brief(t: AgentTrace) -> dict:
    return {
        "id": t.id, "created_at": t.created_at.isoformat() + "Z", "question": t.question[:160], "agents": t.agents,
        "route_method": t.route_method, "status": t.status, "guard": t.guard, "total_ms": t.total_ms, "ttft_ms": t.ttft_ms,
        "llm_calls": t.llm_calls, "tool_calls": t.tool_calls, "tool_errors": t.tool_errors, "tokens_in": t.tokens_in,
        "tokens_out": t.tokens_out, "providers": t.providers, "output_flags": [f.get("kind") for f in t.output_flags or []],
        "conversation_id": t.conversation_id, "rag": len(t.rag or []),
        "sample": bool(t.spans and t.spans[0].get("sample")),  # trace của hội thoại mẫu (seed_demo)
    }


def _pct(vals: list[int], p: float) -> int | None:
    if not vals:
        return None
    v = sorted(vals)
    return v[min(len(v) - 1, int(round(p * (len(v) - 1))))]


@router.get("")
def list_traces(limit: int = Query(50, ge=1, le=200), status: str | None = None, scope: str = "me",
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = _scope(select(AgentTrace), user, scope)
    if status:
        q = q.where(AgentTrace.status == status)
    rows = db.scalars(q.order_by(AgentTrace.created_at.desc()).limit(limit))
    return {"items": [_brief(t) for t in rows], "is_admin": _is_admin(user)}


@router.get("/stats")
def stats(days: int = Query(7, ge=1, le=90), scope: str = "me", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = _now() - dt.timedelta(days=days)
    rows = list(db.scalars(_scope(select(AgentTrace), user, scope).where(AgentTrace.created_at >= since)))
    ok = [t for t in rows if t.status != "blocked"]
    tool_ms: dict[str, list[int]] = defaultdict(list)
    tool_err: Counter = Counter()
    llm_ms: list[int] = []
    providers: Counter = Counter()
    fallbacks = 0
    for t in rows:
        for sp in t.spans or []:
            if sp.get("kind") == "tool":
                tool_ms[sp["name"]].append(sp.get("ms", 0))
                if sp.get("error"):
                    tool_err[sp["name"]] += 1
            elif sp.get("kind") == "llm":
                llm_ms.append(sp.get("ms", 0))
                if sp.get("model"):
                    providers[f"{sp.get('provider') or '?'}:{sp['model']}"] += 1
                fallbacks += int(sp.get("fallbacks") or 0)
    agents: Counter = Counter(a for t in rows for a in (t.agents or []))
    flags: Counter = Counter(f.get("kind") for t in rows for f in (t.output_flags or []))
    guards: Counter = Counter(t.guard for t in rows if t.guard)
    rag_methods: Counter = Counter(r.get("method") for t in rows for r in (t.rag or []))
    total = [t.total_ms for t in ok]
    ttft = [t.ttft_ms for t in ok if t.ttft_ms]
    return {
        "days": days, "count": len(rows), "blocked": sum(1 for t in rows if t.status == "blocked"),
        "errors": sum(1 for t in rows if t.status == "error"),
        "error_rate": round(sum(1 for t in rows if t.status == "error") / len(rows), 3) if rows else 0,
        "latency": {"p50": _pct(total, 0.5), "p95": _pct(total, 0.95), "avg": round(sum(total) / len(total)) if total else None},
        "ttft": {"p50": _pct(ttft, 0.5), "p95": _pct(ttft, 0.95)},
        "llm": {"calls": len(llm_ms), "p50_ms": _pct(llm_ms, 0.5), "fallbacks": fallbacks, "by_model": dict(providers.most_common())},
        "tokens": {"in": sum(t.tokens_in for t in rows), "out": sum(t.tokens_out for t in rows)},
        "tools": sorted([{"name": n, "calls": len(v), "p50_ms": _pct(v, 0.5), "errors": tool_err[n]} for n, v in tool_ms.items()],
                        key=lambda x: -x["calls"]),
        "agents": dict(agents.most_common()), "route_methods": dict(Counter(t.route_method for t in rows if t.route_method)),
        "guard": dict(guards.most_common()), "output_flags": dict(flags.most_common()), "rag": dict(rag_methods),
    }


@router.get("/{tid}")
def get_trace(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(AgentTrace, tid)
    if not t or (t.user_id != user.id and not _is_admin(user)):
        raise HTTPException(404, "Không tìm thấy trace")
    return {**_brief(t), "question": t.question, "error": t.error, "spans": t.spans, "output_flags": t.output_flags, "rag": t.rag,
            "message_id": t.message_id}
