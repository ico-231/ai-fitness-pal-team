"""Tổng hợp số liệu từ dữ liệu THẬT của người dùng (dashboard, báo cáo, bản đồ nhiệt, agent tools).

Không có số liệu nào được bịa: nếu chưa có dữ liệu thì trả về 0 / rỗng để UI hiện trạng thái trống.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import BodyMetric, DailyLog, Goal, Meal, Profile, User, WorkoutSession, WorkoutSet
from . import formulas
from .exercises import MUSCLES, get_exercise

# ---------------------------------------------------------------------------
# Thời gian
# ---------------------------------------------------------------------------


def tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def now_local() -> dt.datetime:
    return dt.datetime.now(tz())


def today() -> dt.date:
    return now_local().date()


def to_local(d: dt.datetime) -> dt.datetime:
    """DB lưu UTC (naive) → đổi sang giờ địa phương."""
    return d.replace(tzinfo=dt.timezone.utc).astimezone(tz())


def local_date(d: dt.datetime) -> dt.date:
    return to_local(d).date()


def local_day_bounds_utc(day: dt.date) -> tuple[dt.datetime, dt.datetime]:
    start = dt.datetime.combine(day, dt.time.min, tzinfo=tz()).astimezone(dt.timezone.utc).replace(tzinfo=None)
    return start, start + dt.timedelta(days=1)


# ---------------------------------------------------------------------------
# Hồ sơ & mục tiêu
# ---------------------------------------------------------------------------


def get_profile(db: Session, user: User) -> Profile:
    p = db.get(Profile, user.id)
    if not p:
        p = Profile(user_id=user.id, settings={})
        db.add(p)
        db.commit()
    return p


def recompute_targets(p: Profile) -> None:
    """Tính lại calo/macro/nước nếu người dùng không tự đặt tay."""
    if p.targets_manual:
        return
    if p.weight_kg and p.height_cm and p.age and p.gender:
        t = formulas.nutrition_targets(p.weight_kg, p.height_cm, p.age, p.gender, p.goal, p.activity_level)
        p.target_calories, p.target_protein = t["calories"], t["protein"]
        p.target_carbs, p.target_fat, p.target_water_ml = t["carbs"], t["fat"], t["water_ml"]


def targets(p: Profile) -> dict:
    return {
        "calories": p.target_calories or 2000,
        "protein": p.target_protein or 100,
        "carbs": p.target_carbs or 250,
        "fat": p.target_fat or 60,
        "water_ml": p.target_water_ml or 2500,
    }


# Ngày tập ăn thêm, ngày nghỉ ăn bớt — điều chỉnh qua tinh bột, đạm giữ nguyên.
CYCLE_KCAL = {"train": 150, "rest": -150}


def day_targets(db: Session, user: User, day: dt.date) -> dict:
    """Mục tiêu dinh dưỡng của một ngày cụ thể.

    Ngày tập = lịch tuần có buổi tập hôm đó, hoặc đã hoàn thành buổi tập hôm đó → +150 kcal.
    Ngày nghỉ = có lịch tuần nhưng hôm đó nghỉ và chưa tập → −150 kcal. Chưa có lịch và chưa tập → giữ nguyên.
    Tắt được trong Cài đặt (calorie_cycling). Mục tiêu tự đặt tay cũng được điều chỉnh vì là mức trung bình.
    """
    from ..models import WeeklySchedule

    p = get_profile(db, user)
    base = targets(p)
    if not (p.settings or {}).get("calorie_cycling", True):
        return {**base, "day_type": None, "adjust_kcal": 0, "base_calories": base["calories"]}
    trained = bool(completed_sessions(db, user.id, day, day))
    sch = db.get(WeeklySchedule, user.id)
    days = (sch.days if sch else {}) or {}
    has_schedule = any((v or {}).get("plan_id") for v in days.values())
    planned = bool((days.get(str(day.weekday())) or {}).get("plan_id"))
    kind = "train" if trained or planned else "rest" if has_schedule else None
    adj = CYCLE_KCAL.get(kind, 0)
    carbs = max(0, round(base["carbs"] + adj / 4))
    return {**base, "calories": base["calories"] + adj, "carbs": carbs, "day_type": kind, "adjust_kcal": adj,
            "base_calories": base["calories"]}


def latest_weight(db: Session, p: Profile) -> float | None:
    m = db.scalars(
        select(BodyMetric)
        .where(BodyMetric.user_id == p.user_id, BodyMetric.weight_kg.is_not(None))
        .order_by(BodyMetric.date.desc(), BodyMetric.created_at.desc())
    ).first()
    return m.weight_kg if m else p.weight_kg


# ---------------------------------------------------------------------------
# Dinh dưỡng
# ---------------------------------------------------------------------------


def meals_on(db: Session, uid: str, day: dt.date) -> list[Meal]:
    return list(db.scalars(select(Meal).where(Meal.user_id == uid, Meal.date == day).order_by(Meal.created_at)))


def day_nutrition(db: Session, uid: str, day: dt.date) -> dict:
    meals = meals_on(db, uid, day)
    return {
        "calories": round(sum(m.calories for m in meals)),
        "protein": round(sum(m.protein for m in meals), 1),
        "carbs": round(sum(m.carbs for m in meals), 1),
        "fat": round(sum(m.fat for m in meals), 1),
        "meals_count": len(meals),
    }


# ---------------------------------------------------------------------------
# Daily / readiness
# ---------------------------------------------------------------------------


def daily_log(db: Session, uid: str, day: dt.date, create: bool = False) -> DailyLog | None:
    log = db.scalars(select(DailyLog).where(DailyLog.user_id == uid, DailyLog.date == day)).first()
    if not log and create:
        log = DailyLog(user_id=uid, date=day, water_ml=0)
        db.add(log)
        db.flush()
    return log


def readiness_detail(log: DailyLog | None) -> dict | None:
    if not log or log.readiness is None:
        return None
    r = formulas.readiness_score(log.sleep_hours or 0, log.sleep_quality or 3, log.fatigue or 3, log.soreness or 3, log.stress or 3)
    return {
        **r,
        "date": log.date.isoformat(),
        "inputs": {
            "sleep_hours": log.sleep_hours, "sleep_quality": log.sleep_quality, "fatigue": log.fatigue,
            "soreness": log.soreness, "stress": log.stress,
        },
        "note": log.note,
    }


# ---------------------------------------------------------------------------
# Tập luyện
# ---------------------------------------------------------------------------


def completed_sessions(db: Session, uid: str, start: dt.date, end: dt.date) -> list[WorkoutSession]:
    s, _ = local_day_bounds_utc(start)
    _, e = local_day_bounds_utc(end)
    return list(
        db.scalars(
            select(WorkoutSession)
            .where(
                WorkoutSession.user_id == uid,
                WorkoutSession.status == "completed",
                WorkoutSession.started_at >= s,
                WorkoutSession.started_at < e,
            )
            .order_by(WorkoutSession.started_at)
        )
    )


def sets_between(db: Session, uid: str, start: dt.date, end: dt.date) -> list[WorkoutSet]:
    s, _ = local_day_bounds_utc(start)
    _, e = local_day_bounds_utc(end)
    return list(
        db.scalars(
            select(WorkoutSet)
            .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
            .where(
                WorkoutSet.user_id == uid,
                WorkoutSession.status == "completed",
                WorkoutSet.is_warmup.is_(False),
                WorkoutSet.created_at >= s,
                WorkoutSet.created_at < e,
            )
            .order_by(WorkoutSet.created_at)
        )
    )


# Ngưỡng số set/tuần cho mỗi nhóm cơ (khoa học: 10-20 set/tuần là vùng tăng cơ hiệu quả)
HEAT_LEVELS = [
    {"level": 0, "label": "Chưa tập", "min": 0},
    {"level": 1, "label": "Ít", "min": 0.5},
    {"level": 2, "label": "Vừa", "min": 4},
    {"level": 3, "label": "Nhiều", "min": 10},
    {"level": 4, "label": "Rất nhiều", "min": 16},
]


def muscle_volume(db: Session, uid: str, days: int) -> dict:
    """Số set hiệu quả cho từng nhóm cơ: cơ chính = 1 set, cơ phụ = 0.5 set."""
    end = today()
    start = end - dt.timedelta(days=days - 1)
    sets = sets_between(db, uid, start, end)
    acc: dict[str, float] = defaultdict(float)
    for s in sets:
        m = s.muscles or {}
        for x in m.get("primary", []):
            acc[x] += 1
        for x in m.get("secondary", []):
            acc[x] += 0.5
    weeks = max(1.0, days / 7)
    levels = [{**lv, "min": round(lv["min"] * weeks, 1)} for lv in HEAT_LEVELS]

    def level_of(v: float) -> int:
        if v <= 0:
            return 0
        lvl = 1
        for lv in levels[2:]:
            if v >= lv["min"]:
                lvl = lv["level"]
        return lvl

    muscles = {
        k: {"label": MUSCLES[k], "sets": round(acc.get(k, 0), 1), "level": level_of(acc.get(k, 0))}
        for k in MUSCLES
    }
    ranked = sorted(muscles.items(), key=lambda kv: kv[1]["sets"], reverse=True)
    return {
        "days": days,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "total_sets": len(sets),
        "muscles": muscles,
        "levels": levels,
        "top": [k for k, v in ranked if v["sets"] > 0][:3],
        "untrained": [k for k, v in muscles.items() if v["sets"] == 0],
    }


def _vi_name(ex_id: str, fallback: str) -> str:
    e = get_exercise(ex_id)
    return (e and e.get("name_vi")) or fallback


def pr_value(weight_kg: float, reps: int, duration_sec: int) -> tuple[str, float] | None:
    """Giá trị kỷ lục của 1 set: có tạ → 1RM ước tính; không tạ → số rep; bài giữ (plank) → số giây."""
    if weight_kg and weight_kg > 0 and reps:
        return "weight", formulas.one_rep_max(weight_kg, reps)
    if reps and reps > 0:
        return "reps", float(reps)
    if duration_sec and duration_sec > 0:
        return "time", float(duration_sec)
    return None


PR_UNIT = {"weight": "kg", "reps": "rep", "time": "giây"}


def pr_sets(db: Session, uid: str, exercise_id: str | None = None):
    """Các set tính kỷ lục: buổi đã hoàn thành, không phải set khởi động."""
    q = (select(WorkoutSet)
         .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
         .where(WorkoutSet.user_id == uid, WorkoutSession.status == "completed", WorkoutSet.is_warmup.is_(False)))
    if exercise_id:
        q = q.where(WorkoutSet.exercise_id == exercise_id)
    return db.scalars(q.order_by(WorkoutSet.created_at))


def personal_records(db: Session, uid: str) -> list[dict]:
    """Kỷ lục của mỗi bài, tính từ toàn bộ lịch sử set (không gồm set khởi động).

    kind = weight (1RM ước tính, Epley) | reps (bài không tạ) | time (bài giữ). `e1rm` chỉ có với kind=weight.
    Mỗi bài lấy 1 kỷ lục: ưu tiên có tạ, rồi rep, rồi giây. Danh sách: kỷ lục tạ (cao → thấp) trước.
    """
    best: dict[tuple[str, str], dict] = {}
    for s in pr_sets(db, uid):
        pv = pr_value(s.weight_kg, s.reps, s.duration_sec)
        if not pv:
            continue
        kind, val = pv
        b = best.get((s.exercise_id, kind))
        if not b or val > b["value"]:
            best[(s.exercise_id, kind)] = {
                "exercise_id": s.exercise_id, "exercise_name": _vi_name(s.exercise_id, s.exercise_name), "kind": kind,
                "value": val, "unit": PR_UNIT[kind], "e1rm": val if kind == "weight" else None,
                "weight_kg": s.weight_kg, "reps": s.reps, "duration_sec": s.duration_sec, "date": local_date(s.created_at).isoformat(),
            }
    order = {"weight": 0, "reps": 1, "time": 2}
    per_ex: dict[str, dict] = {}
    for (ex_id, kind), rec in best.items():
        if ex_id not in per_ex or order[kind] < order[per_ex[ex_id]["kind"]]:
            per_ex[ex_id] = rec
    return sorted(per_ex.values(), key=lambda x: (order[x["kind"]], -x["value"]))


def pr_events(db: Session, uid: str, start: dt.date, end: dt.date) -> list[dict]:
    """Các lần phá kỷ lục (cao hơn mọi lần trước đó cùng loại) trong khoảng thời gian."""
    best: dict[tuple[str, str], float] = {}
    events = []
    for s in pr_sets(db, uid):
        pv = pr_value(s.weight_kg, s.reps, s.duration_sec)
        if not pv:
            continue
        kind, val = pv
        prev = best.get((s.exercise_id, kind))
        d = local_date(s.created_at)
        if prev is not None and val > prev and start <= d <= end:
            events.append({
                "exercise_id": s.exercise_id, "exercise_name": _vi_name(s.exercise_id, s.exercise_name), "kind": kind,
                "value": val, "unit": PR_UNIT[kind], "e1rm": val if kind == "weight" else None,
                "previous": prev, "weight_kg": s.weight_kg, "reps": s.reps, "duration_sec": s.duration_sec, "date": d.isoformat(),
            })
        if prev is None or val > prev:
            best[(s.exercise_id, kind)] = val
    return events


def exercise_progress(db: Session, uid: str, exercise_id: str, limit: int = 40) -> dict:
    """Tiến độ 1 bài qua từng buổi (không tính set khởi động): mức tạ nặng nhất, 1RM ước tính, khối lượng.

    Bài có tạ theo dõi tạ/1RM; bài không tạ theo dõi số rep; bài giữ (plank) theo dõi số giây.
    """
    sets = list(pr_sets(db, uid, exercise_id))
    kinds = {k[0] for s in sets if (k := pr_value(s.weight_kg, s.reps, s.duration_sec))}
    kind = "weight" if "weight" in kinds else "reps" if "reps" in kinds else "time" if "time" in kinds else None
    by_session: dict[str, list[WorkoutSet]] = defaultdict(list)
    for s in sets:
        by_session[s.session_id].append(s)
    points = []
    for group in by_session.values():
        first = min(group, key=lambda x: x.created_at)
        vals = [pv[1] for x in group if (pv := pr_value(x.weight_kg, x.reps, x.duration_sec)) and pv[0] == kind]
        if not vals:
            continue
        top = max(group, key=lambda x: (x.weight_kg, x.reps, x.duration_sec))
        points.append({
            "date": local_date(first.created_at).isoformat(),
            "best": round(max(vals), 1),  # 1RM ước tính (tạ) / số rep / số giây tốt nhất trong buổi
            "top_weight": top.weight_kg,
            "top_reps": top.reps,
            "volume": round(sum(x.weight_kg * x.reps for x in group)),
            "sets": len(group),
            "_t": first.created_at,
        })
    points.sort(key=lambda p: p["_t"])
    points = points[-limit:]
    for p in points:
        p.pop("_t")
    change = round(points[-1]["best"] - points[0]["best"], 1) if len(points) >= 2 else None
    pct = round(change / points[0]["best"] * 100) if change is not None and points[0]["best"] else None
    return {"exercise_id": exercise_id, "kind": kind, "unit": PR_UNIT.get(kind or "", ""), "points": points,
            "sessions": len(points), "change": change, "change_pct": pct}


def last_performance(db: Session, uid: str, exercise_id: str) -> list[dict]:
    """Các set của lần gần nhất tập bài này (để gợi ý tăng tải lũy tiến)."""
    last = db.scalars(
        select(WorkoutSet)
        .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
        .where(WorkoutSet.user_id == uid, WorkoutSet.exercise_id == exercise_id, WorkoutSession.status == "completed",
               WorkoutSet.is_warmup.is_(False))
        .order_by(WorkoutSet.created_at.desc())
    ).first()
    if not last:
        return []
    sets = db.scalars(
        select(WorkoutSet)
        .where(WorkoutSet.session_id == last.session_id, WorkoutSet.exercise_id == exercise_id, WorkoutSet.is_warmup.is_(False))
        .order_by(WorkoutSet.set_index)
    )
    return [
        {"set_index": s.set_index, "weight_kg": s.weight_kg, "reps": s.reps, "duration_sec": s.duration_sec,
         "date": local_date(s.created_at).isoformat()}
        for s in sets
    ]


# ---------------------------------------------------------------------------
# Streak & huy hiệu
# ---------------------------------------------------------------------------


def active_days(db: Session, uid: str, since: dt.date) -> set[dt.date]:
    days: set[dt.date] = set()
    for log in db.scalars(select(DailyLog).where(DailyLog.user_id == uid, DailyLog.date >= since)):
        if log.readiness is not None or log.water_ml > 0:
            days.add(log.date)
    s, _ = local_day_bounds_utc(since)
    for ws in db.scalars(
        select(WorkoutSession).where(WorkoutSession.user_id == uid, WorkoutSession.status == "completed", WorkoutSession.started_at >= s)
    ):
        days.add(local_date(ws.started_at))
    for m in db.scalars(select(Meal).where(Meal.user_id == uid, Meal.date >= since)):
        days.add(m.date)
    return days


def streak(db: Session, uid: str) -> dict:
    """Số ngày hoạt động liên tiếp (check-in, tập, ghi bữa ăn hoặc uống nước).

    Nếu hôm nay chưa hoạt động, streak vẫn giữ từ hôm qua (chưa bị mất).
    """
    t = today()
    days = active_days(db, uid, t - dt.timedelta(days=400))
    cur = t if t in days else t - dt.timedelta(days=1)
    n = 0
    while cur in days:
        n += 1
        cur -= dt.timedelta(days=1)
    # streak dài nhất
    best, run, prev = 0, 0, None
    for d in sorted(days):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    return {"current": n, "best": best, "today_active": t in days}


def badges(db: Session, uid: str, prof: Profile) -> list[dict]:
    sessions = list(db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == uid, WorkoutSession.status == "completed")))
    n_sessions = len(sessions)
    total_volume = sum(s.total_volume for s in sessions)
    best_form = max((s.avg_form_score or 0 for s in sessions), default=0)
    n_meals = len(list(db.scalars(select(Meal.id).where(Meal.user_id == uid))))
    n_metrics = len(list(db.scalars(select(BodyMetric.id).where(BodyMetric.user_id == uid))))
    n_goals = len(list(db.scalars(select(Goal.id).where(Goal.user_id == uid))))
    st = streak(db, uid)
    n_checkins = len(list(db.scalars(select(DailyLog.id).where(DailyLog.user_id == uid, DailyLog.readiness.is_not(None)))))
    # số ngày đạt mục tiêu đạm
    tp = targets(prof)["protein"]
    by_day: dict[dt.date, float] = defaultdict(float)
    for m in db.scalars(select(Meal).where(Meal.user_id == uid)):
        by_day[m.date] += m.protein
    protein_days = sum(1 for v in by_day.values() if v >= tp * 0.95)

    defs = [
        ("first_workout", "Buổi tập đầu tiên", "🏁", n_sessions, 1),
        ("workouts_10", "10 buổi tập", "💪", n_sessions, 10),
        ("workouts_50", "50 buổi tập", "🏆", n_sessions, 50),
        ("streak_3", "Chuỗi 3 ngày", "🔥", st["best"], 3),
        ("streak_7", "Chuỗi 7 ngày", "⚡", st["best"], 7),
        ("streak_30", "Chuỗi 30 ngày", "👑", st["best"], 30),
        ("checkin_7", "7 lần check-in sáng", "🌅", n_checkins, 7),
        ("first_meal", "Ghi bữa ăn đầu tiên", "🍽️", n_meals, 1),
        ("protein_7", "7 ngày đủ đạm", "🥩", protein_days, 7),
        ("volume_10t", "Tổng 10 tấn khối lượng", "🏋️", round(total_volume), 10000),
        ("form_90", "Điểm form ≥ 90", "🎯", round(best_form), 90),
        ("first_inbody", "Lần đo cơ thể đầu tiên", "📏", n_metrics, 1),
        ("first_goal", "Đặt mục tiêu đầu tiên", "🎯", n_goals, 1),
    ]
    return [
        {"id": i, "label": label, "icon": icon, "progress": min(v, goal), "goal": goal, "achieved": v >= goal}
        for (i, label, icon, v, goal) in defs
    ]


# ---------------------------------------------------------------------------
# Báo cáo theo kỳ & tổng quan hôm nay
# ---------------------------------------------------------------------------

PERIOD_DAYS = {"week": 7, "month": 30, "quarter": 90, "year": 365}


def period_report(db: Session, uid: str, period: str) -> dict:
    days = PERIOD_DAYS.get(period, 7)
    end = today()
    start = end - dt.timedelta(days=days - 1)
    sessions = completed_sessions(db, uid, start, end)

    # chuỗi theo ngày (gộp theo tuần nếu kỳ dài)
    bucket_days = 1 if days <= 30 else 7
    buckets: dict[dt.date, dict] = {}
    cur = start
    while cur <= end:
        buckets[cur] = {"date": cur.isoformat(), "volume": 0.0, "sessions": 0, "minutes": 0, "calories": 0.0, "protein": 0.0}
        cur += dt.timedelta(days=bucket_days)

    def key_of(d: dt.date) -> dt.date:
        return start + dt.timedelta(days=((d - start).days // bucket_days) * bucket_days)

    for s in sessions:
        b = buckets.get(key_of(local_date(s.started_at)))
        if b:
            b["volume"] += s.total_volume
            b["sessions"] += 1
            b["minutes"] += round(s.duration_sec / 60)

    meals = list(db.scalars(select(Meal).where(Meal.user_id == uid, Meal.date >= start, Meal.date <= end)))
    meal_days: dict[dt.date, dict] = defaultdict(lambda: {"calories": 0.0, "protein": 0.0})
    for m in meals:
        meal_days[m.date]["calories"] += m.calories
        meal_days[m.date]["protein"] += m.protein
        b = buckets.get(key_of(m.date))
        if b:
            b["calories"] += m.calories
            b["protein"] += m.protein

    weights = [
        {"date": m.date.isoformat(), "weight": m.weight_kg, "body_fat_pct": m.body_fat_pct, "skeletal_muscle_kg": m.skeletal_muscle_kg}
        for m in db.scalars(
            select(BodyMetric).where(BodyMetric.user_id == uid, BodyMetric.date >= start, BodyMetric.date <= end).order_by(BodyMetric.date)
        )
    ]
    readiness = [
        {"date": log.date.isoformat(), "readiness": log.readiness}
        for log in db.scalars(
            select(DailyLog).where(DailyLog.user_id == uid, DailyLog.date >= start, DailyLog.date <= end, DailyLog.readiness.is_not(None)).order_by(DailyLog.date)
        )
    ]
    prs = pr_events(db, uid, start, end)
    total_volume = round(sum(s.total_volume for s in sessions))
    form_scores = [s.avg_form_score for s in sessions if s.avg_form_score]
    logged_days = len(meal_days)
    w_vals = [w["weight"] for w in weights if w["weight"]]
    return {
        "period": period,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "bucket_days": bucket_days,
        "summary": {
            "sessions": len(sessions),
            "total_volume": total_volume,
            "total_minutes": round(sum(s.duration_sec for s in sessions) / 60),
            "avg_form_score": round(sum(form_scores) / len(form_scores)) if form_scores else None,
            "pr_count": len(prs),
            "avg_calories": round(sum(v["calories"] for v in meal_days.values()) / logged_days) if logged_days else None,
            "avg_protein": round(sum(v["protein"] for v in meal_days.values()) / logged_days) if logged_days else None,
            "meal_logged_days": logged_days,
            "weight_change": round(w_vals[-1] - w_vals[0], 1) if len(w_vals) >= 2 else None,
            "avg_readiness": round(sum(r["readiness"] for r in readiness) / len(readiness)) if readiness else None,
        },
        "series": [{**b, "volume": round(b["volume"]), "calories": round(b["calories"]), "protein": round(b["protein"])} for b in buckets.values()],
        "sessions": [
            {"id": s.id, "name": s.name, "date": local_date(s.started_at).isoformat(), "minutes": round(s.duration_sec / 60),
             "volume": round(s.total_volume), "sets": len(s.sets), "form": s.avg_form_score}
            for s in reversed(sessions)
        ],
        "weights": weights,
        "readiness": readiness,
        "prs": prs,
    }


def today_summary(db: Session, user: User) -> dict:
    p = get_profile(db, user)
    t = today()
    log = daily_log(db, user.id, t)
    sessions = completed_sessions(db, user.id, t, t)
    nut = day_nutrition(db, user.id, t)
    form_scores = [s.avg_form_score for s in sessions if s.avg_form_score]
    return {
        "date": t.isoformat(),
        "readiness": readiness_detail(log),
        "water_ml": log.water_ml if log else 0,
        "nutrition": nut,
        "targets": day_targets(db, user, t),
        "workouts": {
            "count": len(sessions),
            "minutes": round(sum(s.duration_sec for s in sessions) / 60),
            "volume": round(sum(s.total_volume for s in sessions)),
            "avg_form_score": round(sum(form_scores) / len(form_scores)) if form_scores else None,
            "names": [s.name for s in sessions],
        },
        "streak": streak(db, user.id),
    }


def user_snapshot(db: Session, user: User) -> dict:
    """Ảnh chụp nhanh dữ liệu người dùng — đưa vào ngữ cảnh cho AI agent (grounding)."""
    p = get_profile(db, user)
    w = latest_weight(db, p)
    goals = [
        {"title": g.title, "metric": g.metric, "target": g.target_value, "deadline": g.deadline.isoformat() if g.deadline else None}
        for g in db.scalars(select(Goal).where(Goal.user_id == user.id, Goal.status == "active"))
    ]
    # Không gửi tên/email cho mô hình AI (giảm dữ liệu cá nhân gửi ra ngoài)
    return {
        "age": p.age,
        "gender": p.gender,
        "height_cm": p.height_cm,
        "weight_kg": w,
        "goal": p.goal,
        "level": p.level,
        "training_days_per_week": p.training_days,
        "equipment": p.equipment,
        "injuries_or_notes": p.injuries or "không có",
        "daily_targets": targets(p),
        "active_goals": goals,
    }
