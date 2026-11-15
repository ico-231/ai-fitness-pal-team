"""Trí nhớ AI, lịch tập tuần, nhắc nhở chủ động."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Memory, User
from ..security import get_current_user
from ..services import insights as insightsvc
from ..services import schedule as schedsvc

router = APIRouter(prefix="/api", tags=["extras"])


class MemoryIn(BaseModel):
    content: str = Field(min_length=1, max_length=300)
    category: str = "other"


class ScheduleIn(BaseModel):
    days: dict = {}  # {"0": {"plan_id": "tpl_leg"}, ...}
    note: str = ""


def memory_out(m: Memory) -> dict:
    return {"id": m.id, "content": m.content, "category": m.category, "source": m.source, "created_at": m.created_at.isoformat() + "Z"}


@router.get("/memories")
def list_memories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [memory_out(m) for m in db.scalars(select(Memory).where(Memory.user_id == user.id).order_by(Memory.created_at.desc()))]


@router.post("/memories")
def add_memory(body: MemoryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = Memory(user_id=user.id, content=body.content.strip(), category=body.category, source="manual")
    db.add(m)
    db.commit()
    return memory_out(m)


@router.delete("/memories/{mid}")
def delete_memory(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(Memory, mid)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy")
    db.delete(m)
    db.commit()
    return {"ok": True}


@router.get("/schedule")
def get_schedule(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return schedsvc.schedule_out(db, user.id)


@router.put("/schedule")
def put_schedule(body: ScheduleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    schedsvc.save_schedule(db, user.id, body.days, body.note, source="manual")
    return schedsvc.schedule_out(db, user.id)


@router.get("/insights")
def get_insights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return insightsvc.build(db, user)
