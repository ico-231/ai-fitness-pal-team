"""Lịch tập theo tuần (Thứ 2 → Chủ nhật), mỗi ngày gắn 1 chương trình tập hoặc nghỉ.

Hai lớp:
- TUẦN MẪU: days["0".."6"] — lặp lại mọi tuần (AI lên lịch / người dùng chọn ở "Lịch tuần").
- NGOẠI LỆ THEO NGÀY: days["_dates"]["YYYY-MM-DD"] = {"plan_id": ... | None} — chỉ đổi đúng ngày đó
  (xếp trước tuần sau, đổi riêng một ngày tuần này). plan_id None = nghỉ ngày đó.
Mọi nơi hỏi "ngày X tập gì" đi qua entry_for() để hai lớp luôn khớp nhau.
Lưu cả hai trong cột JSON sẵn có → không cần bảng / migration mới.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session

from ..models import WeeklySchedule, WorkoutPlan
from . import stats
from . import templates as tplsvc

DAY_NAMES = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]
DATES_KEY = "_dates"
MAX_WEEKS_AHEAD = 2  # xếp trước tối đa 2 tuần sau tuần này
KEEP_PAST_DAYS = 120  # ngoại lệ cũ hơn thế thì dọn đi cho JSON gọn


def raw_days(db: Session, uid: str) -> dict:
    sch = db.get(WeeklySchedule, uid)
    return dict((sch.days if sch else {}) or {})


def entry_for(days_raw: dict, day: dt.date) -> tuple[dict, bool]:
    """(mục lịch của ngày, có phải ngoại lệ không). Ngoại lệ thắng tuần mẫu."""
    ov = (days_raw.get(DATES_KEY) or {}).get(day.isoformat())
    if ov is not None:
        return ov, True
    return days_raw.get(str(day.weekday())) or {}, False


def plan_id_for(db: Session, uid: str, day: dt.date, days_raw: dict | None = None) -> str | None:
    e, _ = entry_for(days_raw if days_raw is not None else raw_days(db, uid), day)
    return e.get("plan_id")


def has_template(days_raw: dict) -> bool:
    return any((v or {}).get("plan_id") for k, v in days_raw.items() if k != DATES_KEY and isinstance(v, dict))


def week_start(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


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
    """Lịch của TUẦN NÀY (đã áp ngoại lệ theo ngày) + tuần mẫu (template_plan) để màn sửa lịch biết đâu là mẫu."""
    sch = db.get(WeeklySchedule, uid)
    days_raw = dict((sch.days if sch else {}) or {})
    today = stats.today()
    wd = today.weekday()
    monday = week_start(today)
    done_ids = {s.plan_id for s in stats.completed_sessions(db, uid, today, today)}
    days = []
    for i in range(7):
        date = monday + dt.timedelta(days=i)
        d, overridden = entry_for(days_raw, date)
        plan = plan_summary(db, uid, d.get("plan_id"))
        tpl = days_raw.get(str(i)) or {}
        days.append({
            "weekday": i, "label": DAY_NAMES[i], "date": date.isoformat(), "plan": plan, "rest": plan is None,
            "note": d.get("note", ""), "is_today": i == wd, "overridden": overridden,
            "template_plan": plan_summary(db, uid, tpl.get("plan_id")),
            "done": bool(plan and i == wd and plan["id"] in done_ids),
        })
    return {"days": days, "today": days[wd], "note": sch.note if sch else "", "source": sch.source if sch else None,
            "has_schedule": has_template(days_raw) or any(not d["rest"] for d in days)}


def week_out(db: Session, uid: str, start: dt.date) -> dict:
    """Một tuần bất kỳ (start = thứ 2). Tuần đã qua: buổi đã tập thật; tuần tới: lịch dự kiến (mẫu + ngoại lệ)."""
    start = week_start(start)
    today = stats.today()
    this_monday = week_start(today)
    days_raw = raw_days(db, uid)
    end = start + dt.timedelta(days=6)
    by_day: dict[str, list] = {}
    for s in stats.completed_sessions(db, uid, start, min(end, today)):
        by_day.setdefault(stats.local_date(s.started_at).isoformat(), []).append(
            {"id": s.id, "name": s.name, "minutes": round(s.duration_sec / 60), "plan_id": s.plan_id, "kind": "gym"})
    # Hoạt động khác (đạp xe, đá bóng...) cũng là vận động của ngày đó
    from . import activities as actsvc

    acts_by_day: dict[str, list] = {}
    for a in actsvc.list_range(db, uid, start, min(end, today)):
        acts_by_day.setdefault(a.date.isoformat(), []).append(
            {"id": a.id, "name": a.name, "minutes": round(a.duration_min), "kind": "activity", "icon": (actsvc.get(a.activity_code) or {}).get("icon"),
             "who_minutes": a.who_minutes})
    # Tuần đã qua: lịch mẫu có thể đã sửa sau đó → KHÔNG suy ra "bỏ lỡ" từ lịch hiện tại, chỉ hiện buổi đã tập thật.
    old_week = start < this_monday
    days = []
    for i in range(7):
        date = start + dt.timedelta(days=i)
        e, overridden = entry_for(days_raw, date)
        plan = None if old_week else plan_summary(db, uid, e.get("plan_id"))
        overridden = overridden and not old_week
        tpl = days_raw.get(str(i)) or {}
        sessions = by_day.get(date.isoformat(), [])
        acts = acts_by_day.get(date.isoformat(), [])
        past = date < today
        if sessions:
            status = "done"
        elif acts and plan and past and sum(x["who_minutes"] for x in acts) >= 30:
            # NGÀY ĐÃ QUA có lịch gym nhưng đi đạp xe / đá bóng ≥ 30 phút (vừa trở lên) → "thay bằng", không tính "bỏ lỡ".
            # Hôm nay thì chưa kết luận: tối vẫn có thể đi tập.
            status = "replaced"
        elif acts and not plan:
            status = "active"
        elif plan and past:
            status = "missed"
        elif plan:
            status = "planned"
        else:
            status = "rest"
        days.append({
            "date": date.isoformat(), "weekday": i, "label": DAY_NAMES[i], "plan": plan, "rest": plan is None,
            "overridden": overridden, "template_plan": plan_summary(db, uid, tpl.get("plan_id")),
            "is_today": date == today, "past": past, "sessions": sessions, "activities": acts, "status": status,
            "editable": date >= today and date <= this_monday + dt.timedelta(days=7 * (MAX_WEEKS_AHEAD + 1) - 1),
        })
    offset = (start - this_monday).days // 7
    return {"start": start.isoformat(), "end": end.isoformat(), "offset": offset, "days": days,
            "has_template": has_template(days_raw), "max_weeks_ahead": MAX_WEEKS_AHEAD,
            "summary": {"planned": sum(1 for d in days if d["plan"]), "done": sum(1 for d in days if d["status"] == "done"),
                        "missed": sum(1 for d in days if d["status"] == "missed"),
                        "active": sum(1 for d in days if d["status"] in ("active", "replaced"))}}


def set_date(db: Session, uid: str, day: dt.date, plan_id: str | None, reset: bool = False) -> None:
    """Đổi lịch đúng một ngày (không đụng tuần mẫu). reset=True → bỏ ngoại lệ, về theo mẫu."""
    today = stats.today()
    if day < today:
        raise ValueError("Không sửa được lịch của ngày đã qua")
    if day > week_start(today) + dt.timedelta(days=7 * (MAX_WEEKS_AHEAD + 1) - 1):
        raise ValueError(f"Chỉ xếp trước được tối đa {MAX_WEEKS_AHEAD} tuần sau tuần này")
    if plan_id and not plan_summary(db, uid, plan_id):
        raise ValueError("Không tìm thấy chương trình tập này")
    sch = db.get(WeeklySchedule, uid)
    if not sch:
        sch = WeeklySchedule(user_id=uid, days={})
        db.add(sch)
    days = dict(sch.days or {})
    dates = {k: v for k, v in (days.get(DATES_KEY) or {}).items()
             if k >= (today - dt.timedelta(days=KEEP_PAST_DAYS)).isoformat()}
    tpl = (days.get(str(day.weekday())) or {}).get("plan_id")
    if reset or (plan_id or None) == (tpl or None):
        dates.pop(day.isoformat(), None)  # trùng với mẫu → không cần ngoại lệ
    else:
        dates[day.isoformat()] = {"plan_id": plan_id or None, "note": ""}
    days[DATES_KEY] = dates
    sch.days = days  # gán dict mới để SQLAlchemy nhận thay đổi của cột JSON
    db.commit()


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
    # đổi tuần mẫu KHÔNG xoá các ngày đã xếp riêng (ngoại lệ theo ngày)
    keep = (sch.days or {}).get(DATES_KEY) if sch.days else None
    if keep:
        clean[DATES_KEY] = keep
    sch.days, sch.note, sch.source = clean, note[:500], source
    db.commit()
    return sch
