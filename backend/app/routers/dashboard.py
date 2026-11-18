"""Dashboard: tổng quan hôm nay, báo cáo theo kỳ, bản đồ nhiệt cơ, tóm tắt bằng giọng nói."""
import json
from functools import lru_cache

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import DATA_DIR
from ..db import get_db
from ..models import BodyMetric, DailyLog, Goal, User
from ..security import get_current_user
from ..services import insights as insightsvc
from ..services import schedule as schedsvc
from ..services import stats
from .body import _latest_values, goal_progress

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = stats.get_profile(db, user)
    today = stats.today_summary(db, user)
    rows = list(db.scalars(select(BodyMetric).where(BodyMetric.user_id == user.id).order_by(BodyMetric.date)))
    latest = _latest_values(rows)
    goals = [goal_progress(db, user, g, latest) for g in db.scalars(select(Goal).where(Goal.user_id == user.id, Goal.status == "active"))]
    if any(x["just_achieved"] for x in goals):
        db.commit()
    b = stats.badges(db, user.id, p)
    return {
        "user": {"name": user.name},
        "today": today,
        "week": stats.period_report(db, user.id, "week")["summary"],
        "prs": stats.personal_records(db, user.id)[:5],
        "insights": insightsvc.build(db, user),
        "schedule_today": schedsvc.schedule_out(db, user.id)["today"],
        "latest_body": latest,
        "goals": goals,
        "badges": {"achieved": sum(1 for x in b if x["achieved"]), "total": len(b), "recent": [x for x in b if x["achieved"]][-3:]},
        # có hoạt động nào chưa (tập / ghi bữa / check-in / uống nước) → nếu chưa, UI hiện hướng dẫn bắt đầu
        "has_any_data": bool(stats.active_days(db, user.id, stats.today() - stats.dt.timedelta(days=400))),
    }


@router.get("/report")
def report(period: str = "week", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return stats.period_report(db, user.id, period)


GOAL_VI = {"muscle": "Tăng cơ", "fat_loss": "Giảm mỡ", "maintain": "Giữ dáng", "endurance": "Sức bền", "health": "Sức khoẻ"}


def report_notes(s: dict, tg: dict, p, days: int, water_avg: int | None, who_per_week: float | None = None) -> list[str]:
    """3–4 nhận xét cho bản báo cáo, sinh từ số liệu thật (không gọi AI → nhanh, không tốn lượt, không bịa số)."""
    notes: list[str] = []
    n = lambda v: f"{round(v):,}".replace(",", ".")  # 1775 → "1.775" (kiểu Việt), không đụng dấu câu
    weeks = max(1, days / 7)
    per_week = s["sessions"] / weeks
    pw = f"{per_week:.1f}".rstrip("0").rstrip(".").replace(".", ",")
    want = p.training_days or 3
    if s["sessions"] == 0:
        notes.append("Chưa có buổi tập nào trong kỳ. Bắt đầu lại với 2 buổi nhẹ mỗi tuần để lấy lại nhịp.")
    elif per_week >= want:
        notes.append(f"Tập đều: trung bình {pw} buổi/tuần, đạt mục tiêu {want} buổi/tuần.")
    else:
        notes.append(f"Trung bình {pw} buổi/tuần, thấp hơn mục tiêu {want} buổi/tuần — thêm 1 buổi ngắn 30 phút là đủ bù.")
    if who_per_week is not None and who_per_week > 0:
        if who_per_week >= 150:
            notes.append(f"Vận động aerobic ≈ {round(who_per_week)} phút/tuần — đạt khuyến nghị WHO (150–300 phút).")
        else:
            notes.append(f"Vận động aerobic ≈ {round(who_per_week)} phút/tuần, chưa tới 150 phút WHO khuyến nghị — thêm đi bộ nhanh / đạp xe.")
    if s["avg_calories"] is not None:
        diff = s["avg_calories"] - tg["calories"]
        if abs(diff) <= tg["calories"] * 0.1:
            notes.append(f"Calo trung bình {n(s['avg_calories'])} kcal/ngày, sát mục tiêu {n(tg['calories'])} kcal.")
        else:
            word = "cao hơn" if diff > 0 else "thấp hơn"
            notes.append(f"Calo trung bình {n(s['avg_calories'])} kcal/ngày, {word} mục tiêu {n(abs(diff))} kcal.")
    if s["avg_protein"] is not None and tg.get("protein"):
        ratio = s["avg_protein"] / tg["protein"]
        if ratio < 0.85:
            notes.append(f"Đạm mới đạt {round(ratio * 100)}% mục tiêu ({s['avg_protein']}/{tg['protein']} g) — thêm trứng, ức gà, sữa chua Hy Lạp.")
        else:
            notes.append(f"Đạm đạt {min(100, round(ratio * 100))}% mục tiêu, đủ để giữ và xây cơ.")
    if s["weight_change"] is not None:
        wc = s["weight_change"]
        good = (p.goal == "fat_loss" and wc < 0) or (p.goal == "muscle" and wc > 0) or (p.goal in ("maintain", "health", "endurance") and abs(wc) <= 1)
        notes.append(f"Cân nặng {'tăng' if wc > 0 else 'giảm' if wc < 0 else 'giữ nguyên'} {str(abs(wc)).replace('.', ',')} kg trong kỳ — {'đúng hướng' if good else 'chưa đúng hướng'} với mục tiêu {GOAL_VI.get(p.goal, p.goal).lower()}.")
    elif water_avg is not None and water_avg < tg.get("water_ml", 2500) * 0.8:
        notes.append(f"Nước uống trung bình {n(water_avg)} ml/ngày, chưa tới 80% mục tiêu.")
    return notes[:4]


@router.get("/print")
def print_report(period: str = "week", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Toàn bộ dữ liệu cho trang báo cáo in/lưu PDF (khổ A4)."""
    period = period if period in ("week", "month") else "week"
    p = stats.get_profile(db, user)
    tg = stats.targets(p)
    rep = stats.period_report(db, user.id, period)
    start, end = stats.dt.date.fromisoformat(rep["start"]), stats.dt.date.fromisoformat(rep["end"])
    logs = list(db.scalars(select(DailyLog).where(DailyLog.user_id == user.id, DailyLog.date >= start, DailyLog.date <= end)))
    water = [x.water_ml for x in logs if x.water_ml]
    water_avg = round(sum(water) / len(water)) if water else None
    rows = list(db.scalars(select(BodyMetric).where(BodyMetric.user_id == user.id).order_by(BodyMetric.date)))
    latest = _latest_values(rows)
    goals = [goal_progress(db, user, g, latest) for g in db.scalars(select(Goal).where(Goal.user_id == user.id, Goal.status == "active"))]
    days = stats.PERIOD_DAYS[period]
    from ..services import activities as actsvc

    acts = actsvc.list_range(db, user.id, start, end)
    who_week = sum(a.who_minutes for a in acts) / max(1, days / 7) if acts else None
    return {
        "user": {"name": user.name},
        "profile": {"goal": p.goal, "goal_vi": GOAL_VI.get(p.goal, p.goal), "age": p.age, "height_cm": p.height_cm,
                    "weight_kg": (latest.get("weight_kg") or {}).get("value") or p.weight_kg, "training_days": p.training_days},
        "targets": tg,
        "report": rep,
        "water": {"avg_ml": water_avg, "days": len(water), "target_ml": tg.get("water_ml")},
        "goals": goals,
        "activities": [actsvc.out(a) for a in acts],
        "activity_summary": {"count": len(acts), "minutes": round(sum(a.duration_min for a in acts)),
                             "kcal_gross": round(sum(a.kcal_gross for a in acts)), "who_per_week": round(who_week) if who_week else 0},
        "notes": report_notes(rep["summary"], tg, p, days, water_avg, who_week),
        "generated_at": stats.now_local().isoformat(timespec="minutes"),
    }


@router.get("/heatmap")
def heatmap(days: int = 7, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return stats.muscle_volume(db, user.id, max(1, min(days, 365)))


@router.get("/briefing")
def briefing(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Tóm tắt dashboard thành 1 đoạn văn để đọc bằng giọng nói.

    Sinh bằng mẫu câu từ dữ liệu thật (không qua LLM) → nhanh, miễn phí, không thể bịa số.
    """
    p = stats.get_profile(db, user)
    t = stats.today_summary(db, user)
    w = stats.period_report(db, user.id, "week")["summary"]
    mv = stats.muscle_volume(db, user.id, 7)
    h = stats.now_local().hour
    greet = "Chào buổi sáng" if h < 11 else "Chào buổi trưa" if h < 14 else "Chào buổi chiều" if h < 18 else "Chào buổi tối"
    # tên gọi = chữ cuối của họ tên ("Nguyễn Văn Nam" → "Nam"), đọc cả họ tên nghe như điểm danh
    given = (user.name or "").split()[-1:] or ["bạn"]
    parts = [f"{greet} {given[0]}."]
    r = t["readiness"]
    if r:
        # câu riêng từng mức: ghép "mức" + nhãn ra câu lủng củng ("mức cần phục hồi", "điểm sẵn sàng … mức sẵn sàng cao")
        said = {
            "high": "cơ thể bạn hồi phục rất tốt",
            "good": "cơ thể bạn ở trạng thái khá tốt",
            "moderate": "cơ thể bạn mới hồi phục ở mức trung bình",
            "low": "cơ thể bạn cần được phục hồi",
        }.get(r.get("band"), f"mức {r['label'].lower()}")
        parts.append(f"Điểm sẵn sàng hôm nay là {r['score']} trên 100, {said}. {r['advice']}")
    else:
        parts.append("Bạn chưa check-in buổi sáng, hãy check-in để biết hôm nay nên tập nặng hay nhẹ.")
    n, tg = t["nutrition"], t["targets"]
    if n["meals_count"]:
        parts.append(f"Hôm nay bạn đã ăn {n['calories']} trên {tg['calories']} ka-lo, và {round(n['protein'])} trên {tg['protein']} gam đạm.")
    else:
        parts.append("Bạn chưa ghi bữa ăn nào hôm nay.")
    wk = t["workouts"]
    if wk["count"]:
        parts.append(f"Bạn đã hoàn thành {wk['count']} buổi tập hôm nay, tổng {wk['minutes']} phút.")
    if w["sessions"]:
        vol = f", tổng khối lượng {w['total_volume']} ki-lô-gam" if w["total_volume"] else ""  # tập không tạ → bỏ "0 ki-lô-gam"
        parts.append(f"Trong 7 ngày qua bạn tập {w['sessions']} buổi{vol}.")
        if mv["top"]:
            parts.append("Nhóm cơ tập nhiều nhất là " + ", ".join(mv["muscles"][m]["label"].lower() for m in mv["top"]) + ".")
        if w["pr_count"]:
            parts.append(f"Bạn đã phá {w['pr_count']} kỷ lục cá nhân. Rất tốt!")
    else:
        parts.append(f"Tuần này bạn chưa có buổi tập nào. Mục tiêu của bạn là {p.training_days} buổi mỗi tuần, bắt đầu từ hôm nay nhé.")
    water = t["water_ml"]
    lit = lambda ml: f"{ml / 1000:.1f}".rstrip("0").rstrip(".").replace(".", ",")  # 2000 → "2", 1500 → "1,5"
    parts.append(f"Bạn đã uống {lit(water)} trên {lit(tg['water_ml'])} lít nước.")
    st = t["streak"]["current"]
    if st >= 2:
        parts.append(f"Chuỗi hoạt động hiện tại là {st} ngày liên tiếp, giữ vững phong độ!")
    return {"text": " ".join(parts), "voice_text": _voice_briefing(h, p, t, w, mv)}


@lru_cache
def _vb() -> dict:
    return json.loads((DATA_DIR / "voice_briefing.json").read_text(encoding="utf-8"))


def _voice_briefing(h: int, p, t: dict, w: dict, mv: dict) -> str:
    """Bản tóm tắt chỉ gồm câu CỐ ĐỊNH (số liệu quy về mức) → phát được hoàn toàn bằng giọng thu sẵn.

    Số chính xác vẫn hiện trên màn hình; bản `text` đầy đủ dùng khi đọc bằng giọng trình duyệt.
    """
    vb = _vb()
    out = [vb["greet"]["morning" if h < 11 else "noon" if h < 14 else "afternoon" if h < 18 else "evening"]]
    r = t["readiness"]
    band = r.get("band") if r else None
    if band in vb["readiness"]:
        out += [vb["readiness"][band], vb["advice"][band]]
    else:
        out.append(vb["readiness"]["none"])
    n, tg = t["nutrition"], t["targets"]
    if not n["meals_count"]:
        out.append(vb["calories"]["none"])
    else:
        ratio = n["calories"] / tg["calories"] if tg.get("calories") else 0
        out.append(vb["calories"]["low" if ratio < 0.4 else "half" if ratio < 0.8 else "near" if ratio <= 1.1 else "over"])
        out.append(vb["protein"]["ok" if tg.get("protein") and n["protein"] >= 0.9 * tg["protein"] else "low"])
    if t["workouts"]["count"]:
        out.append(vb["workout_today"])
    if w["sessions"]:
        s = w["sessions"]
        out.append(vb["week_sessions"].format(n=s) if s <= vb["week_sessions_max"] else vb["week_sessions_over"])
        if mv["top"]:
            out.append(vb["top_muscle"].format(m=mv["muscles"][mv["top"][0]]["label"].lower()))
        if w["pr_count"]:
            out.append(vb["pr"])
    else:
        out.append(vb["week_none"])
        if 1 <= (p.training_days or 0) <= 7:
            out.append(vb["week_goal"].format(n=p.training_days))
    water, need = t["water_ml"], tg.get("water_ml") or 0
    out.append(vb["water"]["none" if not water else "ok" if need and water >= need else "half" if need and water >= need / 2 else "low"])
    if t["streak"]["current"] >= 2:
        out.append(vb["streak"])
    return " ".join(out)
