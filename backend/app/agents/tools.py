"""Bộ công cụ (tools) mà agent được phép gọi qua function-calling.

Mỗi tool khai báo: tên, mô tả, JSON schema tham số, hàm xử lý, và DANH SÁCH AGENT được dùng.
→ CoachBro không thể ghi bữa ăn, NutriBro không thể tạo giáo án... đúng nguyên tắc phân quyền.

Tool có thể:
- trả dữ liệu cho LLM đọc (grounding — chống bịa số liệu),
- gắn "card" để giao diện hiển thị (thẻ bài tập có ảnh, thẻ chương trình tập, nút điều hướng),
- tạo PendingAction (human-in-the-loop) — người dùng bấm Xác nhận thì mới ghi vào DB.
"""
from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BodyMetric, Goal, Memory, PendingAction, Profile, User, WorkoutPlan
from ..services import exercises as exsvc
from ..services import foods as foodsvc
from ..services import formulas, stats
from ..services import insights as insightsvc
from ..services import schedule as schedsvc
from ..services import templates as tplsvc


@dataclass
class ToolContext:
    db: Session
    user: User
    profile: Profile
    agent: str
    conversation_id: str | None = None
    cards: list[dict] = field(default_factory=list)

    def card(self, card: dict) -> None:
        self.cards.append(card)


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: Callable[..., dict]
    agents: tuple[str, ...]

    def spec(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description, "parameters": self.parameters}}


REGISTRY: dict[str, Tool] = {}
ALL = ("headbro", "coachbro", "nutribro")


def tool(name: str, description: str, parameters: dict | None = None, agents: tuple[str, ...] = ALL):
    def deco(fn):
        REGISTRY[name] = Tool(name, description, parameters or {"type": "object", "properties": {}}, fn, agents)
        return fn

    return deco


def tools_for(agent: str) -> list[Tool]:
    return [t for t in REGISTRY.values() if agent in t.agents]


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


def _ex_brief(e: dict) -> dict:
    return {
        "exercise_id": e["id"], "name": e["name"], "name_vi": e.get("name_vi"), "target": e["target"], "equipment": e["equipment"],
        "muscles_vi": [exsvc.MUSCLES[m] for m in e["primary"] + e["secondary"][:2] if m in exsvc.MUSCLES],
        "timed": e["timed"], "camera_ai": bool(e["camera"]),
    }


def _pending(ctx: ToolContext, type_: str, payload: dict, summary: str) -> dict:
    pa = PendingAction(
        user_id=ctx.user.id, conversation_id=ctx.conversation_id, agent=ctx.agent,
        type=type_, payload=payload, summary=summary,
    )
    ctx.db.add(pa)
    ctx.db.commit()
    ctx.card({"kind": "confirm", "action_id": pa.id, "action_type": type_, "summary": summary, "payload": payload, "status": "pending"})
    return {"status": "awaiting_user_confirmation", "action_id": pa.id,
            "message": "Đã tạo thẻ xác nhận. Hãy nói người dùng bấm 'Xác nhận' để lưu."}


# ============================================================================
# Công cụ dùng chung
# ============================================================================


@tool("get_user_profile", "Lấy hồ sơ người dùng: tuổi, giới tính, chiều cao, cân nặng, mục tiêu, trình độ, dụng cụ, chấn thương, mục tiêu calo/macro hằng ngày.")
def get_user_profile(ctx: ToolContext) -> dict:
    return stats.user_snapshot(ctx.db, ctx.user)


@tool("get_today_summary", "Tổng quan hôm nay: điểm sẵn sàng, số buổi tập, calo/đạm đã ăn so với mục tiêu, nước uống, streak.")
def get_today_summary(ctx: ToolContext) -> dict:
    return stats.today_summary(ctx.db, ctx.user)


@tool("get_readiness", "Điểm sẵn sàng (readiness) hôm nay kèm từng thành phần (giấc ngủ, mệt mỏi, đau cơ, căng thẳng) và 7 ngày gần nhất.")
def get_readiness(ctx: ToolContext) -> dict:
    t = stats.today()
    today_log = stats.daily_log(ctx.db, ctx.user.id, t)
    hist = []
    for i in range(1, 8):
        log = stats.daily_log(ctx.db, ctx.user.id, t - dt.timedelta(days=i))
        if log and log.readiness is not None:
            hist.append({"date": log.date.isoformat(), "readiness": log.readiness})
    return {"today": stats.readiness_detail(today_log) or "Hôm nay người dùng chưa check-in.", "last_7_days": hist}


# ============================================================================
# CoachBro — tập luyện
# ============================================================================

_FOCUS_ENUM = list(exsvc.FOCUS.keys())


@tool(
    "search_exercises",
    "Tìm bài tập trong thư viện 1.324 bài (có ảnh GIF). Kết quả sẽ hiện thành thẻ có ảnh cho người dùng bấm xem. "
    "Dùng khi người dùng muốn tập một nhóm cơ hoặc hỏi bài tập cụ thể.",
    _obj({
        "focus": {"type": "string", "enum": _FOCUS_ENUM, "description": "Nhóm: chest, back, shoulders, arms, legs, abs, cardio, mobility"},
        "query": {"type": "string", "description": "Từ khoá tiếng Anh theo tên bài, vd 'squat', 'curl', 'bench press'"},
        "muscle": {"type": "string", "enum": list(exsvc.MUSCLES.keys()), "description": "Một nhóm cơ cụ thể"},
        "limit": {"type": "integer", "description": "Số bài (mặc định 6, tối đa 10)"},
        "respect_equipment": {"type": "boolean", "description": "Lọc theo dụng cụ người dùng có (mặc định true)"},
    }),
    agents=("coachbro",),
)
def search_exercises(ctx: ToolContext, focus=None, query="", muscle=None, limit=6, respect_equipment=True) -> dict:
    limit = max(1, min(int(limit or 6), 10))
    eq = ctx.profile.equipment if respect_equipment else None
    items, total = exsvc.search_exercises(q=query or "", focus=focus, muscle=muscle, profile_equipment=eq, limit=limit)
    if not items and eq:
        items, total = exsvc.search_exercises(q=query or "", focus=focus, muscle=muscle, limit=limit)
    if items:
        ctx.card({"kind": "exercises", "title": exsvc.FOCUS.get(focus, {}).get("label") if focus else None,
                  "focus": focus, "items": [exsvc.public(e, full=False) for e in items]})
    return {"total_matches": total, "exercises": [_ex_brief(e) for e in items]}


@tool(
    "get_exercise_detail",
    "Chi tiết 1 bài tập: các bước thực hiện, cơ chính/phụ, dụng cụ, có hỗ trợ Camera AI không. Hiện thẻ bài tập cho người dùng.",
    _obj({"exercise_id": {"type": "string"}}, ["exercise_id"]),
    agents=("coachbro",),
)
def get_exercise_detail(ctx: ToolContext, exercise_id: str) -> dict:
    e = exsvc.get_exercise(exercise_id)
    if not e:
        return {"error": "Không tìm thấy bài tập này"}
    ctx.card({"kind": "exercises", "items": [exsvc.public(e, full=False)]})
    last = stats.last_performance(ctx.db, ctx.user.id, exercise_id)
    return {**_ex_brief(e), "steps": e["steps"], "last_time": last or "Chưa tập bài này lần nào"}


@tool(
    "get_workout_history",
    "Lịch sử tập luyện N ngày gần nhất: các buổi, bài, số set, khối lượng, điểm form.",
    _obj({"days": {"type": "integer", "description": "Số ngày (mặc định 14)"}}),
    agents=("coachbro", "headbro"),
)
def get_workout_history(ctx: ToolContext, days=14) -> dict:
    days = max(1, min(int(days or 14), 365))
    end = stats.today()
    sessions = stats.completed_sessions(ctx.db, ctx.user.id, end - dt.timedelta(days=days - 1), end)
    out = []
    for s in sessions[-15:]:
        by_ex: dict[str, list] = {}
        for st in s.sets:
            by_ex.setdefault(st.exercise_name, []).append(f"{st.weight_kg:g}kg×{st.reps}" if st.reps else f"{st.duration_sec}s")
        out.append({
            "date": stats.local_date(s.started_at).isoformat(), "name": s.name, "minutes": round(s.duration_sec / 60),
            "volume_kg": round(s.total_volume), "form_score": s.avg_form_score, "exercises": by_ex,
        })
    return {"days": days, "session_count": len(sessions), "sessions": out or "Chưa có buổi tập nào trong khoảng này."}


@tool(
    "get_muscle_volume",
    "Số set hiệu quả của từng nhóm cơ trong N ngày (giống bản đồ nhiệt). Dùng để biết nhóm cơ nào đang tập ít/nhiều.",
    _obj({"days": {"type": "integer", "description": "7, 30, 90 hoặc 365"}}),
    agents=("coachbro", "headbro"),
)
def get_muscle_volume(ctx: ToolContext, days=7) -> dict:
    mv = stats.muscle_volume(ctx.db, ctx.user.id, int(days or 7))
    return {
        "days": mv["days"], "total_sets": mv["total_sets"],
        "sets_per_muscle": {v["label"]: v["sets"] for v in mv["muscles"].values() if v["sets"] > 0} or "Chưa tập nhóm cơ nào",
        "untrained": [exsvc.MUSCLES[m] for m in mv["untrained"]],
        "guideline": "10-20 set/tuần/nhóm cơ là vùng tăng cơ hiệu quả",
    }


@tool("get_personal_records", "Kỷ lục cá nhân (PR) của từng bài: bài có tạ = 1RM ước tính (kg); bài không tạ = số rep; bài giữ (plank) = số giây.",
      agents=("coachbro", "headbro"))
def get_personal_records(ctx: ToolContext) -> dict:
    prs = stats.personal_records(ctx.db, ctx.user.id)[:12]
    return {"records": prs or "Chưa có PR nào (cần hoàn thành ít nhất 1 buổi tập)."}


@tool(
    "get_overload_suggestion",
    "Gợi ý mức tạ/rep (hoặc số giây với bài giữ) hôm nay cho 1 bài dựa trên lần tập gần nhất (tăng tải lũy tiến).",
    _obj({"exercise_id": {"type": "string"}, "target_reps": {"type": "integer"},
          "target_sec": {"type": "integer", "description": "Số giây mục tiêu nếu là bài giữ (plank...)"}}, ["exercise_id"]),
    agents=("coachbro",),
)
def get_overload_suggestion(ctx: ToolContext, exercise_id: str, target_reps=10, target_sec=0) -> dict:
    e = exsvc.get_exercise(exercise_id)
    last = stats.last_performance(ctx.db, ctx.user.id, exercise_id)
    sug = formulas.overload_suggestion(last, int(target_reps or 0), bool(e and e["compound"]), int(target_sec or 0))
    return {"last_time": last or "Chưa tập bài này", "suggestion": sug or "Chưa có dữ liệu — bắt đầu với mức tạ làm được 12 rep thoải mái."}


@tool(
    "list_workout_templates",
    "Danh sách chương trình tập có sẵn (Leg/Chest/Back/Shoulder/Arm/Full Body/Home/Core/HIIT/Recovery).",
    _obj({"focus": {"type": "string", "description": "Lọc theo focus (tuỳ chọn)"}}),
    agents=("coachbro",),
)
def list_workout_templates(ctx: ToolContext, focus=None) -> dict:
    out = []
    for t in tplsvc.list_templates():
        if focus and t["focus"] != focus:
            continue
        out.append({"template_id": t["id"], "name": t["name"], "focus": t["focus"], "equipment": t["equipment"],
                    "minutes": t["est_minutes"], "exercises": [f'{i["exercise"]["name"]} ({i["exercise_id"]})' for i in t["items"]]})
    return {"templates": out}


@tool(
    "suggest_template",
    "Hiện thẻ một chương trình có sẵn để người dùng bấm 'Bắt đầu tập' ngay.",
    _obj({"template_id": {"type": "string"}}, ["template_id"]),
    agents=("coachbro",),
)
def suggest_template(ctx: ToolContext, template_id: str) -> dict:
    t = tplsvc.get_template(template_id)
    if not t:
        return {"error": "Không có template này"}
    ctx.card({"kind": "plan", "plan": t})
    return {"shown": t["name"], "minutes": t["est_minutes"]}


@tool(
    "create_workout_plan",
    "Tạo và lưu một buổi tập cá nhân hoá (4-5 bài, 45-60 phút). Giao diện hiện thẻ có nút 'Bắt đầu tập'. "
    "CHỈ dùng khi người dùng muốn có buổi tập/giáo án. exercise_id phải lấy từ search_exercises/list_workout_templates.",
    _obj({
        "name": {"type": "string", "description": "Tên tiếng Anh theo nhóm cơ, vd 'Arm Workout', 'Leg Workout', 'Push Day'"},
        "focus": {"type": "string", "enum": _FOCUS_ENUM + ["full"]},
        "description": {"type": "string", "description": "1-2 câu tiếng Việt: mục tiêu buổi tập"},
        "items": {
            "type": "array",
            "items": _obj({
                "exercise_id": {"type": "string"},
                "sets": {"type": "integer"},
                "reps": {"type": "integer", "description": "0 nếu là bài tính giờ"},
                "rest_sec": {"type": "integer"},
                "duration_sec": {"type": "integer", "description": "Cho bài tính giờ (plank, cardio), còn lại 0"},
                "note": {"type": "string"},
            }, ["exercise_id", "sets"]),
        },
    }, ["name", "items"]),
    agents=("coachbro",),
)
def create_workout_plan(ctx: ToolContext, name: str, items: list, focus="full", description="") -> dict:
    clean, skipped = [], []
    for it in items[:8]:
        e = exsvc.get_exercise(str(it.get("exercise_id", "")))
        if not e:
            skipped.append(it.get("exercise_id"))
            continue
        timed = e["timed"] and not it.get("reps")
        clean.append({
            "exercise_id": e["id"], "sets": max(1, min(int(it.get("sets") or 3), 8)),
            "reps": 0 if timed else max(1, int(it.get("reps") or 10)),
            "rest_sec": max(10, min(int(it.get("rest_sec") or 90), 300)),
            "duration_sec": int(it.get("duration_sec") or (40 if timed else 0)),
            "note": str(it.get("note") or "")[:200],
        })
    if not clean:
        return {"error": "Không có exercise_id hợp lệ. Hãy gọi search_exercises trước để lấy id."}
    plan = WorkoutPlan(user_id=ctx.user.id, name=name[:120], focus=focus or "full", description=description[:500],
                       items=clean, est_minutes=tplsvc.estimate_minutes(clean), source="ai")
    ctx.db.add(plan)
    ctx.db.commit()
    ctx.card({"kind": "plan", "plan": {
        "id": plan.id, "name": plan.name, "focus": plan.focus, "description": plan.description,
        "est_minutes": plan.est_minutes, "items": tplsvc.hydrate_items(clean), "source": "ai",
    }})
    return {"saved_plan_id": plan.id, "est_minutes": plan.est_minutes, "exercise_count": len(clean), "invalid_ids_skipped": skipped}


@tool(
    "open_workouts",
    "Tạo nút đưa người dùng tới trang Workouts đã lọc sẵn theo nhóm cơ.",
    _obj({"focus": {"type": "string", "enum": _FOCUS_ENUM}}),
    agents=("coachbro",),
)
def open_workouts(ctx: ToolContext, focus=None) -> dict:
    label = exsvc.FOCUS.get(focus, {}).get("label", "tất cả")
    ctx.card({"kind": "buttons", "buttons": [{"label": f"Mở bài tập: {label}", "to": f"/workouts?focus={focus or ''}"}]})
    return {"ok": True}


# ============================================================================
# NutriBro — dinh dưỡng
# ============================================================================


@tool(
    "get_nutrition_day",
    "Các bữa đã ăn trong 1 ngày + tổng calo/đạm/tinh bột/béo so với mục tiêu và phần còn thiếu.",
    _obj({"date": {"type": "string", "description": "YYYY-MM-DD, mặc định hôm nay"}}),
    agents=("nutribro", "headbro", "coachbro"),
)
def get_nutrition_day(ctx: ToolContext, date=None) -> dict:
    try:
        d = dt.date.fromisoformat(date) if date else stats.today()
    except ValueError:
        d = stats.today()
    meals = stats.meals_on(ctx.db, ctx.user.id, d)
    tot = stats.day_nutrition(ctx.db, ctx.user.id, d)
    # cùng mục tiêu với màn hình Dinh dưỡng (đã cộng/trừ theo ngày tập/nghỉ)
    tg = stats.day_targets(ctx.db, ctx.user, d)
    return {
        "date": d.isoformat(),
        "meals": [{"meal_type": m.meal_type, "name": m.name, "kcal": round(m.calories), "protein": m.protein, "carbs": m.carbs, "fat": m.fat} for m in meals]
        or "Chưa ghi bữa ăn nào",
        "totals": tot,
        "targets": tg,
        "remaining": {
            "calories": round(tg["calories"] - tot["calories"]), "protein": round(tg["protein"] - tot["protein"], 1),
            "carbs": round(tg["carbs"] - tot["carbs"], 1), "fat": round(tg["fat"] - tot["fat"], 1),
        },
    }


@tool(
    "get_nutrition_history",
    "Tổng calo và đạm theo từng ngày trong N ngày gần nhất.",
    _obj({"days": {"type": "integer"}}),
    agents=("nutribro", "headbro"),
)
def get_nutrition_history(ctx: ToolContext, days=7) -> dict:
    days = max(1, min(int(days or 7), 60))
    t = stats.today()
    rows = []
    for i in range(days):
        d = t - dt.timedelta(days=i)
        n = stats.day_nutrition(ctx.db, ctx.user.id, d)
        if n["meals_count"]:
            rows.append({"date": d.isoformat(), **n})
    return {"days": days, "logged_days": rows or "Chưa có dữ liệu bữa ăn", "targets": stats.targets(ctx.profile)}


@tool(
    "search_food_library",
    "Tra thư viện món Việt (có ảnh): calo, đạm, tinh bột, béo cho 1 khẩu phần, và mẹo ăn clean. Hiện thẻ món ăn cho người dùng.",
    _obj({
        "query": {"type": "string", "description": "Tên món tiếng Việt, vd 'phở', 'cơm tấm', 'ức gà'"},
        "clean_only": {"type": "boolean", "description": "Chỉ món clean eating"},
        "category": {"type": "string", "enum": list(foodsvc.CATEGORIES.keys())},
        "limit": {"type": "integer"},
    }),
    agents=("nutribro",),
)
def search_food_library(ctx: ToolContext, query="", clean_only=False, category=None, limit=5) -> dict:
    lim = max(1, min(int(limit or 5), 8))
    items = foodsvc.search_foods(query or "", category=category, clean_only=bool(clean_only), limit=lim)
    if not items and category:  # model đoán sai nhóm món → tìm lại trên toàn thư viện
        items = foodsvc.search_foods(query or "", clean_only=bool(clean_only), limit=lim)
    if not items and query and len(query.split()) > 1:  # thử từ khoá chính (vd "ức gà áp chảo" → "ức gà")
        items = foodsvc.search_foods(" ".join(query.split()[:2]), limit=lim)
    if items:
        ctx.card({"kind": "foods", "items": items})
    return {"foods": [{k: f[k] for k in ("id", "name", "serving", "calories", "protein", "carbs", "fat", "clean", "tip")} for f in items]
            or "Không có trong thư viện — hãy tự ước tính và nói rõ là ước tính."}


@tool(
    "calculate_nutrition_targets",
    "Tính BMR, TDEE và mục tiêu calo/macro theo công thức Mifflin-St Jeor.",
    _obj({
        "weight_kg": {"type": "number"}, "height_cm": {"type": "number"}, "age": {"type": "integer"},
        "gender": {"type": "string", "enum": ["male", "female"]},
        "goal": {"type": "string", "enum": list(formulas.GOAL_CALORIE_DELTA.keys())},
        "activity_level": {"type": "string", "enum": list(formulas.ACTIVITY_MULTIPLIERS.keys())},
    }, ["weight_kg", "height_cm", "age", "gender", "goal"]),
    agents=("nutribro", "headbro"),
)
def calculate_nutrition_targets(ctx: ToolContext, weight_kg, height_cm, age, gender, goal, activity_level="moderate") -> dict:
    return formulas.nutrition_targets(float(weight_kg), float(height_cm), int(age), gender, goal, activity_level)


_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]


@tool(
    "propose_meal_log",
    "Đề xuất ghi 1 bữa ăn vào nhật ký. Tạo thẻ để người dùng bấm Xác nhận (human-in-the-loop). Không tự ghi.",
    _obj({
        "name": {"type": "string", "description": "Tên bữa/món, vd 'Phở bò tái'"},
        "meal_type": {"type": "string", "enum": _MEAL_TYPES},
        "calories": {"type": "number"}, "protein": {"type": "number"}, "carbs": {"type": "number"}, "fat": {"type": "number"},
        "items": {"type": "array", "items": _obj({"name": {"type": "string"}, "grams": {"type": "number"}, "calories": {"type": "number"}})},
        "analysis": {"type": "string", "description": "Nhận xét ngắn 2-3 câu về bữa ăn so với mục tiêu (sẽ được lưu cùng bữa ăn)"},
        "date": {"type": "string", "description": "YYYY-MM-DD, mặc định hôm nay"},
    }, ["name", "calories", "protein", "carbs", "fat"]),
    agents=("nutribro",),
)
def propose_meal_log(ctx: ToolContext, name, calories, protein, carbs, fat, meal_type=None, items=None, analysis="", date=None) -> dict:
    if meal_type not in _MEAL_TYPES:
        h = stats.now_local().hour
        meal_type = "breakfast" if h < 10 else "lunch" if h < 14 else "snack" if h < 17 else "dinner"
    payload = {
        "name": str(name)[:200], "meal_type": meal_type, "calories": round(float(calories)), "protein": round(float(protein), 1),
        "carbs": round(float(carbs), 1), "fat": round(float(fat), 1), "items": items or [], "analysis": analysis or "",
        "date": date or stats.today().isoformat(),
    }
    summary = f"Ghi bữa ăn: {payload['name']} — {payload['calories']} kcal · {payload['protein']}g đạm · {payload['carbs']}g tinh bột · {payload['fat']}g béo"
    return _pending(ctx, "log_meal", payload, summary)


# ============================================================================
# HeadBro — tổng quan, cơ thể, mục tiêu
# ============================================================================


@tool(
    "get_progress_report",
    "Báo cáo tiến độ theo kỳ (week/month/quarter/year): số buổi, khối lượng, PR, calo TB, thay đổi cân nặng, điểm sẵn sàng TB.",
    _obj({"period": {"type": "string", "enum": ["week", "month", "quarter", "year"]}}),
    agents=("headbro", "coachbro"),
)
def get_progress_report(ctx: ToolContext, period="week") -> dict:
    r = stats.period_report(ctx.db, ctx.user.id, period or "week")
    return {"period": r["period"], "from": r["start"], "to": r["end"], "summary": r["summary"], "new_prs": r["prs"][:8]}


@tool(
    "get_body_metrics",
    "Lịch sử chỉ số cơ thể (cân nặng, % mỡ, cơ xương, mỡ nội tạng, vòng eo...) mới nhất trước.",
    _obj({"limit": {"type": "integer"}}),
    agents=("headbro", "nutribro", "coachbro"),
)
def get_body_metrics(ctx: ToolContext, limit=8) -> dict:
    rows = ctx.db.scalars(
        select(BodyMetric).where(BodyMetric.user_id == ctx.user.id).order_by(BodyMetric.date.desc()).limit(max(1, min(int(limit or 8), 30)))
    )
    keys = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "body_fat_kg", "visceral_fat", "bmr_kcal", "waist_cm", "hip_cm"]
    out = [{"date": m.date.isoformat(), **{k: getattr(m, k) for k in keys if getattr(m, k) is not None}} for m in rows]
    return {"measurements": out or "Chưa có lần đo nào. Gợi ý người dùng nhập ở trang InBody.", "height_cm": ctx.profile.height_cm}


@tool("get_goals", "Các mục tiêu hiện tại của người dùng và tiến độ.", agents=("headbro", "coachbro", "nutribro"))
def get_goals(ctx: ToolContext) -> dict:
    goals = ctx.db.scalars(select(Goal).where(Goal.user_id == ctx.user.id, Goal.status == "active"))
    return {"goals": [
        {"title": g.title, "metric": g.metric, "start": g.start_value, "target": g.target_value,
         "deadline": g.deadline.isoformat() if g.deadline else None, "plan": g.plan}
        for g in goals
    ] or "Chưa có mục tiêu nào"}


_METRICS = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "waist_cm", "workouts_per_week", "custom"]


@tool(
    "propose_goal",
    "Đề xuất lưu 1 mục tiêu cụ thể, đo lường được. Tạo thẻ để người dùng bấm Xác nhận. Chỉ gọi khi đã hỏi đủ thông tin.",
    _obj({
        "title": {"type": "string", "description": "Vd 'Giảm còn 68kg', 'Đạt 15% mỡ'"},
        "metric": {"type": "string", "enum": _METRICS},
        "start_value": {"type": "number"},
        "target_value": {"type": "number"},
        "deadline": {"type": "string", "description": "YYYY-MM-DD"},
        "plan": {"type": "string", "description": "3 hành động chính, mỗi dòng bắt đầu bằng '- '"},
    }, ["title", "metric", "target_value"]),
    agents=("headbro",),
)
def propose_goal(ctx: ToolContext, title, metric, target_value, start_value=None, deadline=None, plan="") -> dict:
    # Guardrail ở mức công cụ: mục tiêu cân nặng giảm quá nhanh → không tạo thẻ, yêu cầu agent đề xuất thời hạn an toàn
    if metric == "weight_kg" and deadline:
        try:
            start = float(start_value if start_value is not None else (ctx.profile.weight_kg or 0))
            weeks = max((dt.date.fromisoformat(str(deadline)) - stats.today()).days / 7, 0.5)
            per_week = (start - float(target_value)) / weeks
            if start and per_week > max(1.0, start * 0.01) * 1.25:
                safe_weeks = (start - float(target_value)) / max(start * 0.0075, 0.5)
                return {"error": f"Mục tiêu giảm ~{per_week:.1f} kg/tuần là quá nhanh (an toàn 0,5-1% cân nặng/tuần). "
                                 f"Hãy đề xuất thời hạn khoảng {round(safe_weeks)} tuần hoặc mục tiêu nhỏ hơn rồi gọi lại."}
        except (TypeError, ValueError):
            pass
    payload = {"title": str(title)[:200], "metric": metric if metric in _METRICS else "custom", "start_value": start_value,
               "target_value": target_value, "deadline": deadline, "plan": plan or ""}
    dl = f" trước {deadline}" if deadline else ""
    return _pending(ctx, "save_goal", payload, f"Lưu mục tiêu: {payload['title']}{dl}")


@tool(
    "propose_body_metric",
    "Đề xuất lưu 1 lần đo cơ thể (khi người dùng báo cân nặng/chỉ số mới). Tạo thẻ Xác nhận.",
    _obj({
        "weight_kg": {"type": "number"}, "body_fat_pct": {"type": "number"}, "skeletal_muscle_kg": {"type": "number"},
        "visceral_fat": {"type": "number"}, "waist_cm": {"type": "number"},
        "date": {"type": "string", "description": "YYYY-MM-DD, mặc định hôm nay"},
    }),
    agents=("headbro",),
)
def propose_body_metric(ctx: ToolContext, date=None, **values) -> dict:
    vals = {k: float(v) for k, v in values.items() if v is not None and k in {"weight_kg", "body_fat_pct", "skeletal_muscle_kg", "visceral_fat", "waist_cm"}}
    if not vals:
        return {"error": "Cần ít nhất 1 chỉ số"}
    label = {"weight_kg": "Cân nặng {}kg", "body_fat_pct": "Mỡ {}%", "skeletal_muscle_kg": "Cơ xương {}kg", "visceral_fat": "Mỡ nội tạng {}", "waist_cm": "Eo {}cm"}
    summary = "Lưu chỉ số cơ thể: " + ", ".join(label[k].format(f"{v:g}") for k, v in vals.items())
    return _pending(ctx, "log_body_metric", {**vals, "date": date or stats.today().isoformat()}, summary)


@tool(
    "get_streak_and_badges",
    "Chuỗi ngày hoạt động liên tiếp và huy hiệu đã đạt.",
    agents=("headbro",),
)
def get_streak_and_badges(ctx: ToolContext) -> dict:
    b = stats.badges(ctx.db, ctx.user.id, ctx.profile)
    return {"streak": stats.streak(ctx.db, ctx.user.id), "achieved": [x["label"] for x in b if x["achieved"]],
            "next": [f'{x["label"]} ({x["progress"]}/{x["goal"]})' for x in b if not x["achieved"]][:4]}


_PAGES = {"dashboard": "/", "chat": "/chat", "workouts": "/workouts", "daily": "/daily", "nutrition": "/nutrition",
          "inbody": "/inbody", "guide": "/guide", "settings": "/settings"}


@tool(
    "navigate",
    "Tạo nút đưa người dùng tới 1 trang trong app.",
    _obj({"page": {"type": "string", "enum": list(_PAGES.keys())}, "label": {"type": "string"}}, ["page"]),
)
def navigate(ctx: ToolContext, page: str, label=None) -> dict:
    names = {"dashboard": "Dashboard", "chat": "Trợ lý AI", "workouts": "Workouts", "daily": "Daily Check-in", "nutrition": "Nutrition",
             "inbody": "InBody & Mục tiêu", "guide": "Hướng dẫn", "settings": "Cài đặt"}
    ctx.card({"kind": "buttons", "buttons": [{"label": label or f"Mở {names.get(page, page)}", "to": _PAGES.get(page, "/")}]})
    return {"ok": True}


# ============================================================================
# Trí nhớ dài hạn, lịch tuần, thực đơn, nhắc nhở chủ động
# ============================================================================

_MEM_CATS = ["preference", "health", "schedule", "food", "goal", "other"]


@tool(
    "remember",
    "Ghi nhớ lâu dài 1 thông tin BỀN VỮNG người dùng kể về bản thân để lần sau không phải hỏi lại "
    "(vd: dị ứng hải sản, không ăn thịt bò, hay tập lúc 6h sáng, từng đau vai trái, thích tập ở nhà, ngân sách ăn uống thấp). "
    "KHÔNG dùng cho số liệu đã có trong dữ liệu (cân nặng, bữa ăn, buổi tập) hay chuyện chỉ đúng hôm nay.",
    _obj({
        "content": {"type": "string", "description": "1 câu ngắn ở ngôi thứ ba, vd 'Dị ứng hải sản'"},
        "category": {"type": "string", "enum": _MEM_CATS},
    }, ["content"]),
)
def remember(ctx: ToolContext, content: str, category="other") -> dict:
    from . import guard  # import muộn tránh vòng

    content = str(content).strip()[:300]
    if not content:
        return {"error": "Nội dung trống"}
    if guard.looks_like_injection(content):  # chặn "đầu độc trí nhớ" (memory poisoning)
        return {"error": "Không lưu: nội dung giống câu lệnh điều khiển AI, không phải thông tin về người dùng."}
    existing = list(ctx.db.scalars(select(Memory).where(Memory.user_id == ctx.user.id)))
    if any(m.content.lower() == content.lower() for m in existing):
        return {"ok": True, "note": "Đã nhớ từ trước"}
    if len(existing) >= 50:  # giới hạn: xoá ký ức cũ nhất
        ctx.db.delete(min(existing, key=lambda m: m.created_at))
    m = Memory(user_id=ctx.user.id, content=content, category=category if category in _MEM_CATS else "other", source=ctx.agent)
    ctx.db.add(m)
    ctx.db.commit()
    ctx.card({"kind": "memory", "content": content, "memory_id": m.id})
    return {"ok": True, "remembered": content}


@tool("get_weekly_schedule", "Lịch tập theo tuần hiện tại (Thứ 2 → CN) và buổi tập của hôm nay.", agents=("coachbro", "headbro"))
def get_weekly_schedule(ctx: ToolContext) -> dict:
    s = schedsvc.schedule_out(ctx.db, ctx.user.id)
    return {"days": [{"day": d["label"], "workout": d["plan"]["name"] if d["plan"] else "Nghỉ"} for d in s["days"]],
            "today": s["today"]["label"], "has_schedule": s["has_schedule"]}


@tool(
    "propose_weekly_schedule",
    "Đề xuất lịch tập cả tuần: gắn chương trình cho từng thứ, ngày không gắn là nghỉ. plan_id là template_id "
    "(từ list_workout_templates) hoặc saved_plan_id (từ create_workout_plan). Tạo thẻ để người dùng Xác nhận. "
    "Số ngày tập nên bằng số buổi/tuần trong hồ sơ, xen ngày nghỉ, không tập cùng nhóm cơ 2 ngày liền.",
    _obj({
        "days": {"type": "array", "items": _obj({
            "weekday": {"type": "integer", "description": "0=Thứ 2 ... 6=Chủ nhật"},
            "plan_id": {"type": "string"},
            "note": {"type": "string"},
        }, ["weekday", "plan_id"])},
        "note": {"type": "string", "description": "1-2 câu giải thích cách chia lịch"},
    }, ["days"]),
    agents=("coachbro",),
)
def propose_weekly_schedule(ctx: ToolContext, days: list, note="") -> dict:
    payload_days, names, bad = {}, {}, []
    for d in days or []:
        try:
            wd = int(d.get("weekday"))
        except (TypeError, ValueError):
            continue
        plan = schedsvc.plan_summary(ctx.db, ctx.user.id, d.get("plan_id"))
        if not (0 <= wd <= 6) or not plan:
            bad.append(d.get("plan_id"))
            continue
        payload_days[str(wd)] = {"plan_id": plan["id"], "note": str(d.get("note") or "")}
        names[str(wd)] = plan["name"]
    if not payload_days:
        return {"error": "Không có plan_id hợp lệ. Dùng template_id từ list_workout_templates hoặc id từ create_workout_plan."}
    order = sorted(payload_days, key=int)
    summary = "Lưu lịch tập tuần: " + "; ".join(f"{schedsvc.DAY_NAMES[int(k)]} – {names[k]}" for k in order)
    r = _pending(ctx, "save_schedule", {"days": payload_days, "note": note, "names": names}, summary)
    r["invalid_plan_ids"] = bad
    return r


@tool(
    "create_meal_plan",
    "Tạo thực đơn (1 ngày hoặc các bữa còn lại) từ thư viện món Việt — hiện thẻ có ảnh, tổng calo/macro so với mục tiêu "
    "và nút 'Ghi vào nhật ký'. Ưu tiên food_id từ search_food_library; món ngoài thư viện dùng custom kèm số liệu ước tính.",
    _obj({
        "title": {"type": "string", "description": "Vd 'Thực đơn tăng cơ 2.400 kcal'"},
        "meals": {"type": "array", "items": _obj({
            "meal_type": {"type": "string", "enum": _MEAL_TYPES},
            "food_id": {"type": "string", "description": "id món trong thư viện"},
            "servings": {"type": "number", "description": "Số khẩu phần (mặc định 1)"},
            "custom": _obj({"name": {"type": "string"}, "calories": {"type": "number"}, "protein": {"type": "number"},
                            "carbs": {"type": "number"}, "fat": {"type": "number"}}),
        }, ["meal_type"])},
    }, ["title", "meals"]),
    agents=("nutribro",),
)
def create_meal_plan(ctx: ToolContext, title: str, meals: list) -> dict:
    items, skipped = [], []
    for m in (meals or [])[:15]:
        mt = m.get("meal_type") if m.get("meal_type") in _MEAL_TYPES else "snack"
        sv = max(0.25, min(float(m.get("servings") or 1), 5))
        f = foodsvc.get_food(str(m.get("food_id") or ""))
        if f:
            items.append({"meal_type": mt, "servings": sv, "food_id": f["id"], "name": f["name"], "image": f["image"], "emoji": f["emoji"],
                          "serving": f["serving"], "grams": f["grams"],
                          **{k: round(f[k] * sv, 1) for k in ("calories", "protein", "carbs", "fat")}})
        elif isinstance(m.get("custom"), dict) and m["custom"].get("name"):
            c = m["custom"]
            items.append({"meal_type": mt, "servings": 1, "food_id": None, "name": str(c["name"])[:120], "image": None, "emoji": "🍽️",
                          "serving": "1 phần", "grams": 0, **{k: round(float(c.get(k) or 0), 1) for k in ("calories", "protein", "carbs", "fat")}})
        else:
            skipped.append(m.get("food_id"))
    if not items:
        return {"error": "Không có món hợp lệ — gọi search_food_library để lấy food_id."}
    tot = {k: round(sum(i[k] for i in items), 1) for k in ("calories", "protein", "carbs", "fat")}
    ctx.card({"kind": "mealplan", "title": str(title)[:120], "items": items, "totals": tot, "targets": stats.targets(ctx.profile)})
    return {"shown": True, "totals": tot, "targets": stats.targets(ctx.profile), "invalid_food_ids": skipped}


@tool(
    "get_insights",
    "Các vấn đề HeadBro tự phát hiện từ dữ liệu (thiếu đạm, tập thiếu buổi, bỏ quên nhóm cơ, cân nặng ngược mục tiêu, streak sắp mất...).",
    agents=("headbro",),
)
def get_insights(ctx: ToolContext) -> dict:
    items = insightsvc.build(ctx.db, ctx.user)
    return {"insights": [{"title": i["title"], "detail": i["text"], "level": i["level"]} for i in items] or "Không có vấn đề nào nổi bật."}


@tool(
    "search_knowledge",
    "Tra KHO KIẾN THỨC có nguồn khoa học (WHO, ACSM, NSCA, ISSN, Viện Dinh dưỡng...): kỹ thuật động tác, số set/rep, "
    "tăng tải, cardio, ngủ & phục hồi, protein, calo, món Việt, thực phẩm bổ sung, chấn thương thường gặp, tập khi có bệnh/mang thai. "
    "Dùng trước khi trả lời câu hỏi kiến thức; trích nguồn bằng [số] theo thứ tự kết quả.",
    _obj({"query": {"type": "string", "description": "Câu hỏi hoặc từ khoá tiếng Việt, vd 'creatine liều dùng', 'đau gối khi squat'"},
          "limit": {"type": "integer", "description": "Số đoạn, mặc định 3"}}, ["query"]),
)
def search_knowledge(ctx: ToolContext, query: str, limit=3) -> dict:
    from ..services import knowledge
    from . import tracing

    lim = max(1, min(int(limit or 3), 5))
    with tracing.span("rag", "search_knowledge", query=str(query)[:120]) as sp:
        r = knowledge.search(str(query), limit=lim)
        if sp is not None:
            sp.update(method=r["method"], hits=[x["id"] for x in r["results"]])
    tr = tracing.current()
    if tr:
        tr.rag.append({"query": str(query)[:200], "method": r["method"], "hits": [x["id"] for x in r["results"]]})
    if not r["results"]:
        return {"results": [], "note": "Không có đoạn kiến thức phù hợp — trả lời thận trọng theo hiểu biết chung, không ghi nguồn."}
    # đánh số tiếp nối các nguồn đã hiện trong cùng câu trả lời
    prev = sum(len(c["items"]) for c in ctx.cards if c.get("kind") == "sources")
    items = [{"ref": prev + i + 1, "id": x["id"], "title": x["title"], "source": x["source"]} for i, x in enumerate(r["results"])]
    ctx.card({"kind": "sources", "items": items})
    return {"method": r["method"], "results": [{"ref": it["ref"], "title": x["title"], "source": x["source"], "text": x["text"]}
                                               for it, x in zip(items, r["results"])]}


def run_tool(ctx: ToolContext, name: str, args: dict) -> dict:
    t = REGISTRY.get(name)
    if not t or ctx.agent not in t.agents:
        return {"error": f"Agent {ctx.agent} không có quyền dùng công cụ {name}"}
    try:
        return t.handler(ctx, **(args or {}))
    except TypeError as e:
        return {"error": f"Tham số không hợp lệ: {e}"}
    except Exception as e:  # không để lỗi tool làm sập cả cuộc trò chuyện
        ctx.db.rollback()
        return {"error": f"Lỗi khi chạy công cụ: {e}"}


def summarize_result(name: str, result: dict) -> str:
    """Mô tả ngắn kết quả tool để hiển thị trong 'trace' cho người dùng thấy agent đã làm gì."""
    if "error" in result:
        return f"Lỗi: {result['error']}"
    if name == "search_exercises":
        return f"Tìm thấy {result.get('total_matches', 0)} bài, hiển thị {len(result.get('exercises', []))}"
    if name == "create_workout_plan":
        return f"Đã lưu buổi tập ({result.get('exercise_count')} bài, ~{result.get('est_minutes')} phút)"
    if name.startswith("propose_"):
        return "Đã tạo thẻ chờ xác nhận"
    if name == "remember":
        return "Đã ghi nhớ" if result.get("ok") else "Không ghi nhớ"
    if name == "create_meal_plan":
        t = result.get("totals", {})
        return f"Thực đơn {t.get('calories', 0):g} kcal"
    if name == "search_food_library":
        f = result.get("foods")
        return f"{len(f)} món phù hợp" if isinstance(f, list) else "Không có trong thư viện"
    if name == "search_knowledge":
        n = len(result.get("results") or [])
        return f"{n} đoạn kiến thức ({result.get('method', 'bm25')})" if n else "Không có đoạn phù hợp"
    return "Đã lấy dữ liệu"


def preload_context(ctx: ToolContext) -> dict:
    """Dùng khi API không hỗ trợ function-calling: nạp sẵn dữ liệu chính vào prompt."""
    base = {"today": stats.today_summary(ctx.db, ctx.user)}
    if ctx.agent == "coachbro":
        base["muscle_volume_7d"] = get_muscle_volume(ctx, 7)
        base["recent_workouts"] = get_workout_history(ctx, 14)
        base["weekly_schedule"] = get_weekly_schedule(ctx)
    elif ctx.agent == "nutribro":
        base["nutrition_today"] = get_nutrition_day(ctx)
    else:
        base["report_week"] = get_progress_report(ctx, "week")
        base["body_metrics"] = get_body_metrics(ctx, 5)
        base["goals"] = get_goals(ctx)
        base["insights"] = get_insights(ctx)
    return base


# ============================================================================
# Thực thi PendingAction sau khi người dùng xác nhận
# ============================================================================


def execute_action(db: Session, user: User, pa: PendingAction, overrides: dict | None = None) -> dict:
    from ..models import Meal  # tránh import vòng

    p = {**pa.payload, **(overrides or {})}
    if pa.type == "log_meal":
        d = dt.date.fromisoformat(p.get("date") or stats.today().isoformat())
        m = Meal(user_id=user.id, date=d, meal_type=p.get("meal_type", "snack"), name=p["name"], items=p.get("items") or [],
                 calories=p["calories"], protein=p["protein"], carbs=p["carbs"], fat=p["fat"],
                 analysis=p.get("analysis", ""), image=p.get("image"), source="chat")
        db.add(m)
        db.commit()
        return {"meal_id": m.id}
    if pa.type == "save_goal":
        dl = None
        if p.get("deadline"):
            try:
                dl = dt.date.fromisoformat(p["deadline"])
            except ValueError:
                dl = None
        g = Goal(user_id=user.id, title=p["title"], metric=p.get("metric", "custom"), start_value=p.get("start_value"),
                 target_value=p.get("target_value"), deadline=dl, plan=p.get("plan", ""), source="ai")
        db.add(g)
        db.commit()
        return {"goal_id": g.id}
    if pa.type == "log_body_metric":
        d = dt.date.fromisoformat(p.get("date") or stats.today().isoformat())
        vals = {k: p.get(k) for k in ("weight_kg", "body_fat_pct", "skeletal_muscle_kg", "visceral_fat", "waist_cm")}
        bm = BodyMetric(user_id=user.id, date=d, source="chat", **vals)
        db.add(bm)
        prof = stats.get_profile(db, user)
        if vals.get("weight_kg"):
            prof.weight_kg = vals["weight_kg"]
            stats.recompute_targets(prof)
        db.commit()
        return {"metric_id": bm.id}
    if pa.type == "save_schedule":
        schedsvc.save_schedule(db, user.id, p.get("days") or {}, p.get("note") or "", source="ai")
        return {"ok": True}
    raise ValueError(f"Loại hành động không hỗ trợ: {pa.type}")
