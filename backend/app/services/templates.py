"""Chương trình tập có sẵn (giống các app gym: mỗi buổi ~45-60 phút, 4-5 bài, đặt tên theo nhóm cơ).

Mỗi item: exercise_id (trong dataset), sets, reps, rest_sec, duration_sec (cho bài tính giờ).
"""
from __future__ import annotations

from .exercises import get_exercise, public


def _i(ex_id: str, sets: int, reps: int = 0, rest: int = 90, duration: int = 0, note: str = "") -> dict:
    return {"exercise_id": ex_id, "sets": sets, "reps": reps, "rest_sec": rest, "duration_sec": duration, "note": note}


TEMPLATES: list[dict] = [
    {
        "id": "tpl_leg", "name": "Leg Workout", "focus": "legs", "level": "intermediate", "equipment": "gym",
        "description": "Buổi chân toàn diện: đùi trước, đùi sau, mông, bắp chân. Bắt đầu bằng bài compound nặng.",
        "items": [
            _i("0043", 4, 8, 120, note="Bài chính — khởi động 2 set nhẹ trước"),
            _i("0085", 3, 10, 90, note="Giữ lưng thẳng, đẩy hông ra sau"),
            _i("0336", 3, 10, 90, note="10 rep mỗi chân"),
            _i("0586", 3, 12, 60),
            _i("0417", 3, 15, 45),
        ],
    },
    {
        "id": "tpl_chest", "name": "Chest Workout", "focus": "chest", "level": "intermediate", "equipment": "gym",
        "description": "Ngực giữa, ngực trên và tay sau phụ trợ.",
        "items": [
            _i("0025", 4, 8, 120, note="Bài chính — hạ tạ chạm giữa ngực"),
            _i("0314", 3, 10, 90),
            _i("0251", 3, 10, 90, note="Nghiêng người về trước để tập ngực"),
            _i("0308", 3, 12, 60),
            _i("0662", 2, 15, 60, note="Đốt cơ cuối buổi"),
        ],
    },
    {
        "id": "tpl_back", "name": "Back Workout", "focus": "back", "level": "intermediate", "equipment": "gym",
        "description": "Lưng xô, lưng giữa và cầu vai. Kéo bằng khuỷu tay, không bằng bàn tay.",
        "items": [
            _i("0652", 4, 8, 120, note="Dùng máy hỗ trợ nếu chưa kéo được"),
            _i("0027", 4, 8, 120),
            _i("0150", 3, 10, 90),
            _i("0861", 3, 12, 75),
            _i("0406", 3, 12, 60),
        ],
    },
    {
        "id": "tpl_shoulder", "name": "Shoulder Workout", "focus": "shoulders", "level": "intermediate", "equipment": "gym",
        "description": "Vai trước, vai giữa, vai sau cân đối — giúp vai rộng và khoẻ.",
        "items": [
            _i("0405", 4, 10, 90, note="Bài chính"),
            _i("0334", 3, 15, 60, note="Tạ nhẹ, nâng ngang vai"),
            _i("0380", 3, 15, 60),
            _i("0154", 3, 12, 60),
            _i("0095", 3, 12, 60),
        ],
    },
    {
        "id": "tpl_arm", "name": "Arm Workout", "focus": "arms", "level": "beginner", "equipment": "gym",
        "description": "Tay trước + tay sau xen kẽ (superset được) để tiết kiệm thời gian.",
        "items": [
            _i("0031", 3, 10, 75, note="Giữ khuỷu tay sát thân, không đung đưa"),
            _i("0241", 3, 12, 60),
            _i("0313", 3, 12, 60),
            _i("0060", 3, 10, 75),
            _i("0283", 2, 12, 60),
        ],
    },
    {
        "id": "tpl_fullbody_db", "name": "Full Body Workout", "focus": "full", "level": "beginner", "equipment": "home",
        "description": "Toàn thân với tạ đơn — phù hợp người mới, tập 3 buổi/tuần tại nhà hoặc phòng gym.",
        "items": [
            _i("1760", 3, 12, 90),
            _i("0662", 3, 10, 75),
            _i("0293", 3, 12, 75),
            _i("0405", 3, 10, 75),
            _i("0276", 3, 10, 45),
        ],
    },
    {
        "id": "tpl_home_bw", "name": "Home Bodyweight Workout", "focus": "full", "level": "beginner", "equipment": "bodyweight",
        "description": "Không cần dụng cụ. Dành cho người bận rộn tập tại nhà.",
        "items": [
            _i("1460", 3, 12, 60, note="12 bước mỗi chân"),
            _i("3211", 3, 10, 60, note="Chuyển sang push-up thường khi đã dễ"),
            _i("3561", 3, 12, 45),
            _i("1471", 3, 8, 45),
            _i("1399", 3, 12, 45),
        ],
    },
    {
        "id": "tpl_core", "name": "Core & Abs Workout", "focus": "abs", "level": "beginner", "equipment": "bodyweight",
        "description": "Cơ bụng và core giúp ổn định cột sống.",
        "items": [
            _i("0274", 3, 15, 45),
            _i("0276", 3, 10, 45),
            _i("0464", 3, 0, 45, duration=30),
            _i("0620", 3, 12, 45),
            _i("3544", 2, 0, 30, duration=30, note="30 giây mỗi bên"),
        ],
    },
    {
        "id": "tpl_hiit", "name": "HIIT Cardio", "focus": "cardio", "level": "intermediate", "equipment": "bodyweight",
        "description": "Interval cường độ cao: làm 40 giây, nghỉ 20 giây. Đốt calo nhanh.",
        "items": [
            _i("3224", 3, 0, 20, duration=40),
            _i("1160", 3, 0, 20, duration=30),
            _i("0630", 3, 0, 20, duration=40),
            _i("0514", 3, 0, 20, duration=30),
            _i("2612", 3, 0, 30, duration=60),
        ],
    },
    {
        "id": "tpl_recovery", "name": "Recovery & Mobility", "focus": "mobility", "level": "beginner", "equipment": "bodyweight",
        "optional": True,
        "description": "Giãn cơ phục hồi cho ngày điểm sẵn sàng thấp. Tự chọn 1-3 bài là đủ, không bắt buộc tập hết.",
        "items": [
            _i("1604", 2, 0, 15, duration=45),
            _i("1511", 2, 0, 15, duration=45),
            _i("1363", 2, 0, 15, duration=45),
            _i("1271", 2, 0, 15, duration=30),
            _i("1377", 2, 0, 15, duration=30),
        ],
    },
]

_BY_ID = {t["id"]: t for t in TEMPLATES}


def estimate_minutes(items: list[dict]) -> int:
    """Ước tính thời gian thực tế ở phòng tập:
    5 phút khởi động + mỗi bài (10s chuẩn bị + ~2 phút set khởi động/chỉnh tạ) + Σ set × (thời gian làm + nghỉ).
    """
    total = 5 * 60
    for it in items:
        work = it.get("duration_sec") or max(1, it.get("reps") or 10) * 4
        warm = 60 if it.get("duration_sec") else 120
        total += 10 + warm + it.get("sets", 3) * (work + it.get("rest_sec", 60))
    return max(5, round(total / 60))


def hydrate_items(items: list[dict]) -> list[dict]:
    """Gắn thông tin bài tập (tên, ảnh GIF, nhóm cơ) vào từng item."""
    out = []
    for it in items:
        ex = get_exercise(it["exercise_id"])
        if not ex:
            continue
        out.append({**it, "exercise": public(ex, full=False)})
    return out


def template_public(t: dict) -> dict:
    items = hydrate_items(t["items"])
    return {
        **{k: v for k, v in t.items() if k != "items"},
        "items": items,
        "est_minutes": estimate_minutes(t["items"]),
        "source": "template",
        "optional": t.get("optional", False),
    }


def list_templates() -> list[dict]:
    return [template_public(t) for t in TEMPLATES]


def get_template(tid: str) -> dict | None:
    t = _BY_ID.get(tid)
    return template_public(t) if t else None
