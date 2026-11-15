"""Lịch tập theo tuần (Thứ 2 → Chủ nhật), mỗi ngày gắn 1 chương trình tập hoặc nghỉ."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import WeeklySchedule, WorkoutPlan
from . import stats
from . import templates as tplsvc

DAY_NAMES = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]


def plan_summary(db: Session, uid: str, plan_id: str | None) -> dict | None:
    if not plan_id:
        return None
    t = tplsvc.get_template(plan_id)
    if t:
        return {"id": t["id"], "name": t["name"], "focus": t["focus"], "est_minutes": t["est_minutes"], "count": len(t["items"]), "source": "template"}
    p = db.get(WorkoutPlan, plan_id)
    if p and p.user_id == uid:
        return {"id": p.id, "name": p.name, "focus": p.focus, "est_minutes": p.est_minutes, "count": len(p.items), "source": p.source}
    return None


def schedule_out(db: Session, uid: str) -> dict:
    sch = db.get(WeeklySchedule, uid)
    days_raw = (sch.days if sch else {}) or {}
    today = stats.today()
    wd = today.weekday()
    done_ids = {s.plan_id for s in stats.completed_sessions(db, uid, today, today)}
    days = []
    for i in range(7):
        d = days_raw.get(str(i)) or {}
        plan = plan_summary(db, uid, d.get("plan_id"))
        days.append({
            "weekday": i, "label": DAY_NAMES[i], "plan": plan, "rest": plan is None,
            "note": d.get("note", ""), "is_today": i == wd,
            "done": bool(plan and i == wd and plan["id"] in done_ids),
        })
    return {"days": days, "today": days[wd], "note": sch.note if sch else "", "source": sch.source if sch else None,
            "has_schedule": any(not d["rest"] for d in days)}


def save_schedule(db: Session, uid: str, days: dict, note: str = "", source: str = "manual") -> WeeklySchedule:
    clean = {}
    for k, v in (days or {}).items():
        try:
            i = int(k)
        except (TypeError, ValueError):
            continue
        if 0 <= i <= 6 and isinstance(v, dict) and plan_summary(db, uid, v.get("plan_id")):
            clean[str(i)] = {"plan_id": v["plan_id"], "note": str(v.get("note") or "")[:200]}
    sch = db.get(WeeklySchedule, uid)
    if not sch:
        sch = WeeklySchedule(user_id=uid)
        db.add(sch)
    sch.days, sch.note, sch.source = clean, note[:500], source
    db.commit()
    return sch
