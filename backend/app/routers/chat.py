"""Chat đa tác tử: lịch sử hội thoại, gửi tin nhắn (stream SSE), xác nhận hành động (human-in-the-loop)."""
import asyncio
import copy
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..agents import orchestrator
from ..agents.prompts import AGENTS
from ..agents.tools import REGISTRY, execute_action
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..services import stats
from ..models import AgentTrace, Conversation, Message, PendingAction, User
from ..security import get_current_user
from ..utils import prepare_image, thumbnail

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger("fitbro.chat")


class SendIn(BaseModel):
    conversation_id: str | None = None
    text: str = Field("", max_length=4000)
    image: str | None = None
    page: str | None = None
    page_context: str | None = Field(None, max_length=4000)
    agent: str | None = None  # None/"auto" = để Router tự chọn
    # Tạo lại / sửa câu hỏi: id tin nhắn người dùng cần thay. Tin đó và mọi tin sau nó bị xoá, rồi xử lý như tin mới.
    replace_from: str | None = None


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ConfirmIn(BaseModel):
    overrides: dict = {}


def msg_out(m: Message) -> dict:
    return {"id": m.id, "role": m.role, "agent": m.agent, "content": m.content, "meta": m.meta or {},
            "created_at": m.created_at.isoformat() + "Z"}


def _own_conv(db: Session, user: User, cid: str) -> Conversation:
    c = db.get(Conversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy cuộc trò chuyện")
    return c


@router.get("/agents")
def agents_info():
    """Mô tả hệ thống agent + công cụ của từng agent (hiển thị ở trang Hướng dẫn)."""
    out = {}
    for key, a in AGENTS.items():
        out[key] = {**a, "tools": [{"name": t.name, "description": t.description} for t in REGISTRY.values() if key in t.agents]}
    return out


@router.get("/conversations")
def conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc()).limit(100))
    return [{"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat() + "Z"} for c in rows]


@router.post("/conversations")
def new_conversation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = Conversation(user_id=user.id)
    db.add(c)
    db.commit()
    return {"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat() + "Z"}


@router.get("/conversations/{cid}")
def get_conversation(cid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _own_conv(db, user, cid)
    return {"id": c.id, "title": c.title, "messages": [msg_out(m) for m in c.messages]}


@router.patch("/conversations/{cid}")
def rename(cid: str, body: RenameIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _own_conv(db, user, cid)
    c.title = body.title
    db.commit()
    return {"ok": True}


@router.delete("/conversations/{cid}")
def delete_conversation(cid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_conv(db, user, cid))
    db.commit()
    return {"ok": True}


@router.post("/send")
async def send(body: SendIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Gửi tin nhắn → trả về luồng sự kiện SSE (route, agent_start, token, tool_call, card, agent_message, done)."""
    if not body.text.strip() and not body.image:
        raise HTTPException(400, "Tin nhắn trống")
    # Giới hạn số tin nhắn AI mỗi ngày (chống spam / kiểm soát chi phí)
    start, _ = stats.local_day_bounds_utc(stats.today())
    sent_today = db.scalar(
        select(func.count(Message.id)).join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user.id, Message.role == "user", Message.created_at >= start)
    ) or 0
    # Lượt đã xử lý (trace không bị xoá theo tin nhắn) → "tạo lại" nhiều lần vẫn bị tính vào giới hạn
    turns_today = db.scalar(select(func.count(AgentTrace.id)).where(AgentTrace.user_id == user.id, AgentTrace.created_at >= start)) or 0
    sent_today = max(sent_today, turns_today)
    if sent_today >= get_settings().chat_daily_limit:
        raise HTTPException(429, f"Bạn đã dùng hết {get_settings().chat_daily_limit} tin nhắn AI hôm nay. Quay lại vào ngày mai nhé!")
    if body.conversation_id:
        conv = _own_conv(db, user, body.conversation_id)
        if body.replace_from:
            target = db.get(Message, body.replace_from)
            if not target or target.conversation_id != conv.id or target.role != "user":
                raise HTTPException(404, "Không tìm thấy câu hỏi cần thay")
            for m in db.scalars(select(Message).where(Message.conversation_id == conv.id, Message.created_at >= target.created_at)):
                db.delete(m)
            db.commit()
    else:
        conv = Conversation(user_id=user.id)
        db.add(conv)
        db.commit()
    image = prepare_image(body.image) if body.image else None
    thumb = thumbnail(body.image) if body.image else None
    conv_id, user_id = conv.id, user.id

    queue: asyncio.Queue = asyncio.Queue()

    async def emit(ev: dict) -> None:
        await queue.put(ev)

    async def worker() -> None:
        # Session riêng cho tác vụ nền (không phụ thuộc vòng đời request)
        wdb = SessionLocal()
        try:
            u = wdb.get(User, user_id)
            c = wdb.get(Conversation, conv_id)
            await orchestrator.handle_message(
                wdb, u, c, text=body.text.strip(), image=image, image_thumb=thumb, page=body.page,
                page_context=body.page_context, forced_agent=body.agent if body.agent != "auto" else None, emit=emit,
            )
        except Exception as e:  # pragma: no cover
            log.exception("chat worker failed")
            await queue.put({"type": "error", "message": f"Lỗi hệ thống: {e}"})
            await queue.put({"type": "done"})
        finally:
            wdb.close()

    task = asyncio.create_task(worker())

    async def stream():
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"  # giữ kết nối qua proxy
                    continue
                yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
                if ev.get("type") == "done":
                    break
        finally:
            if not task.done():
                # client ngắt kết nối: để worker chạy nốt và lưu câu trả lời vào DB
                pass

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


def _update_card_status(db: Session, pa: PendingAction, status: str, result: dict) -> None:
    """Cập nhật trạng thái thẻ xác nhận trong lịch sử chat (để mở lại vẫn thấy 'Đã lưu')."""
    if not pa.conversation_id:
        return
    for m in db.scalars(select(Message).where(Message.conversation_id == pa.conversation_id, Message.role == "assistant")):
        meta = copy.deepcopy(m.meta or {})
        changed = False
        for c in meta.get("cards") or []:
            if c.get("kind") == "confirm" and c.get("action_id") == pa.id:
                c["status"], c["result"] = status, result
                changed = True
        if changed:
            m.meta = meta
            flag_modified(m, "meta")


def _own_action(db: Session, user: User, aid: str) -> PendingAction:
    pa = db.get(PendingAction, aid)
    if not pa or pa.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy hành động")
    if pa.status != "pending":
        raise HTTPException(409, f"Hành động đã được xử lý ({pa.status})")
    return pa


@router.post("/actions/{aid}/confirm")
def confirm(aid: str, body: ConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pa = _own_action(db, user, aid)
    result = execute_action(db, user, pa, body.overrides)
    pa.status, pa.result = "confirmed", result
    _update_card_status(db, pa, "confirmed", result)
    db.commit()
    return {"status": "confirmed", "type": pa.type, "result": result}


@router.post("/actions/{aid}/cancel")
def cancel(aid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pa = _own_action(db, user, aid)
    pa.status = "cancelled"
    _update_card_status(db, pa, "cancelled", {})
    db.commit()
    return {"status": "cancelled"}
