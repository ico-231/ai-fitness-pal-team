"""Daily: check-in buổi sáng → điểm sẵn sàng, nước uống, streak, lịch hoạt động, huy hiệu."""
import datetime as dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Activity, DailyLog, Meal, User, WorkoutSession, _now
from ..security import get_current_user
from ..services import formulas, stats

router = APIRouter(prefix="/api/daily", tags=["daily"])


class CheckinIn(BaseModel):
    sleep_hours: float = Field(ge=0, le=16)
    sleep_quality: int = Field(ge=1, le=5)
    fatigue: int = Field(ge=1, le=5)
    soreness: int = Field(ge=1, le=5)
    stress: int = Field(ge=1, le=5)
    note: str = Field("", max_length=500)


class WaterIn(BaseModel):
    delta_ml: int = Field(ge=-2000, le=2000)


def _today_payload(db: Session, user: User) -> dict:
    p = stats.get_profile(db, user)
    log = stats.daily_log(db, user.id, stats.today())
    return {
        "date": stats.today().isoformat(),
        "checked_in": bool(log and log.readiness is not None),
        "readiness": stats.readiness_detail(log),
        "water_ml": log.water_ml if log else 0,
        "water_target_ml": stats.targets(p)["water_ml"],
        "streak": stats.streak(db, user.id),
        "badges": stats.badges(db, user.id, p),
        "formula": {"weights": formulas.READINESS_WEIGHTS, "labels": formulas.READINESS_LABELS},
    }


@router.get("/today")
def today(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _today_payload(db, user)


@router.post("/checkin")
def checkin(body: CheckinIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = stats.daily_log(db, user.id, stats.today(), create=True)
    for k, v in body.model_dump().items():
        setattr(log, k, v)
    log.readiness = formulas.readiness_score(body.sleep_hours, body.sleep_quality, body.fatigue, body.soreness, body.stress)["score"]
    log.checked_in_at = _now()
    db.commit()
    return _today_payload(db, user)


@router.delete("/checkin")
def reset_checkin(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = stats.daily_log(db, user.id, stats.today())
    if log:
        log.readiness = None
        log.sleep_hours = log.sleep_quality = log.fatigue = log.soreness = log.stress = None
        log.checked_in_at = None
        db.commit()
    return _today_payload(db, user)


@router.post("/water")
def water(body: WaterIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = stats.daily_log(db, user.id, stats.today(), create=True)
    log.water_ml = max(0, (log.water_ml or 0) + body.delta_ml)
    db.commit()
    return _today_payload(db, user)


@router.get("/calendar")
def calendar(days: int = 35, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lịch hoạt động: mỗi ngày có check-in / tập / ghi bữa ăn hay không."""
    days = max(7, min(days, 120))
    end = stats.today()
    start = end - dt.timedelta(days=days - 1)
    out = {(start + dt.timedelta(days=i)).isoformat(): {"checkin": None, "workout": 0, "meals": 0, "water": 0} for i in range(days)}
    for log in db.scalars(select(DailyLog).where(DailyLog.user_id == user.id, DailyLog.date >= start)):
        d = out.get(log.date.isoformat())
        if d is not None:
            d["checkin"] = log.readiness
            d["water"] = log.water_ml
    s, _ = stats.local_day_bounds_utc(start)
    for ws in db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == user.id, WorkoutSession.status == "completed", WorkoutSession.started_at >= s)):
        d = out.get(stats.local_date(ws.started_at).isoformat())
        if d is not None:
            d["workout"] += 1
    for m in db.scalars(select(Meal).where(Meal.user_id == user.id, Meal.date >= start)):
        d = out.get(m.date.isoformat())
        if d is not None:
            d["meals"] += 1
    for a in db.scalars(select(Activity).where(Activity.user_id == user.id, Activity.date >= start)):
        d = out.get(a.date.isoformat())
        if d is not None:  # đạp xe / đá bóng ≥ 30 phút quy đổi WHO = một buổi tập trên lịch chuỗi
            d["workout"] += 1 if a.who_minutes >= 30 else 0
            d["activity"] = d.get("activity", 0) + 1
    return {"start": start.isoformat(), "end": end.isoformat(), "days": [{"date": k, **v} for k, v in out.items()]}
