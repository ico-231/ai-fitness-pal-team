"""Hoạt động khác (đạp xe, đá bóng, bơi...): danh mục, ước tính calo, ghi / sửa / xoá, tổng hợp hôm nay & tuần (WHO)."""
import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Activity, User
from ..security import get_current_user
from ..services import activities as actsvc
from ..services import stats

router = APIRouter(prefix="/api/activities", tags=["activities"])

Intensity = Literal["light", "moderate", "vigorous"]


class EstimateIn(BaseModel):
    activity_code: str
    duration_min: float | None = Field(default=None, ge=0, le=actsvc.MAX_MINUTES * 2)
    intensity: Intensity = "moderate"
    distance_km: float | None = Field(default=None, ge=0, le=1000)
    steps: int | None = Field(default=None, ge=0, le=200000)
    avg_hr: int | None = Field(default=None, ge=0, le=260)


class ActivityIn(EstimateIn):
    date: dt.date | None = None
    note: str = ""
    force: bool = False  # đã xác nhận cảnh báo (trùng / số liệu bất thường)


def _day_vi(d: dt.date) -> str:
    diff = (stats.today() - d).days
    return "Hôm nay" if diff == 0 else "Hôm qua" if diff == 1 else f"Ngày {d.day}/{d.month}"


def _error(e: Exception):
    if isinstance(e, actsvc.Duplicate):
        return JSONResponse(status_code=409, content={
            "detail": f"{_day_vi(e.existing.date)} bạn đã ghi {e.existing.name.lower()} {round(e.existing.duration_min)} phút. Vẫn lưu thêm?",
            "code": "duplicate", "existing": actsvc.out(e.existing)})
    if isinstance(e, actsvc.NeedsConfirm):
        return JSONResponse(status_code=409, content={"detail": " ".join(e.warnings) + " Bạn chắc chắn chứ?", "code": "confirm",
                                                      "warnings": e.warnings})
    raise HTTPException(400, str(e))


@router.get("/catalog")
def catalog():
    c = actsvc.catalog()
    return {"categories": c["categories"], "items": [actsvc.public(a) for a in c["items"]],
            "intensities": [{"key": k, "label": actsvc.INTENSITY_VI[k], "talk_test": actsvc.TALK_TEST[k]} for k in actsvc.INTENSITIES]}


@router.get("/search")
def search(q: str = ""):
    return actsvc.search(q, limit=12)


@router.post("/estimate")
def estimate(body: EstimateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Xem trước calo khi đang gõ — không lưu."""
    try:
        return actsvc.estimate(db, user, body.activity_code, body.duration_min, body.intensity, body.distance_km, body.steps, body.avg_hr)
    except actsvc.ActivityError as e:
        raise HTTPException(400, str(e))


@router.get("/summary")
def summary(date: dt.date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Hôm nay (hoạt động + buổi gym), tuần này theo WHO, 4 tuần gần nhất, hoạt động gần đây, chế độ mục tiêu calo."""
    b = actsvc.body_info(db, user)
    day = date or stats.today()
    tg = stats.day_targets(db, user, day)
    return {
        "date": day.isoformat(), "day": actsvc.day_energy(db, user, day, b), "week": actsvc.week_summary(db, user, day, b),
        "history": actsvc.weekly_history(db, user, 4, b), "recent": actsvc.recent(db, user.id),
        "energy": {"mode": b["mode"], "eat_back": b["eat_back"], "lifestyle": b["lifestyle"], "lifestyle_label": b["lifestyle_label"],
                   "has_weight": bool(b["weight_kg"]), "adjust_kcal": tg.get("activity_adjust_kcal", 0)},
    }


@router.get("")
def list_activities(days: int = 30, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    end = stats.today()
    start = end - dt.timedelta(days=max(1, min(days, 365)) - 1)
    return [actsvc.out(a) for a in actsvc.list_range(db, user.id, start, end)]


@router.post("")
def create(body: ActivityIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        a = actsvc.save(db, user, {**body.model_dump(), "date": body.date or stats.today()}, "manual", force=body.force)
    except (actsvc.ActivityError, actsvc.Duplicate, actsvc.NeedsConfirm) as e:
        return _error(e)
    return actsvc.out(a)


def _own(db: Session, user: User, aid: str) -> Activity:
    a = db.get(Activity, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy hoạt động")
    return a


@router.put("/{aid}")
def update(aid: str, body: ActivityIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own(db, user, aid)
    try:
        a = actsvc.save(db, user, {**body.model_dump(), "date": body.date or a.date}, a.source, force=body.force, existing=a)
    except (actsvc.ActivityError, actsvc.Duplicate, actsvc.NeedsConfirm) as e:
        return _error(e)
    return actsvc.out(a)


@router.delete("/{aid}")
def delete(aid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, aid))
    db.commit()
    return {"ok": True}
