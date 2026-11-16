"""Các công thức khoa học dùng chung. Tất cả đều là hàm thuần (dễ test, dễ giải thích).

AI agent KHÔNG tự tính nhẩm — agent gọi tool, tool gọi các hàm ở đây.
"""
from __future__ import annotations

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,  # ít vận động, ngồi văn phòng
    "light": 1.375,  # tập 1-3 buổi/tuần
    "moderate": 1.55,  # tập 3-5 buổi/tuần
    "active": 1.725,  # tập 6-7 buổi/tuần
    "very_active": 1.9,  # vận động viên / lao động nặng
}

GOAL_CALORIE_DELTA = {"muscle": 300, "fat_loss": -450, "maintain": 0, "endurance": 150, "health": 0}
GOAL_PROTEIN_PER_KG = {"muscle": 2.0, "fat_loss": 2.2, "maintain": 1.6, "endurance": 1.6, "health": 1.2}


def bmr_mifflin(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """BMR (năng lượng nghỉ) theo Mifflin-St Jeor."""
    s = -161 if gender == "female" else 5
    return 10 * weight_kg + 6.25 * height_cm - 5 * age + s


def tdee(weight_kg: float, height_cm: float, age: int, gender: str, activity_level: str = "moderate") -> float:
    return bmr_mifflin(weight_kg, height_cm, age, gender) * ACTIVITY_MULTIPLIERS.get(activity_level, 1.55)


def nutrition_targets(
    weight_kg: float, height_cm: float, age: int, gender: str, goal: str, activity_level: str = "moderate"
) -> dict:
    """Mục tiêu calo + macro + nước mỗi ngày.

    - Calo = TDEE ± điều chỉnh theo mục tiêu (tăng cơ +300, giảm mỡ -450).
    - Đạm = g/kg theo mục tiêu (tăng cơ 2.0, giảm mỡ 2.2 để giữ cơ).
    - Béo = 27% tổng calo.  Carb = phần còn lại.
    - Nước = 35 ml/kg.
    """
    t = tdee(weight_kg, height_cm, age, gender, activity_level)
    min_kcal = 1200 if gender == "female" else 1500
    kcal = max(min_kcal, round(t + GOAL_CALORIE_DELTA.get(goal, 0)))
    protein = round(weight_kg * GOAL_PROTEIN_PER_KG.get(goal, 1.6))
    fat = round(kcal * 0.27 / 9)
    carbs = max(50, round((kcal - protein * 4 - fat * 9) / 4))
    return {
        "bmr": round(bmr_mifflin(weight_kg, height_cm, age, gender)),
        "tdee": round(t),
        "calories": kcal,
        "protein": protein,
        "carbs": carbs,
        "fat": fat,
        "water_ml": int(round(weight_kg * 35 / 50) * 50),
    }


def one_rep_max(weight: float, reps: int) -> float:
    """1RM ước tính theo Epley: w × (1 + reps/30)."""
    if reps <= 0 or weight <= 0:
        return 0.0
    if reps == 1:
        return round(weight, 1)
    return round(weight * (1 + reps / 30), 1)


def bmi(weight_kg: float, height_cm: float) -> float:
    h = height_cm / 100
    return round(weight_kg / (h * h), 1) if h > 0 else 0.0


# ---------------------------------------------------------------------------
# Điểm sẵn sàng (Readiness) — minh bạch, giải thích được từng thành phần
# ---------------------------------------------------------------------------
READINESS_WEIGHTS = {
    "sleep_hours": 0.25,
    "sleep_quality": 0.15,
    "fatigue": 0.25,
    "soreness": 0.20,
    "stress": 0.15,
}

READINESS_LABELS = {
    "sleep_hours": "Thời lượng ngủ",
    "sleep_quality": "Chất lượng giấc ngủ",
    "fatigue": "Mức độ mệt mỏi",
    "soreness": "Đau nhức cơ",
    "stress": "Căng thẳng",
}


def _scale_good(v: int) -> float:  # 1 (tệ) → 5 (tốt)
    return (min(5, max(1, v)) - 1) / 4 * 100


def _scale_bad(v: int) -> float:  # 1 (tốt) → 5 (tệ)
    return (5 - min(5, max(1, v))) / 4 * 100


def readiness_score(sleep_hours: float, sleep_quality: int, fatigue: int, soreness: int, stress: int) -> dict:
    """Trả về điểm 0-100 + từng thành phần + khuyến nghị tập luyện."""
    sh = max(0.0, min(100.0, 100 - max(0.0, 7.5 - sleep_hours) * 20 - max(0.0, sleep_hours - 9.5) * 10))
    parts = {
        "sleep_hours": sh,
        "sleep_quality": _scale_good(sleep_quality),
        "fatigue": _scale_bad(fatigue),
        "soreness": _scale_bad(soreness),
        "stress": _scale_bad(stress),
    }
    score = round(sum(parts[k] * w for k, w in READINESS_WEIGHTS.items()))
    weakest = min(parts, key=lambda k: parts[k])
    return {
        "score": score,
        "components": [
            {"key": k, "label": READINESS_LABELS[k], "score": round(v), "weight": READINESS_WEIGHTS[k]}
            for k, v in parts.items()
        ],
        "weakest": weakest,
        **readiness_band(score),
    }


def readiness_band(score: int) -> dict:
    if score >= 80:
        return {
            "band": "high",
            "label": "Sẵn sàng cao",
            "advice": "Cơ thể hồi phục tốt. Có thể tập nặng, thử tăng tạ hoặc phá PR.",
            "intensity": 1.0,
        }
    if score >= 60:
        return {
            "band": "good",
            "label": "Khá tốt",
            "advice": "Tập theo kế hoạch bình thường, giữ đúng kỹ thuật và thời gian nghỉ.",
            "intensity": 0.9,
        }
    if score >= 40:
        return {
            "band": "moderate",
            "label": "Trung bình",
            "advice": "Giảm 20-30% khối lượng (bớt 1 set mỗi bài hoặc giảm tạ), ưu tiên kỹ thuật.",
            "intensity": 0.7,
        }
    return {
        "band": "low",
        "label": "Cần phục hồi",
        "advice": "Nên nghỉ hoặc chỉ tập phục hồi nhẹ (giãn cơ, đi bộ 20-30 phút), ngủ sớm.",
        "intensity": 0.4,
    }


def overload_suggestion(last_sets: list[dict], target_reps: int, is_compound: bool, target_sec: int = 0) -> dict | None:
    """Gợi ý tăng tải lũy tiến dựa trên buổi tập gần nhất của cùng bài.

    - target_reps / target_sec lấy từ chương trình đang tập (không cố định 10 rep).
    - Bài tính giờ (plank...): đạt đủ thời gian → thêm 5 giây; chưa đủ → giữ mức cũ.
    - Bài có tạ: tất cả set đạt đủ rep → tăng tạ (compound +2.5kg, bài đơn +1kg); chưa đạt → giữ tạ, thêm 1 rep.
    - Bài không tạ: thêm 1 rep so với lần tốt nhất.
    """
    if not last_sets:
        return None
    durs = [s.get("duration_sec") or 0 for s in last_sets]
    if target_sec or (max(durs) > 0 and not any(s.get("reps") for s in last_sets)):
        best = max(durs)
        goal = target_sec or best
        if best >= goal:
            nxt = best + 5
            return {"weight_kg": 0, "reps": 0, "duration_sec": nxt,
                    "reason": f"Lần trước giữ được {best} giây → hôm nay thử {nxt} giây."}
        return {"weight_kg": 0, "reps": 0, "duration_sec": goal,
                "reason": f"Lần trước giữ tối đa {best}/{goal} giây → giữ mục tiêu {goal} giây, cố trọn từng set."}
    target_reps = target_reps or 10
    weights = [s.get("weight_kg") or 0 for s in last_sets]
    reps = [s.get("reps") or 0 for s in last_sets]
    top_w = max(weights)
    if top_w <= 0:
        best_reps = max(reps)
        return {
            "weight_kg": 0,
            "reps": best_reps + 1,
            "duration_sec": 0,
            "reason": f"Lần trước tối đa {best_reps} rep. Hôm nay thử {best_reps + 1} rep.",
        }
    hit_all = all(r >= target_reps for r in reps)
    if hit_all:
        inc = 2.5 if is_compound else 1.0
        return {
            "weight_kg": round(top_w + inc, 1),
            "reps": target_reps,
            "duration_sec": 0,
            "reason": f"Lần trước đạt đủ {target_reps} rep ở mức {top_w}kg → tăng lên {round(top_w + inc, 1)}kg.",
        }
    return {
        "weight_kg": top_w,
        "reps": target_reps,
        "duration_sec": 0,
        "reason": f"Lần trước chưa đủ {target_reps} rep ở {top_w}kg → giữ mức tạ, cố thêm 1 rep mỗi set.",
    }
