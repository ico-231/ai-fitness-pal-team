"""Quản lý dữ liệu cá nhân: xuất toàn bộ (JSON) và xoá sạch."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Activity, AgentTrace, BodyMetric, Conversation, DailyLog, Goal, Meal, Memory, PendingAction, User, WeeklySchedule, WorkoutPlan, WorkoutSession
from ..security import get_current_user
from ..services import activities as actsvc
from ..services import schedule as schedsvc
from ..services import stats
from .body import metric_out
from .nutrition import meal_out
from .profile import profile_out
from .workouts import plan_out, session_out

router = APIRouter(prefix="/api/data", tags=["data"])


class WipeIn(BaseModel):
    confirm: str  # phải gõ đúng "XOA" để tránh bấm nhầm
    reset_profile: bool = False


@router.get("/export")
def export(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uid = user.id
    data = {
        "user": {"email": user.email, "name": user.name},
        "profile": profile_out(stats.get_profile(db, user)),
        "daily_logs": [
            {"date": x.date.isoformat(), "sleep_hours": x.sleep_hours, "sleep_quality": x.sleep_quality, "fatigue": x.fatigue,
             "soreness": x.soreness, "stress": x.stress, "water_ml": x.water_ml, "readiness": x.readiness, "note": x.note}
            for x in db.scalars(select(DailyLog).where(DailyLog.user_id == uid).order_by(DailyLog.date))
        ],
        "workout_sessions": [session_out(s) for s in db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == uid))],
        "workout_plans": [plan_out(p) for p in db.scalars(select(WorkoutPlan).where(WorkoutPlan.user_id == uid))],
        "meals": [meal_out(m) for m in db.scalars(select(Meal).where(Meal.user_id == uid).order_by(Meal.date))],
        "activities": [actsvc.out(a) for a in db.scalars(select(Activity).where(Activity.user_id == uid).order_by(Activity.date))],
        "body_metrics": [metric_out(m) for m in db.scalars(select(BodyMetric).where(BodyMetric.user_id == uid).order_by(BodyMetric.date))],
        "goals": [{"title": g.title, "metric": g.metric, "start": g.start_value, "target": g.target_value,
                   "deadline": g.deadline.isoformat() if g.deadline else None, "status": g.status}
                  for g in db.scalars(select(Goal).where(Goal.user_id == uid))],
        "ai_memories": [m.content for m in db.scalars(select(Memory).where(Memory.user_id == uid))],
        "weekly_schedule": [{"day": d["label"], "plan": d["plan"]["name"] if d["plan"] else None}
                            for d in schedsvc.schedule_out(db, uid)["days"]],
        "favorite_meals": (stats.get_profile(db, user).settings or {}).get("favorite_meals", []),
    }
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="fitbro-data.json"'})


@router.post("/wipe")
def wipe(body: WipeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.confirm.strip().upper() != "XOA":
        return JSONResponse({"detail": 'Gõ "XOA" để xác nhận'}, status_code=400)
    uid = user.id
    for sess in db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == uid)):
        db.delete(sess)  # xoá kèm các set
    for conv in db.scalars(select(Conversation).where(Conversation.user_id == uid)):
        db.delete(conv)  # xoá kèm tin nhắn
    for model in (Activity, DailyLog, Meal, BodyMetric, Goal, WorkoutPlan, PendingAction, Memory, WeeklySchedule, AgentTrace):
        db.execute(delete(model).where(model.user_id == uid))
    # Lượt AI đã dùng hôm nay giữ nguyên (xoá dữ liệu không phải cách để có thêm lượt). Món yêu thích là dữ liệu → xoá.
    p = stats.get_profile(db, user)
    p.settings = {k: v for k, v in (p.settings or {}).items() if k != "favorite_meals"}
    if body.reset_profile:
        p.onboarded = False
    db.commit()
    return {"ok": True}
