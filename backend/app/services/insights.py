"""Nhắc nhở chủ động (proactive coaching) — HeadBro tự phát hiện vấn đề từ dữ liệu thật.

Dùng luật thay vì LLM: chạy mỗi lần mở Dashboard, miễn phí, tức thì, không bịa số.
Mỗi nhắc nhở có hành động đi kèm (mở trang hoặc hỏi đúng agent).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BodyMetric, Goal, User
from . import schedule as schedsvc
from . import stats

def _vn(x: float, digits: int = 1) -> str:
    """Số thập phân kiểu Việt (dấu phẩy), khớp với cách giao diện hiển thị."""
    return f"{x:.{digits}f}".rstrip("0").rstrip(".").replace(".", ",")


BIG_GROUPS = {
    "Chân": ["quads", "hamstrings", "glutes"],
    "Lưng": ["lats", "upper_back"],
    "Ngực": ["chest"],
    "Vai": ["shoulders"],
}


def _days_since_trained(db: Session, uid: str, muscles: list[str], horizon: int = 30) -> int | None:
    end = stats.today()
    sets = stats.sets_between(db, uid, end - dt.timedelta(days=horizon - 1), end)
    last = None
    for s in sets:
        if set((s.muscles or {}).get("primary", [])) & set(muscles):
            d = stats.local_date(s.created_at)
            last = d if not last or d > last else last
    return (end - last).days if last else None


def build(db: Session, user: User) -> list[dict]:
    p = stats.get_profile(db, user)
    uid = user.id
    t = stats.today()
    hour = stats.now_local().hour
    tg = stats.targets(p)
    out: list[dict] = []

    def add(level: str, title: str, text: str, action: dict | None = None, ask: dict | None = None, priority: int = 5):
        out.append({"level": level, "title": title, "text": text, "action": action, "ask": ask, "priority": priority})

    # Check-in / điểm sẵn sàng và buổi tập theo lịch KHÔNG nằm ở đây: thẻ "Hôm nay nên làm gì"
    # trên giao diện gộp lịch + điểm sẵn sàng thành một lời khuyên duy nhất, tránh khuyên ngược nhau.
    log = stats.daily_log(db, uid, t)
    sch = schedsvc.schedule_out(db, uid)
    rest_day = sch["has_schedule"] and not sch["today"]["plan"]

    # Tiến độ số buổi trong tuần (từ thứ 2)
    week_start = t - dt.timedelta(days=t.weekday())
    week_sessions = stats.completed_sessions(db, uid, week_start, t)
    sessions_week = len(week_sessions)
    # Ngày chỉ có hoạt động khác đủ 30 phút quy đổi (đá bóng, đạp xe...) cũng tính là đã vận động — không nhắc "thiếu buổi" oan
    from . import activities as actsvc

    gym_days = {stats.local_date(s.started_at) for s in week_sessions}
    acts_week = actsvc.list_range(db, uid, week_start, t)
    act_days: dict[dt.date, float] = {}
    for a in acts_week:
        act_days[a.date] = act_days.get(a.date, 0) + a.who_minutes
    other_days = len([d for d, m in act_days.items() if m >= 30 and d not in gym_days])
    effective = sessions_week + other_days
    if p.training_days and t.weekday() >= 3 and effective < max(1, p.training_days - (6 - t.weekday())):
        extra = f" (+{other_days} buổi hoạt động khác)" if other_days else ""
        add("warn", f"Tuần này mới tập {sessions_week}/{p.training_days} buổi{extra}",
            ("Hôm nay là ngày nghỉ theo lịch, cứ nghỉ. Nếu muốn bù, hỏi CoachBro cách dồn buổi vào các ngày còn lại."
             if rest_day else "Còn ít ngày trong tuần — một buổi ngắn hôm nay đủ để giữ nhịp."),
            ask={"agent": "coachbro", "text": ("Tuần này mình đang tập thiếu buổi, hôm nay là ngày nghỉ theo lịch. Nên bù vào các ngày còn lại thế nào?"
                          if rest_day else "Tuần này mình đang tập thiếu buổi, gợi ý một buổi tập ngắn hôm nay.")}, priority=3)

    # Phút vận động WHO — chỉ nhắc người có dùng "Hoạt động khác" (tránh làm phiền người chỉ tập gym)
    uses_activities = bool(actsvc.list_range(db, uid, t - dt.timedelta(days=30), t))
    if uses_activities and t.weekday() >= 3:
        wk = actsvc.week_summary(db, user, t)
        if wk["who_minutes"] < wk["target_min"]:
            add("info", f"Còn {wk['target_min'] - wk['who_minutes']} phút để đạt 150 phút vận động tuần này",
                "Khuyến nghị WHO: 150–300 phút aerobic mỗi tuần (phút mạnh tính gấp đôi). Đi bộ nhanh 30 phút là một cách dễ.",
                action={"label": "Ghi hoạt động", "to": "/workouts?tab=activity"}, priority=4)
        elif wk["who_minutes"] >= wk["target_min"] and wk["strength_days"] >= wk["strength_target"]:
            add("good", "Đạt chuẩn vận động WHO tuần này", f"{wk['who_minutes']} phút aerobic và {wk['strength_days']} buổi sức mạnh.",
                action={"label": "Xem tuần này", "to": "/workouts?tab=activity"}, priority=7)

    # Nhóm cơ lớn bị bỏ quên (chỉ khi người dùng đã tập đều)
    month_sessions = len(stats.completed_sessions(db, uid, t - dt.timedelta(days=29), t))
    if month_sessions >= 3:
        for label, muscles in BIG_GROUPS.items():
            d = _days_since_trained(db, uid, muscles)
            if d is None or d >= 8:
                add("info", f"Đã {'hơn 30' if d is None else d} ngày chưa tập {label.lower()}",
                    "Tập cân đối các nhóm cơ giúp tránh chấn thương và tăng cơ đều hơn.",
                    ask={"agent": "coachbro", "text": f"Mình chưa tập {label.lower()} lâu rồi, tạo cho mình một buổi tập {label.lower()}."}, priority=4)
                break

    # Đạm 3 ngày có ghi gần nhất
    logged = []
    for i in range(1, 8):
        n = stats.day_nutrition(db, uid, t - dt.timedelta(days=i))
        if n["meals_count"]:
            logged.append(n)
        if len(logged) == 3:
            break
    if len(logged) >= 2:
        avg_p = sum(x["protein"] for x in logged) / len(logged)
        avg_c = sum(x["calories"] for x in logged) / len(logged)
        if avg_p < tg["protein"] * 0.8:
            add("warn", f"Đạm trung bình chỉ {round(avg_p)}g/ngày", f"Mục tiêu của bạn là {tg['protein']}g. Thiếu đạm làm hồi phục và tăng cơ chậm.",
                ask={"agent": "nutribro", "text": "Mấy ngày nay mình ăn thiếu đạm, gợi ý cách bổ sung bằng món Việt dễ mua."}, priority=3)
        if p.goal == "fat_loss" and avg_c > tg["calories"] * 1.15:
            add("warn", "Calo vượt mục tiêu giảm mỡ", f"Trung bình {round(avg_c)} kcal/ngày, mục tiêu {tg['calories']} kcal.",
                ask={"agent": "nutribro", "text": "Mình đang ăn vượt calo khi giảm mỡ, giúp mình điều chỉnh thực đơn."}, priority=3)
        if p.goal == "muscle" and avg_c < tg["calories"] * 0.85:
            add("warn", "Ăn chưa đủ để tăng cơ", f"Trung bình {round(avg_c)} kcal/ngày, mục tiêu {tg['calories']} kcal.",
                ask={"agent": "nutribro", "text": "Mình ăn chưa đủ calo để tăng cơ, gợi ý thêm bữa phụ."}, priority=3)

    # Nước buổi chiều
    water = log.water_ml if log else 0
    if hour >= 15 and water < tg["water_ml"] * 0.5:
        add("info", "Uống thêm nước", f"Mới {_vn(water / 1000)} / {_vn(tg['water_ml'] / 1000)} L hôm nay.", action={"label": "Ghi nước", "to": "/daily"}, priority=5)

    # Streak sắp mất
    st = stats.streak(db, uid)
    if st["current"] >= 3 and not st["today_active"] and hour >= 17:
        add("warn", f"Giữ chuỗi {st['current']} ngày!", "Hôm nay bạn chưa có hoạt động nào. Chỉ cần check-in, ghi 1 bữa ăn hoặc 1 hoạt động.", action={"label": "Check-in", "to": "/daily"}, priority=2)

    # Xu hướng cân nặng ngược mục tiêu (14 ngày)
    ws = [m.weight_kg for m in db.scalars(
        select(BodyMetric).where(BodyMetric.user_id == uid, BodyMetric.weight_kg.is_not(None), BodyMetric.date >= t - dt.timedelta(days=14)).order_by(BodyMetric.date))]
    if len(ws) >= 2:
        delta = ws[-1] - ws[0]
        if p.goal == "fat_loss" and delta > 0.5:
            add("warn", f"Cân nặng tăng {_vn(delta)}kg trong 2 tuần", "Ngược với mục tiêu giảm mỡ — cùng HeadBro xem lại nguyên nhân.",
                ask={"agent": "headbro", "text": "Cân nặng của mình tăng trong 2 tuần dù đang giảm mỡ, phân tích giúp mình."}, priority=3)
        if p.goal == "muscle" and delta < -0.5:
            add("warn", f"Cân nặng giảm {_vn(-delta)}kg trong 2 tuần", "Khi tăng cơ nên tăng 0.25–0.5kg/tuần.",
                ask={"agent": "nutribro", "text": "Mình đang tăng cơ nhưng lại sụt cân, cần ăn thêm thế nào?"}, priority=3)

    # Mục tiêu sắp hết hạn / đã quá hạn mà chưa đạt (mục tiêu đạt rồi đã tự chuyển "Đã đạt")
    for g in db.scalars(select(Goal).where(Goal.user_id == uid, Goal.status == "active", Goal.deadline.is_not(None))
                        .order_by(Goal.deadline)):
        left = (g.deadline - t).days
        if left < 0:
            add("info", f"Mục tiêu \"{g.title}\" đã quá hạn {-left} ngày",
                "Đặt lại hạn chót thực tế hơn, hoặc cùng HeadBro xem vì sao chưa đạt.",
                action={"label": "Xem mục tiêu", "to": "/inbody"},
                ask={"agent": "headbro", "text": f"Mục tiêu \"{g.title}\" của mình đã quá hạn mà chưa đạt. Phân tích lý do và giúp mình đặt lại hạn chót thực tế."},
                priority=4)
            break
        if left <= 7:
            add("warn", f"Còn {left} ngày cho mục tiêu \"{g.title}\"" if left else f"Hôm nay là hạn chót mục tiêu \"{g.title}\"",
                "Xem tiến độ hiện tại và việc cần làm trong mấy ngày cuối.",
                action={"label": "Xem mục tiêu", "to": "/inbody"}, priority=3)
            break

    # Tin vui
    prs = stats.pr_events(db, uid, t - dt.timedelta(days=6), t)
    if prs:
        names = list(dict.fromkeys(x["exercise_name"] for x in prs))
        text = ", ".join(names[:3]) + (f" và {len(names) - 3} bài khác" if len(names) > 3 else "")
        add("good", f"{len(prs)} kỷ lục mới tuần này", text, action={"label": "Xem PR", "to": "/workouts?tab=history"}, priority=6)

    out.sort(key=lambda x: x["priority"])
    return out[:5]
