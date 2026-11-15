"""FitBro MCP server — mở công cụ của FitBro cho các ứng dụng AI khác qua Model Context Protocol.

Sau khi cấu hình, Claude Desktop / Claude Code / Cursor... có thể:
- đọc dữ liệu tập luyện, dinh dưỡng, chỉ số cơ thể của bạn (công cụ CHỈ ĐỌC),
- tra kho kiến thức có nguồn (search_knowledge),
- hỏi thẳng đội agent FitBro (ask_fitbro) — chạy nguyên pipeline guard → router → HeadBro/CoachBro/NutriBro.

Công cụ GHI dữ liệu (propose_*, create_*, remember...) KHÔNG được mở: ở FitBro mọi thao tác ghi đều phải
qua thẻ Xác nhận trên giao diện (human-in-the-loop).

Chạy (stdio — ứng dụng MCP tự khởi động tiến trình này):
    FITBRO_USER_EMAIL=demo@fitbro.vn python mcp_server.py

Chạy dạng HTTP cục bộ (Streamable HTTP, chỉ nghe 127.0.0.1):
    FITBRO_USER_EMAIL=demo@fitbro.vn MCP_TOKEN=bi-mat python mcp_server.py --http --port 8765
    → endpoint http://127.0.0.1:8765/mcp, header Authorization: Bearer bi-mat

Ví dụ cấu hình Claude Desktop (claude_desktop_config.json):
    {"mcpServers": {"fitbro": {"command": "D:/.../backend/.venv/Scripts/python.exe",
                               "args": ["D:/.../backend/mcp_server.py"],
                               "env": {"FITBRO_USER_EMAIL": "demo@fitbro.vn"}}}}
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
logging.basicConfig(level=logging.WARNING, stream=sys.stderr)  # stdout dành riêng cho giao thức MCP

import mcp_types as types  # noqa: E402
from mcp.server.lowlevel import Server  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.agents.tools import REGISTRY, ToolContext, run_tool  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.models import Conversation, User  # noqa: E402
from app.services import stats  # noqa: E402

log = logging.getLogger("fitbro.mcp")

WRITE_PREFIXES = ("propose_", "create_")
WRITE_TOOLS = {"remember", "navigate", "open_workouts"}


def exposed_tools() -> dict:
    return {n: t for n, t in REGISTRY.items() if not n.startswith(WRITE_PREFIXES) and n not in WRITE_TOOLS}


ASK_TOOL = types.Tool(
    name="ask_fitbro",
    description="Hỏi đội huấn luyện viên AI của FitBro (HeadBro, CoachBro, NutriBro). Hệ thống tự chọn chuyên gia, "
                "đọc dữ liệu thật của người dùng và trả lời bằng tiếng Việt. Có lớp an toàn (Safety Guard).",
    input_schema={"type": "object", "properties": {
        "question": {"type": "string", "description": "Câu hỏi tiếng Việt"},
        "agent": {"type": "string", "enum": ["auto", "headbro", "coachbro", "nutribro"], "description": "Mặc định auto"},
    }, "required": ["question"]},
    annotations=types.ToolAnnotations(read_only_hint=False, open_world_hint=True),
)


def _user_email() -> str:
    e = os.environ.get("FITBRO_USER_EMAIL", "").strip().lower()
    if not e:
        raise RuntimeError("Đặt biến môi trường FITBRO_USER_EMAIL = email tài khoản FitBro muốn kết nối")
    return e


def _load_user(db):
    u = db.scalars(select(User).where(User.email == _user_email())).first()
    if not u:
        raise RuntimeError(f"Không tìm thấy tài khoản {_user_email()}")
    return u


def _text(obj, is_error: bool = False) -> types.CallToolResult:
    txt = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, default=str, indent=1)
    return types.CallToolResult(content=[types.TextContent(type="text", text=txt[:30000])], is_error=is_error)


def call_registry_tool(name: str, args: dict) -> types.CallToolResult:
    t = exposed_tools().get(name)
    if not t:
        return _text(f"Công cụ {name} không tồn tại hoặc không được mở qua MCP", True)
    db = SessionLocal()
    try:
        user = _load_user(db)
        ctx = ToolContext(db=db, user=user, profile=stats.get_profile(db, user), agent=t.agents[0])
        out = run_tool(ctx, name, args or {})
        return _text(out, is_error=isinstance(out, dict) and "error" in out)
    finally:
        db.close()


async def ask_fitbro(question: str, agent: str = "auto") -> types.CallToolResult:
    from app.agents import orchestrator

    db = SessionLocal()
    events: list[dict] = []

    async def emit(ev: dict) -> None:
        events.append(ev)

    try:
        user = _load_user(db)
        conv = Conversation(user_id=user.id, title=f"[MCP] {question[:50]}")
        db.add(conv)
        db.commit()
        await orchestrator.handle_message(db, user, conv, text=question, emit=emit,
                                          forced_agent=agent if agent and agent != "auto" else None)
    finally:
        db.close()
    parts = []
    for e in events:
        if e["type"] == "agent_message":
            cards = [c.get("kind") for c in e.get("cards") or []]
            extra = f"\n(thẻ trên app: {', '.join(cards)})" if cards else ""
            parts.append(f"{e['agent']}: {e['content']}{extra}")
        elif e["type"] == "error":
            parts.append(f"Lỗi: {e.get('message')}")
    tr = next((e for e in events if e["type"] == "trace"), {})
    if tr:
        parts.append(f"[trace {tr.get('id')} · {tr.get('total_ms')} ms · agents {tr.get('agents')}]")
    return _text("\n\n".join(parts) or "Không có câu trả lời")


# ---------------------------------------------------------------------------
# Handler MCP
# ---------------------------------------------------------------------------


async def on_list_tools(ctx, params) -> types.ListToolsResult:
    tools = [types.Tool(name=t.name, description=t.description, input_schema=t.parameters,
                        annotations=types.ToolAnnotations(read_only_hint=True))
             for t in exposed_tools().values()]
    return types.ListToolsResult(tools=[ASK_TOOL, *tools])


async def on_call_tool(ctx, params) -> types.CallToolResult:
    args = dict(params.arguments or {})
    try:
        if params.name == "ask_fitbro":
            return await ask_fitbro(str(args.get("question", "")), str(args.get("agent") or "auto"))
        return await asyncio.to_thread(call_registry_tool, params.name, args)
    except Exception as e:  # trả lỗi cho client thay vì làm sập server
        log.exception("tool %s failed", params.name)
        return _text(f"Lỗi: {e}", True)


def build_server() -> Server:
    return Server(
        "fitbro", version="3.0.0", title="FitBro AI",
        instructions="Dữ liệu tập luyện & dinh dưỡng của 1 người dùng FitBro. Dùng ask_fitbro để hỏi đội HLV AI; "
                     "các công cụ khác chỉ đọc dữ liệu. Số liệu cá nhân là thông tin riêng tư.",
        on_list_tools=on_list_tools, on_call_tool=on_call_tool,
    )


async def run_stdio() -> None:
    from mcp.server.stdio import stdio_server

    server = build_server()
    async with stdio_server() as (r, w):
        await server.run(r, w, server.create_initialization_options())


def run_http(port: int) -> None:
    import uvicorn
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import JSONResponse

    app = build_server().streamable_http_app(stateless_http=True, json_response=True, host="127.0.0.1")
    token = os.environ.get("MCP_TOKEN", "")
    if token:
        async def check(request, call_next):
            if request.headers.get("authorization") != f"Bearer {token}":
                return JSONResponse({"error": "unauthorized"}, status_code=401)
            return await call_next(request)

        app.add_middleware(BaseHTTPMiddleware, dispatch=check)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="FitBro MCP server")
    ap.add_argument("--http", action="store_true", help="chạy Streamable HTTP thay vì stdio")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    init_db()
    _user_email()
    if a.http:
        run_http(a.port)
    else:
        asyncio.run(run_stdio())
