"""Orchestrator — trái tim hệ thống đa tác tử (multi-agent).

Luồng xử lý một tin nhắn:

    Người dùng ──► [1] Safety Guard ──(chặn)──► trả lời an toàn, dừng
                         │ (an toàn / thận trọng)
                         ▼
                   [2] Router (Supervisor) ── chọn 1-2 agent
                         ▼
                   [3] Agent chuyên môn (HeadBro / CoachBro / NutriBro)
                       vòng lặp ReAct: suy nghĩ → gọi tool → đọc kết quả → ... → trả lời
                         ▼  (nếu 2 agent: agent thứ 2 đọc câu trả lời của agent thứ 1)
                   [4] HeadBro tổng kết (chỉ khi có ≥ 2 agent)
                         ▼
                   Lưu DB + stream từng sự kiện về giao diện (SSE)

Mọi bước đều được phát thành "sự kiện" để giao diện hiển thị trực quan agent nào đang làm gì.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AgentTrace, Conversation, Memory, Message, User, _now
from ..services import stats
from . import guard, llm, router, tracing
from .prompts import AGENTS, EXTREME_NOTE, GROUNDING_RULES, INJECTION_NOTE, PERSONAS, SAFETY_CAUTION, STYLE_RULES, SYNTH_PROMPT
from .tools import ToolContext, preload_context, run_tool, summarize_result, tools_for

log = logging.getLogger("fitbro.orchestrator")

Emit = Callable[[dict], Awaitable[None]]
MAX_TOOL_ROUNDS = 6
HISTORY_LIMIT = 12


# ---------------------------------------------------------------------------
# Làm sạch văn bản (giảm ký tự markdown thừa — feedback "nhiều dấu *")
# ---------------------------------------------------------------------------


def sanitize(text: str) -> str:
    t = (text or "").replace("\r\n", "\n").strip()
    t = re.sub(r"^\s*\[?(HeadBro|CoachBro|NutriBro)\]?\s*[:：]\s*", "", t, flags=re.IGNORECASE)
    lines = []
    for line in t.split("\n"):
        s = line.rstrip()
        if re.fullmatch(r"\s*([-*_])\1{2,}\s*", s):  # đường kẻ ngang
            continue
        s = re.sub(r"^\s{0,3}#{1,6}\s+", "", s)  # tiêu đề → dòng thường
        s = re.sub(r"^(\s*)[*•]\s+", r"\1- ", s)  # gạch đầu dòng * → -
        lines.append(s)
    t = "\n".join(lines)
    t = t.replace("***", "**")
    t = re.sub(r"(?<!\*)\*(?!\*)", "", t)  # bỏ dấu * đơn lẻ (in nghiêng)
    # giữ tối đa 3 cặp in đậm
    count = 0

    def _bold(m: re.Match) -> str:
        nonlocal count
        count += 1
        return m.group(0) if count <= 3 else m.group(1)

    t = re.sub(r"\*\*(.+?)\*\*", _bold, t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


# ---------------------------------------------------------------------------
# Ngữ cảnh
# ---------------------------------------------------------------------------


def tidy_cards(cards: list[dict]) -> list[dict]:
    """Gộp thẻ trùng: nhiều lần tra món/tìm bài → 1 thẻ; đã có thực đơn/buổi tập thì bỏ thẻ lẻ."""
    kinds = {c.get("kind") for c in cards}
    out: list[dict] = []
    merged: dict[str, dict] = {}
    for c in cards:
        k = c.get("kind")
        if (k == "foods" and "mealplan" in kinds) or (k == "exercises" and "plan" in kinds):
            continue
        if k in ("foods", "exercises", "sources"):
            if k not in merged:
                merged[k] = {**c, "items": []}
                out.append(merged[k])
            seen = {i.get("id") for i in merged[k]["items"]}
            merged[k]["items"] += [i for i in c.get("items", []) if i.get("id") not in seen]
            if k != "sources":
                merged[k]["items"] = merged[k]["items"][:8]
            continue
        out.append(c)
    return out


def load_history(db: Session, conv: Conversation, limit: int = HISTORY_LIMIT) -> list[dict]:
    rows = list(
        db.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.desc()).limit(limit))
    )
    rows.reverse()
    return [{"role": m.role, "agent": m.agent, "content": m.content} for m in rows if m.content]


def _history_messages(history: list[dict]) -> list[dict]:
    out = []
    for h in history:
        if h["role"] == "user":
            out.append({"role": "user", "content": h["content"]})
        else:
            name = AGENTS.get(h.get("agent") or "", {}).get("name", "Hệ thống")
            out.append({"role": "assistant", "content": f"[{name}] {h['content']}"})
    return out


def build_system(agent: str, ctx: ToolContext, *, page: str | None, page_context: str | None, notes: list[str],
                 teammates: list[dict], offtopic: bool, preload: dict | None, upcoming: list[str] | None = None) -> str:
    a = AGENTS[agent]
    now = stats.now_local()
    parts = [
        PERSONAS[agent],
        STYLE_RULES.format(name=a["name"]),
        GROUNDING_RULES,
        f"THỜI GIAN HIỆN TẠI: {now.strftime('%H:%M, %A %d/%m/%Y')} (giờ Việt Nam).",
        "HỒ SƠ NGƯỜI DÙNG (dữ liệu thật):\n" + json.dumps(stats.user_snapshot(ctx.db, ctx.user), ensure_ascii=False),
    ]
    mems = list(ctx.db.scalars(select(Memory).where(Memory.user_id == ctx.user.id).order_by(Memory.created_at.desc()).limit(25)))
    if mems:
        parts.append("TRÍ NHỚ DÀI HẠN VỀ NGƯỜI DÙNG (dữ liệu đã ghi nhớ từ các cuộc trò chuyện trước — hãy tôn trọng, không hỏi lại):\n"
                     + "\n".join(f"- {m.content}" for m in reversed(mems) if not guard.looks_like_injection(m.content)))
    # Tình hình hôm nay nạp sẵn → agent không phải tốn vài vòng gọi tool chỉ để lấy số cơ bản
    t = stats.today_summary(ctx.db, ctx.user)
    rd = t["readiness"]
    parts.append("TÌNH HÌNH HÔM NAY (số liệu thật, dùng trực tiếp, không cần gọi tool để lấy lại):\n" + json.dumps({
        "readiness": {"score": rd["score"], "label": rd["label"], "weakest": rd["weakest"]} if rd else "chưa check-in",
        "da_an": t["nutrition"], "muc_tieu_ngay": t["targets"], "nuoc_ml": t["water_ml"],
        "buoi_tap_hom_nay": t["workouts"], "streak": t["streak"]["current"],
    }, ensure_ascii=False))
    if page:
        parts.append(f"Người dùng đang ở trang: {page}.")
    if page_context:
        parts.append("NGỮ CẢNH TỪ GIAO DIỆN (dữ liệu, người dùng bấm 'Hỏi AI' từ đây):\n" + page_context[:3000])
    if preload:
        parts.append("DỮ LIỆU ĐÃ NẠP SẴN (API không hỗ trợ tool):\n" + json.dumps(preload, ensure_ascii=False, default=str)[:6000])
    if "medical_caution" in notes:
        parts.append(SAFETY_CAUTION)
    if "extreme_diet" in notes:
        parts.append(EXTREME_NOTE)
    if "injection" in notes:
        parts.append(INJECTION_NOTE)
    if offtopic:
        parts.append("Tin nhắn nằm ngoài chủ đề sức khỏe/thể hình. Từ chối lịch sự trong 1-2 câu và gợi ý những gì bạn có thể giúp.")
    if upcoming:
        names = ", ".join(f"{AGENTS[u]['name']} ({AGENTS[u]['domain']})" for u in upcoming)
        parts.append(f"LÀM VIỆC NHÓM: ngay sau bạn, {names} sẽ trả lời phần chuyên môn của họ. "
                     f"Chỉ trả lời phần thuộc chuyên môn của {a['name']}, KHÔNG nói về lĩnh vực của đồng đội.")
    if teammates:
        team = "\n\n".join(f"{AGENTS[t['agent']]['name']} đã trả lời:\n{t['content']}" for t in teammates)
        parts.append(
            "BẠN ĐANG LÀM VIỆC NHÓM. Đồng đội đã trả lời phần chuyên môn của họ ở trên giao diện:\n" + team +
            f"\n\nChỉ bổ sung phần thuộc chuyên môn của {a['name']}, không lặp lại nội dung của đồng đội."
        )
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Chạy 1 agent (vòng lặp ReAct với tool calling)
# ---------------------------------------------------------------------------

_NETWORK_TOOLS = {"search_knowledge"}  # tool gọi mạng → chạy ở thread riêng để không chặn stream


def _first_token() -> None:
    tr = tracing.current()
    if tr:
        tr.first_token()


async def _timed_tool(ctx: ToolContext, name: str, args: dict) -> tuple[dict, int]:
    t0 = time.perf_counter()
    tr = tracing.current()
    start = tr.ms() if tr else 0
    if name in _NETWORK_TOOLS:
        out = await asyncio.to_thread(run_tool, ctx, name, args)
    else:
        out = run_tool(ctx, name, args)
    ms = int((time.perf_counter() - t0) * 1000)
    if tr:
        tr.add("tool", name, start, ms, args=json.dumps(args, ensure_ascii=False, default=str)[:300],
               error=out.get("error") if isinstance(out, dict) else None)
    return out, ms


def output_guard(content: str, ctx: ToolContext) -> list[dict]:
    """Guardrail đầu ra: soát câu trả lời trước khi lưu/hiển thị bản cuối."""
    if not get_settings().guard_output or not content:
        return []
    flags = guard.check_output(content, ctx.profile.gender, ctx.profile.weight_kg)
    tr = tracing.current()
    if flags and tr:
        tr.output_flags += [{**f, "agent": ctx.agent} for f in flags]
        tr.add("guard", "output", tr.ms(), 0, flags=[f["kind"] for f in flags])
    return flags


async def run_agent(
    agent: str, ctx: ToolContext, *, history: list[dict], text: str, image: str | None, page: str | None,
    page_context: str | None, notes: list[str], teammates: list[dict], offtopic: bool, emit: Emit,
    upcoming: list[str] | None = None,
) -> dict:
    s = get_settings()
    use_tools = s.llm_supports_tools
    preload = None if use_tools else preload_context(ctx)
    model = s.vision_model if image else s.llm_model

    user_content: object = text or "Hãy phân tích ảnh này."
    if image:
        user_content = [{"type": "text", "text": text or "Hãy phân tích ảnh này theo chuyên môn của bạn."},
                        {"type": "image_url", "image_url": {"url": image}}]

    def base_messages() -> list[dict]:
        sys = build_system(agent, ctx, page=page, page_context=page_context, notes=notes,
                           teammates=teammates, offtopic=offtopic, preload=preload, upcoming=upcoming)
        return [{"role": "system", "content": sys}, *_history_messages(history), {"role": "user", "content": user_content}]

    messages = base_messages()
    trace: list[dict] = []
    texts: list[str] = []
    sent_cards = 0
    error = None

    await emit({"type": "agent_start", "agent": agent})
    rounds = 0
    while rounds < MAX_TOOL_ROUNDS:
        rounds += 1
        tool_specs = [t.spec() for t in tools_for(agent)] if use_tools and rounds < MAX_TOOL_ROUNDS else None
        result = None
        try:
            async for kind, payload in llm.stream(messages, tools=tool_specs, model=model, vision=bool(image)):
                if kind == "text":
                    _first_token()
                    await emit({"type": "token", "agent": agent, "delta": payload})
                else:
                    result = payload
        except llm.ToolsNotSupported:
            log.warning("Provider không hỗ trợ tools → chuyển sang chế độ nạp sẵn dữ liệu")
            use_tools = False
            preload = preload_context(ctx)
            messages = base_messages()
            rounds -= 1
            continue
        except llm.ProviderRefusal:
            texts.append(llm.REFUSAL_TEXT)
            break
        except llm.LLMError as e:
            error = str(e)
            break

        if result is None:
            break
        if result.text.strip():
            texts.append(result.text.strip())
        if not result.tool_calls:
            break

        messages.append({
            "role": "assistant", "content": result.text or None,
            "tool_calls": [
                {"id": tc.id, "type": "function", "function": {"name": tc.name, "arguments": tc.raw_arguments},
                 **({"extra_content": tc.extra} if tc.extra else {})}
                for tc in result.tool_calls
            ],
        })
        for tc in result.tool_calls:
            await emit({"type": "tool_call", "agent": agent, "name": tc.name, "args": tc.arguments})
            out, ms = await _timed_tool(ctx, tc.name, tc.arguments)
            summary = summarize_result(tc.name, out)
            trace.append({"tool": tc.name, "args": tc.arguments, "summary": summary, "ms": ms})
            await emit({"type": "tool_result", "agent": agent, "name": tc.name, "summary": summary})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(out, ensure_ascii=False, default=str)[:8000]})
            while sent_cards < len(ctx.cards):
                await emit({"type": "card", "agent": agent, "card": ctx.cards[sent_cards]})
                sent_cards += 1

    # model chỉ gọi tool mà không viết câu trả lời → ép trả lời 1 lần không kèm tool
    if not error and not texts and trace:
        try:
            async for kind, payload in llm.stream(messages, tools=None, model=model, vision=bool(image)):
                if kind == "text":
                    _first_token()
                    await emit({"type": "token", "agent": agent, "delta": payload})
                elif payload.text.strip():
                    texts.append(payload.text.strip())
        except llm.LLMError as e:
            error = str(e)

    # Model hay viết vài câu TRƯỚC khi gọi tool rồi viết lại đầy đủ SAU khi có kết quả → chỉ giữ bản cuối
    # (trừ khi bản cuối quá ngắn, khi đó ghép lại để không mất ý).
    if len(texts) > 1 and len(texts[-1]) >= 150:
        texts = texts[-1:]
    content = sanitize("\n\n".join(texts))
    ctx.cards[:] = tidy_cards(ctx.cards)
    flags = output_guard(content, ctx)
    if flags:
        content = guard.apply_output_guard(content, flags)
    if error and not content:
        content = f"Xin lỗi, mình chưa trả lời được lúc này. {error}"
    if not content:
        content = "Mình đã chuẩn bị thông tin bên dưới cho bạn." if ctx.cards else "Mình chưa có câu trả lời phù hợp, bạn thử hỏi cụ thể hơn nhé."
    return {"agent": agent, "content": content, "cards": ctx.cards, "trace": trace, "error": error, "flags": flags}


FOLLOWUP_PROMPT = """Dựa vào câu hỏi và câu trả lời bên dưới, gợi ý 3 câu người dùng có thể hỏi TIẾP THEO.
Mỗi câu tiếng Việt, ngôi thứ nhất ("mình"), tối đa 10 từ, cụ thể, hành động được (vd "Tạo buổi tập này cho mình").
Trả về JSON: {"questions": ["...", "...", "..."]}"""


async def suggest_followups(question: str, answers: list[dict]) -> list[str]:
    s = get_settings()
    if not s.llm_followups:
        return []
    body = "\n\n".join(f"{AGENTS[a['agent']]['name']}: {a['content'][:800]}" for a in answers)
    try:
        data = await llm.complete_json(
            [{"role": "system", "content": FOLLOWUP_PROMPT}, {"role": "user", "content": f"Người dùng hỏi: {question}\n\n{body}"}],
            model=s.router_model, temperature=0.5, max_tokens=200, purpose="followups",
        )
    except llm.LLMError:
        return []
    qs = [str(q).strip()[:80] for q in data.get("questions", []) if str(q).strip()]
    return qs[:3]


# ---------------------------------------------------------------------------
# Xử lý trọn vẹn một lượt chat
# ---------------------------------------------------------------------------


async def handle_message(
    db: Session, user: User, conv: Conversation, *, text: str, image: str | None = None, image_thumb: str | None = None,
    page: str | None = None, page_context: str | None = None, forced_agent: str | None = None, emit: Emit,
) -> None:
    """Bọc _handle bằng 1 Trace: mọi span (guard, router, LLM, tool) được ghi lại rồi lưu vào agent_traces."""
    tr, token = tracing.start(user.id, conv.id, text or ("[ảnh]" if image else ""))
    state: dict = {}
    try:
        await _handle(db, user, conv, text=text, image=image, image_thumb=image_thumb, page=page, page_context=page_context,
                      forced_agent=forced_agent, emit=emit, state=state)
    except Exception as e:
        tr.status, tr.error = "error", f"{type(e).__name__}: {str(e)[:300]}"
        raise
    finally:
        tracing.stop(token)
        try:
            _save_trace(db, tr, state)
            tr.log_line()
            await emit({"type": "trace", **tr.summary()})
        except Exception:  # observability không bao giờ được làm hỏng câu trả lời
            log.exception("save trace failed")
            db.rollback()
        if state.get("done_pending"):
            await emit({"type": "done"})


def _save_trace(db: Session, tr: tracing.Trace, state: dict) -> None:
    sm = tr.summary()
    last = state.get("last_msg")
    db.add(AgentTrace(
        id=tr.id, user_id=tr.user_id, conversation_id=tr.conversation_id, message_id=last.id if last else None,
        question=tr.question[:2000], agents=sm["agents"], route_method=sm["route_method"], status=tr.status, guard=tr.guard,
        error=tr.error, total_ms=sm["total_ms"], ttft_ms=tr.ttft_ms, llm_calls=sm["llm_calls"], tool_calls=sm["tool_calls"],
        tool_errors=sm["tool_errors"], tokens_in=tr.tokens_in, tokens_out=tr.tokens_out, providers=sm["providers"],
        spans=tr.spans[:200], output_flags=tr.output_flags, rag=tr.rag,
    ))
    if last is not None:  # gắn trace_id vào tin nhắn để giao diện mở được "chi tiết"
        last.meta = {**(last.meta or {}), "trace_id": tr.id}
    # dọn trace cũ (giữ N ngày)
    keep = get_settings().trace_retention_days
    if keep > 0:
        import datetime as _dt

        from sqlalchemy import delete

        db.execute(delete(AgentTrace).where(AgentTrace.user_id == tr.user_id,
                                            AgentTrace.created_at < _now() - _dt.timedelta(days=keep)))
    db.commit()


async def _handle(
    db: Session, user: User, conv: Conversation, *, text: str, image: str | None, image_thumb: str | None,
    page: str | None, page_context: str | None, forced_agent: str | None, emit: Emit, state: dict,
) -> None:
    s = get_settings()
    tr = tracing.current()
    prof = stats.get_profile(db, user)
    history = load_history(db, conv)
    last_agent = next((h["agent"] for h in reversed(history) if h["role"] == "assistant" and h.get("agent") in router.VALID), None)

    um = Message(conversation_id=conv.id, role="user", content=text, meta={"image": image_thumb, "page": page} if image_thumb or page else {})
    db.add(um)
    if conv.title == "Cuộc trò chuyện mới" and text:
        conv.title = (text[:60] + "…") if len(text) > 60 else text
    conv.updated_at = um.created_at = _now()
    db.commit()
    await emit({"type": "conversation", "id": conv.id, "title": conv.title, "user_message_id": um.id})

    def save(agent: str, content: str, meta: dict) -> Message:
        m = Message(conversation_id=conv.id, role="assistant", agent=agent, content=content, meta=meta)
        db.add(m)
        db.commit()
        return m

    # [1] Safety Guard (regex → LLM phân loại nếu câu lưng chừng)
    with tracing.stage("guard"), tracing.span("guard", "input") as gsp:
        g = await guard.check_async(text)
        gsp.update(level=g["level"], guard_kind=g.get("kind"), method=g.get("method"), notes=g.get("notes") or None)
    if tr:
        tr.guard = g.get("kind")
    if g["level"] == "block":
        if tr:
            tr.status = "blocked"
            tr.route = {"agents": ["guard"], "method": "guard"}
        await emit({"type": "route", "agents": ["guard"], "reason": f"Safety Guard: phát hiện chủ đề nhạy cảm ({g['kind']})", "method": "guard"})
        await emit({"type": "agent_start", "agent": "guard"})
        m = save("guard", g["message"], {"guard": g["kind"], "guard_method": g.get("method")})
        state["last_msg"] = m
        await emit({"type": "agent_message", "id": m.id, "agent": "guard", "content": g["message"], "cards": [], "trace": []})
        state["done_pending"] = True
        return

    if not s.ai_enabled:
        msg = ("Mô hình AI chưa được cấu hình nên các agent chưa thể trả lời. Quản trị viên cần đặt LLM_BASE_URL, "
               "LLM_API_KEY và LLM_MODEL trong file .env rồi khởi động lại server. Các tính năng khác (ghi bữa ăn, tập luyện, "
               "check-in, dashboard) vẫn dùng bình thường.")
        await emit({"type": "route", "agents": ["headbro"], "reason": "AI chưa cấu hình", "method": "none"})
        await emit({"type": "agent_start", "agent": "headbro"})
        m = save("headbro", msg, {"error": "ai_disabled"})
        state["last_msg"] = m
        await emit({"type": "agent_message", "id": m.id, "agent": "headbro", "content": msg, "cards": [], "trace": []})
        state["done_pending"] = True
        return

    # [2] Router
    if forced_agent in router.VALID:
        decision = {"agents": [forced_agent], "reason": f"Bạn chọn trò chuyện trực tiếp với {AGENTS[forced_agent]['name']}", "offtopic": False, "method": "user"}
    else:
        with tracing.stage("router"), tracing.span("router", "route") as rsp:
            decision = await router.route(text, history, last_agent, bool(image), page)
            rsp.update(agents=decision["agents"], method=decision.get("method"))
    if tr:
        tr.route = decision
    await emit({"type": "route", **decision})

    # [3] Agents chuyên môn
    outputs: list[dict] = []
    last_msg: Message | None = None
    for idx, agent in enumerate(decision["agents"]):
        ctx = ToolContext(db=db, user=user, profile=prof, agent=agent, conversation_id=conv.id)
        with tracing.stage(agent), tracing.span("agent", agent):
            out = await run_agent(
                agent, ctx, history=history, text=text, image=image, page=page, page_context=page_context,
                notes=g.get("notes") or [], teammates=outputs, offtopic=decision.get("offtopic", False), emit=emit,
                upcoming=decision["agents"][idx + 1:],
            )
        meta = {"cards": out["cards"], "trace": out["trace"], "route": decision.get("reason")}
        if out["error"]:
            meta["error"] = out["error"]
            if tr:
                tr.status, tr.error = "error", out["error"][:300]
        if out.get("flags"):
            meta["safety_flags"] = [f["kind"] for f in out["flags"]]
        m = save(agent, out["content"], meta)
        last_msg = m
        state["last_msg"] = m
        await emit({"type": "agent_message", "id": m.id, "agent": agent, "content": out["content"], "cards": out["cards"], "trace": out["trace"]})
        outputs.append(out)

    # [4] Tổng kết khi nhiều agent cùng tham gia
    if len(outputs) > 1 and not any(o["error"] for o in outputs):
        await emit({"type": "agent_start", "agent": "headbro", "synthesis": True})
        body = "\n\n".join(f"{AGENTS[o['agent']]['name']}:\n{o['content']}" for o in outputs)
        msgs = [
            {"role": "system", "content": SYNTH_PROMPT + "\n\n" + STYLE_RULES.format(name="HeadBro")},
            {"role": "user", "content": f"Câu hỏi của người dùng: {text}\n\n{body}"},
        ]
        final = ""
        try:
            with tracing.stage("synthesis"):
                async for kind, payload in llm.stream(msgs):
                    if kind == "text":
                        await emit({"type": "token", "agent": "headbro", "delta": payload})
                    else:
                        final = payload.text
        except llm.LLMError as e:
            log.warning("Synthesis failed: %s", e)
        if final.strip():
            content = sanitize(final)
            sflags = guard.check_output(content, prof.gender, prof.weight_kg) if s.guard_output else []
            if sflags:
                content = guard.apply_output_guard(content, sflags)
                if tr:
                    tr.output_flags += [{**f, "agent": "synthesis"} for f in sflags]
            m = save("headbro", content, {"synthesis": True, "cards": [], "trace": []})
            last_msg = m
            state["last_msg"] = m
            await emit({"type": "agent_message", "id": m.id, "agent": "headbro", "content": content, "cards": [], "trace": [], "synthesis": True})

    # [5] Gợi ý câu hỏi tiếp theo (model nhanh, không chặn nếu lỗi)
    if last_msg is not None and not any(o["error"] for o in outputs):
        with tracing.stage("followups"):
            qs = await suggest_followups(text, outputs)
        if qs:
            last_msg.meta = {**(last_msg.meta or {}), "followups": qs}
            await emit({"type": "followups", "id": last_msg.id, "items": qs})

    conv.updated_at = _now()
    db.commit()
    state["done_pending"] = True
