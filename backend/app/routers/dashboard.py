"""Dashboard: tổng quan hôm nay, báo cáo theo kỳ, bản đồ nhiệt cơ, tóm tắt bằng giọng nói."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BodyMetric, Goal, User
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
    parts = [f"{greet} {user.name or 'bạn'}."]
    r = t["readiness"]
    if r:
        parts.append(f"Điểm sẵn sàng hôm nay là {r['score']} trên 100, mức {r['label'].lower()}. {r['advice']}")
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
        parts.append(f"Trong 7 ngày qua bạn tập {w['sessions']} buổi, tổng khối lượng {w['total_volume']} ki-lô-gam.")
        if mv["top"]:
            parts.append("Nhóm cơ tập nhiều nhất là " + ", ".join(mv["muscles"][m]["label"].lower() for m in mv["top"]) + ".")
        if w["pr_count"]:
            parts.append(f"Bạn đã phá {w['pr_count']} kỷ lục cá nhân. Rất tốt!")
    else:
        parts.append(f"Tuần này bạn chưa có buổi tập nào. Mục tiêu của bạn là {p.training_days} buổi mỗi tuần, bắt đầu từ hôm nay nhé.")
    water = t["water_ml"]
    parts.append(f"Bạn đã uống {round(water / 1000, 1)} trên {round(tg['water_ml'] / 1000, 1)} lít nước.")
    st = t["streak"]["current"]
    if st >= 2:
        parts.append(f"Chuỗi hoạt động hiện tại là {st} ngày liên tiếp, giữ vững phong độ!")
    return {"text": " ".join(parts)}
