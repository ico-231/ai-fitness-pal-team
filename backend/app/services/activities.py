"""Hoạt động ngoài gym ("Hoạt động khác", M8).

MỘT nguồn tính calo cho mọi nơi: API ước tính, lưu, sửa, xác nhận qua chat, dữ liệu demo (đều gọi estimate()).
Không tin số calo từ client hay từ AI: server luôn tính lại từ hoạt động + thời lượng + cường độ + cân nặng.
"""
from __future__ import annotations

import datetime as dt
import json
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import DATA_DIR
from ..models import Activity, User
from . import formulas, stats
from .exercises import _norm

INTENSITIES = ("light", "moderate", "vigorous")
INTENSITY_VI = {"light": "Nhẹ", "moderate": "Trung bình", "vigorous": "Mạnh"}
TALK_TEST = {"light": "Vẫn hát được", "moderate": "Nói được, không hát được", "vigorous": "Chỉ nói được vài từ"}
MAX_MINUTES = 600  # > 10 giờ: chắc chắn nhập nhầm
CONFIRM_MINUTES = 240  # > 4 giờ: hỏi lại
CONFIRM_KCAL = 1500
MAX_DAYS_BACK = 7
WHO_TARGET = (150, 300)  # phút/tuần (vừa; mạnh tính ×2)
WHO_STRENGTH_DAYS = 2
# Tốc độ hợp lý (km/h): vượt "confirm" thì hỏi lại, vượt "max" thì từ chối
SPEED_LIMITS = {"di_bo": (8, 12), "chay_bo": (22, 30), "chay_may": (22, 30), "dap_xe": (45, 70), "boi": (5, 8)}


class ActivityError(ValueError):
    """Dữ liệu sai — trả 400 kèm câu tiếng Việt."""


class NeedsConfirm(ValueError):
    """Số liệu bất thường (quá dài / quá nhiều calo / tốc độ lạ) → hỏi người dùng có chắc không."""

    def __init__(self, warnings: list[str]):
        super().__init__(" ".join(warnings))
        self.warnings = warnings


class Duplicate(ValueError):
    def __init__(self, existing: Activity):
        super().__init__("Có vẻ bạn đã ghi hoạt động này rồi")
        self.existing = existing


# --------------------------------------------------------------------------- danh mục
@lru_cache
def catalog() -> dict:
    data = json.loads((DATA_DIR / "activities.json").read_text(encoding="utf-8"))
    for a in data["items"]:
        a["_search"] = _norm(" ".join([a["name"], a["category_vi"], *a["aliases"]]))
    return data


def public(a: dict) -> dict:
    return {k: v for k, v in a.items() if not k.startswith("_")}


def get(code: str) -> dict | None:
    return next((a for a in catalog()["items"] if a["id"] == code), None)


def search(q: str, limit: int = 8) -> list[dict]:
    """Tìm theo tên + từ đồng nghĩa ("đá banh" → Bóng đá, "bike" → Đạp xe). Mỗi từ gõ phải là đầu một từ."""
    words = _norm(q).split()
    if not words:
        return [public(a) for a in catalog()["items"] if a["popular"]][:limit]
    out = []
    for i, a in enumerate(catalog()["items"]):
        tokens = a["_search"].replace("(", " ").replace(")", " ").replace("/", " ").replace(",", " ").split()
        if all(any(t.startswith(w) for t in tokens) for w in words):
            exact = _norm(a["name"]).startswith(" ".join(words)) or any(_norm(x) == " ".join(words) for x in a["aliases"])
            out.append((0 if exact else 1, i, a))
    out.sort(key=lambda x: (x[0], x[1]))
    return [public(a) for _, _, a in out[:limit]]


# --------------------------------------------------------------------------- hồ sơ năng lượng
def energy_settings(p) -> dict:
    st = p.settings or {}
    lifestyle = st.get("lifestyle") if st.get("lifestyle") in formulas.LIFESTYLE_FACTORS else "sitting"
    eat_back = st.get("eat_back", 0.5)
    try:
        eat_back = min(1.0, max(0.0, float(eat_back)))
    except (TypeError, ValueError):
        eat_back = 0.5
    return {"mode": "tracked" if st.get("energy_mode") == "tracked" else "average", "eat_back": eat_back, "lifestyle": lifestyle,
            "lifestyle_factor": formulas.LIFESTYLE_FACTORS[lifestyle], "lifestyle_label": formulas.LIFESTYLE_LABELS[lifestyle]}


def body_info(db: Session, user: User) -> dict:
    p = stats.get_profile(db, user)
    w = stats.latest_weight(db, p)
    bmr = formulas.bmr_mifflin(w, p.height_cm, p.age, p.gender) if (w and p.height_cm and p.age and p.gender) else None
    return {"weight_kg": w, "bmr": bmr, "age": p.age, "gender": p.gender, **energy_settings(p)}


# --------------------------------------------------------------------------- tính calo
def estimate(db: Session, user: User, code: str, minutes: float | None = None, intensity: str | None = None,
             distance_km: float | None = None, steps: int | None = None, avg_hr: int | None = None,
             body: dict | None = None) -> dict:
    a = get(code)
    if not a:
        raise ActivityError("Không tìm thấy hoạt động này")
    b = body or body_info(db, user)
    w = b["weight_kg"]
    if not w:
        raise ActivityError("Cần cân nặng để tính calo — cập nhật ở Hồ sơ hoặc trang Cơ thể")
    intensity = intensity if intensity in INTENSITIES else "moderate"
    warnings: list[str] = []
    notes: list[str] = []
    speed = None
    formula_name = None

    if a["steps"]:
        steps = int(steps or 0)
        if steps <= 0:
            raise ActivityError("Nhập số bước")
        if steps > 80000:
            raise ActivityError("Số bước quá lớn — kiểm tra lại")
        base = formulas.STEP_BASELINE[b["lifestyle"]]
        credited = max(0, steps - base)
        minutes = credited / formulas.STEPS_PER_MIN
        met = a["met"]["moderate"]
        intensity = "moderate"
        formula_name = "steps"
        notes.append(f"Chỉ tính phần vượt {base:,} bước/ngày — mức đi lại thường ngày đã nằm trong mục tiêu calo.".replace(",", "."))
        if steps > 40000:
            warnings.append(f"{steps:,} bước là rất nhiều (≈ {steps * 0.75 / 1000:.0f} km).".replace(",", "."))
    else:
        if not minutes or minutes <= 0:
            raise ActivityError("Nhập thời gian (phút)")
        if minutes > MAX_MINUTES:
            raise ActivityError("Thời gian quá dài (tối đa 10 giờ cho một hoạt động)")
        if minutes > CONFIRM_MINUTES:
            warnings.append(f"{round(minutes)} phút là khá dài cho một lần {a['name'].lower()}.")
        met = a["met"][intensity]
        if distance_km and a["speed_mets"]:
            if distance_km <= 0 or distance_km > 300:
                raise ActivityError("Quãng đường không hợp lệ")
            speed = distance_km / (minutes / 60)
            lim = SPEED_LIMITS.get(code)
            if lim and speed > lim[1]:
                raise ActivityError(f"Tốc độ {speed:.1f} km/h không hợp lý cho {a['name'].lower()} — kiểm tra lại quãng đường / thời gian")
            if lim and speed > lim[0]:
                warnings.append(f"Tốc độ {speed:.1f} km/h khá cao cho {a['name'].lower()}.")
            met = formulas.met_from_speed(a["speed_mets"], speed)
            intensity = formulas.who_intensity(met)
            notes.append(f"Tự tính theo tốc độ {speed:.1f} km/h.".replace(".", ",", 1))

    if minutes and minutes > 0:
        e = formulas.activity_energy(met, w, minutes, b["bmr"])
    else:
        e = {"kcal_gross": 0, "kcal_net": 0, "formula": "steps"}
    if avg_hr and not a["steps"]:
        if 90 <= avg_hr <= 200 and b["age"] and b["gender"] in ("male", "female"):
            gross = formulas.keytel_kcal(avg_hr, w, b["age"], b["gender"], minutes)
            rest = (b["bmr"] / 24 * minutes / 60) if b["bmr"] else w * minutes / 60
            e = {"kcal_gross": round(gross), "kcal_net": max(0, round(gross - rest)), "formula": "hr_keytel"}
            notes.append("Tính theo nhịp tim trung bình (công thức Keytel).")
        else:
            notes.append("Nhịp tim ngoài khoảng 90–200 hoặc thiếu tuổi/giới tính → tính theo MET.")
    if formula_name:
        e["formula"] = formula_name
    if e["kcal_gross"] > CONFIRM_KCAL:
        warnings.append(f"≈ {e['kcal_gross']:,} kcal là rất nhiều cho một hoạt động.".replace(",", "."))
    if b["age"] and b["age"] >= 60:
        # MET bảng người lớn đo trên người 19–59 tuổi; người lớn tuổi có mức nghỉ thấp hơn (2,7 thay vì 3,5 ml/kg/phút)
        notes.append("Từ 60 tuổi, ước tính này có thể cao hơn thực tế khoảng 20–30%.")
    # mức người dùng chọn (talk test) quyết định phút WHO; tính theo tốc độ / bước thì phân loại theo MET
    chosen = None if (speed or a["steps"]) else intensity
    who = formulas.who_minutes(minutes or 0, met, chosen)
    return {
        "activity_code": code, "name": a["name"], "category": a["category"], "icon": a["icon"],
        "intensity": intensity, "intensity_vi": INTENSITY_VI[intensity],
        "who_class": "light" if met < 3 else (chosen or formulas.who_intensity(met)),
        "minutes": round(minutes or 0, 1), "distance_km": distance_km if a["speed_mets"] else None,
        "steps": steps if a["steps"] else None, "avg_hr": avg_hr if e["formula"] == "hr_keytel" else None,
        "speed_kmh": round(speed, 1) if speed else None, "met": met, "weight_kg": w,
        "kcal_gross": e["kcal_gross"], "kcal_net": e["kcal_net"], "who_minutes": round(who, 1), "formula": e["formula"],
        "compendium": a["compendium"], "warnings": warnings, "notes": notes,
    }


# --------------------------------------------------------------------------- lưu / sửa
def _check_date(d: dt.date) -> dt.date:
    today = stats.today()
    if d > today:
        raise ActivityError("Không ghi hoạt động cho ngày tương lai")
    if d < today - dt.timedelta(days=MAX_DAYS_BACK):
        raise ActivityError(f"Chỉ ghi lùi tối đa {MAX_DAYS_BACK} ngày")
    return d


def find_duplicate(db: Session, uid: str, day: dt.date, code: str, minutes: float, exclude: str | None = None) -> Activity | None:
    """Cùng ngày, cùng hoạt động, thời lượng lệch ≤ 20% → nghi ghi trùng (vd đã ghi qua chat rồi ghi tay)."""
    for a in db.scalars(select(Activity).where(Activity.user_id == uid, Activity.date == day, Activity.activity_code == code)):
        if a.id != exclude and abs(a.duration_min - minutes) <= max(5, 0.2 * max(a.duration_min, minutes)):
            return a
    return None


def _apply(a: Activity, est: dict) -> None:
    a.activity_code, a.name, a.category = est["activity_code"], est["name"], est["category"]
    a.intensity, a.duration_min = est["intensity"], est["minutes"]
    a.distance_km, a.steps, a.avg_hr = est["distance_km"], est["steps"], est["avg_hr"]
    a.met, a.weight_kg_used = est["met"], est["weight_kg"]
    a.kcal_gross, a.kcal_net, a.who_minutes, a.formula = est["kcal_gross"], est["kcal_net"], est["who_minutes"], est["formula"]


def save(db: Session, user: User, data: dict, source: str = "manual", force: bool = False, existing: Activity | None = None) -> Activity:
    day = _check_date(data.get("date") or stats.today())
    est = estimate(db, user, data["activity_code"], data.get("duration_min"), data.get("intensity"),
                   data.get("distance_km"), data.get("steps"), data.get("avg_hr"))
    if not force:
        if est["warnings"]:
            raise NeedsConfirm(est["warnings"])
        dup = find_duplicate(db, user.id, day, est["activity_code"], est["minutes"], existing.id if existing else None)
        if dup:
            raise Duplicate(dup)
    a = existing or Activity(user_id=user.id, source=source)
    a.date = day
    a.note = str(data.get("note") or "")[:300]
    _apply(a, est)
    if not existing:
        db.add(a)
    db.commit()
    return a


def out(a: Activity) -> dict:
    cat = get(a.activity_code) or {}
    return {
        "id": a.id, "date": a.date.isoformat(), "activity_code": a.activity_code, "name": a.name, "category": a.category,
        "icon": cat.get("icon", "Activity"), "intensity": a.intensity, "intensity_vi": INTENSITY_VI.get(a.intensity, a.intensity),
        "duration_min": a.duration_min, "distance_km": a.distance_km, "steps": a.steps, "avg_hr": a.avg_hr, "met": a.met,
        "kcal_gross": a.kcal_gross, "kcal_net": a.kcal_net, "who_minutes": a.who_minutes, "formula": a.formula,
        "source": a.source, "note": a.note, "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def list_range(db: Session, uid: str, start: dt.date, end: dt.date) -> list[Activity]:
    return list(db.scalars(select(Activity).where(Activity.user_id == uid, Activity.date >= start, Activity.date <= end)
                           .order_by(Activity.date.desc(), Activity.created_at.desc())))


# --------------------------------------------------------------------------- buổi gym (chỉ đọc)
def gym_energy(sess, body: dict) -> dict:
    """Buổi gym cũng đốt calo: thời lượng × MET tập kháng lực (3,5; buổi HIIT 8,0)."""
    minutes = min(180.0, (sess.duration_sec or 0) / 60)
    hiit = "hiit" in (sess.name or "").lower() or (sess.plan_id or "") == "tpl_hiit"
    met = 8.0 if hiit else 3.5
    e = formulas.activity_energy(met, body["weight_kg"], minutes, body["bmr"]) if body["weight_kg"] and minutes else {"kcal_gross": 0, "kcal_net": 0}
    return {"id": sess.id, "name": sess.name, "minutes": round(minutes), "met": met, "hiit": hiit,
            "kcal_gross": e["kcal_gross"], "kcal_net": e["kcal_net"], "who_minutes": formulas.who_minutes(minutes, met) if hiit else 0}


def day_energy(db: Session, user: User, day: dt.date, body: dict | None = None) -> dict:
    """Vận động của 1 ngày: hoạt động khác + buổi gym → calo net (phần cộng thêm) để ăn bù."""
    b = body or body_info(db, user)
    acts = list_range(db, user.id, day, day)
    gyms = [gym_energy(s, b) for s in stats.completed_sessions(db, user.id, day, day)]
    act_net = sum(a.kcal_net for a in acts)
    gym_net = sum(g["kcal_net"] for g in gyms)
    return {"date": day.isoformat(), "activities": [out(a) for a in acts], "gym": gyms,
            "activity_kcal_net": round(act_net), "gym_kcal_net": round(gym_net), "total_kcal_net": round(act_net + gym_net),
            "total_kcal_gross": round(sum(a.kcal_gross for a in acts) + sum(g["kcal_gross"] for g in gyms)),
            "minutes": round(sum(a.duration_min for a in acts) + sum(g["minutes"] for g in gyms))}


def week_summary(db: Session, user: User, day: dt.date | None = None, body: dict | None = None) -> dict:
    """Tuần (T2–CN) theo khuyến nghị WHO 2020: 150–300 phút aerobic (mạnh ×2) + 2 buổi tăng cơ.
    Buổi gym tập tạ KHÔNG tính vào phút aerobic (WHO tách riêng), chỉ tính vào "buổi sức mạnh"."""
    b = body or body_info(db, user)
    day = day or stats.today()
    start = day - dt.timedelta(days=day.weekday())
    end = start + dt.timedelta(days=6)
    acts = list_range(db, user.id, start, end)
    sessions = stats.completed_sessions(db, user.id, start, min(end, stats.today()))
    gyms = [gym_energy(s, b) for s in sessions]
    aerobic = sum(a.who_minutes for a in acts) + sum(g["who_minutes"] for g in gyms)
    strength_days = len({stats.local_date(s.started_at) for s, g in zip(sessions, gyms) if not g["hiit"]})
    # Từng ngày T2–CN: phút tính vào mục tiêu, calo, có tập tạ không → dải 7 ngày dễ nhìn trên giao diện
    today = stats.today()
    days = []
    for i in range(7):
        d = start + dt.timedelta(days=i)
        da = [a for a in acts if a.date == d]
        dg = [g for s, g in zip(sessions, gyms) if stats.local_date(s.started_at) == d]
        days.append({"date": d.isoformat(), "minutes": round(sum(a.who_minutes for a in da) + sum(g["who_minutes"] for g in dg)),
                     "kcal": round(sum(a.kcal_gross for a in da) + sum(g["kcal_gross"] for g in dg)),
                     "strength": any(not g["hiit"] for g in dg), "future": d > today, "is_today": d == today})
    return {"start": start.isoformat(), "end": end.isoformat(), "who_minutes": round(aerobic), "target_min": WHO_TARGET[0],
            "target_max": WHO_TARGET[1], "strength_days": strength_days, "strength_target": WHO_STRENGTH_DAYS,
            "activity_count": len(acts), "kcal_net": round(sum(a.kcal_net for a in acts) + sum(g["kcal_net"] for g in gyms)),
            "kcal_gross": round(sum(x["kcal"] for x in days)), "days": days}


def weekly_history(db: Session, user: User, weeks: int = 4, body: dict | None = None) -> list[dict]:
    b = body or body_info(db, user)
    this_monday = stats.today() - dt.timedelta(days=stats.today().weekday())
    out_ = []
    for i in range(weeks - 1, -1, -1):
        st = this_monday - dt.timedelta(days=7 * i)
        w = week_summary(db, user, st, b)
        out_.append({"start": w["start"], "who_minutes": w["who_minutes"], "strength_days": w["strength_days"], "kcal_net": w["kcal_net"]})
    return out_


def recent(db: Session, uid: str, limit: int = 3) -> list[dict]:
    """Hoạt động hay ghi gần đây (không trùng hoạt động + thời lượng + mức) để ghi lại bằng 1 chạm."""
    seen, res = set(), []
    for a in db.scalars(select(Activity).where(Activity.user_id == uid).order_by(Activity.created_at.desc()).limit(40)):
        key = (a.activity_code, round(a.duration_min), a.intensity, a.distance_km, a.steps)
        if key in seen:
            continue
        seen.add(key)
        res.append({"activity_code": a.activity_code, "name": a.name, "duration_min": a.duration_min, "intensity": a.intensity,
                    "intensity_vi": INTENSITY_VI.get(a.intensity, a.intensity), "distance_km": a.distance_km, "steps": a.steps,
                    "icon": (get(a.activity_code) or {}).get("icon", "Activity")})
        if len(res) >= limit:
            break
    return res
