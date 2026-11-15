"""Hồ sơ InBody: chỉ số cơ thể theo thời gian, đọc phiếu InBody bằng AI, giải thích chỉ số, mục tiêu."""
import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents import analyzers, llm
from ..db import get_db
from ..models import BodyMetric, Goal, User
from ..security import get_current_user
from ..services import formulas, stats
from ..utils import prepare_image

router = APIRouter(prefix="/api", tags=["body"])

# Giải thích từng chỉ số + liên hệ với tập luyện (feedback: "giải thích thông số, liên hệ gì với bài tập")
METRIC_INFO = {
    "weight_kg": {"label": "Cân nặng", "unit": "kg",
                  "what": "Tổng khối lượng cơ thể: cơ + mỡ + xương + nước. Dao động 0.5-1.5kg trong ngày là bình thường.",
                  "training": "Chỉ nhìn cân nặng dễ hiểu sai: tăng cơ + giảm mỡ có thể làm cân không đổi. Hãy xem cùng % mỡ và cơ xương."},
    "body_fat_pct": {"label": "Tỉ lệ mỡ", "unit": "%",
                     "what": "Phần trăm khối lượng là mỡ. Tham khảo: nam 10-20%, nữ 18-28% là khoảng khỏe mạnh.",
                     "training": "Muốn giảm: thâm hụt 300-500 kcal/ngày + giữ tập tạ để không mất cơ, thêm 2-3 buổi cardio/HIIT mỗi tuần."},
    "skeletal_muscle_kg": {"label": "Khối cơ xương (SMM)", "unit": "kg",
                           "what": "Lượng cơ bám xương — phần cơ bạn tập được. Càng cao, trao đổi chất càng tốt.",
                           "training": "Tăng SMM bằng bài compound (squat, bench, row, deadlift) 10-20 set/nhóm cơ/tuần + đủ đạm 1.6-2.2 g/kg."},
    "body_fat_kg": {"label": "Khối mỡ (BFM)", "unit": "kg",
                    "what": "Tổng khối lượng mỡ trong cơ thể tính bằng kg.",
                    "training": "Theo dõi BFM giảm dần là dấu hiệu giảm mỡ thật (không phải mất nước)."},
    "visceral_fat": {"label": "Mỡ nội tạng", "unit": "mức",
                     "what": "Mỡ quanh nội tạng. Mức 1-9 tốt, ≥10 tăng nguy cơ tim mạch, tiểu đường.",
                     "training": "Giảm hiệu quả nhất bằng cardio đều đặn + giảm đường/rượu bia + ngủ đủ."},
    "bmr_kcal": {"label": "Trao đổi chất cơ bản (BMR)", "unit": "kcal",
                 "what": "Năng lượng cơ thể đốt khi nghỉ hoàn toàn trong 1 ngày.",
                 "training": "BMR tăng khi khối cơ tăng — đó là lý do tập tạ giúp giữ dáng lâu dài."},
    "waist_cm": {"label": "Vòng eo", "unit": "cm",
                 "what": "Chỉ báo đơn giản về mỡ bụng. Nam < 90cm, nữ < 80cm (chuẩn châu Á).",
                 "training": "Eo giảm mà cân không đổi thường là đang giảm mỡ, tăng cơ."},
    "bmi": {"label": "BMI", "unit": "",
            "what": "Cân nặng/(chiều cao²). Người châu Á: 18.5-22.9 bình thường, 23-24.9 thừa cân.",
            "training": "BMI không phân biệt cơ và mỡ — người tập nhiều cơ có thể BMI cao mà vẫn khỏe."},
}


class MetricIn(BaseModel):
    date: dt.date | None = None
    weight_kg: float | None = Field(None, ge=25, le=300)
    body_fat_pct: float | None = Field(None, ge=2, le=70)
    skeletal_muscle_kg: float | None = Field(None, ge=5, le=120)
    body_fat_kg: float | None = Field(None, ge=1, le=200)
    visceral_fat: float | None = Field(None, ge=0, le=60)
    bmr_kcal: float | None = Field(None, ge=600, le=5000)
    waist_cm: float | None = Field(None, ge=30, le=250)
    chest_cm: float | None = Field(None, ge=30, le=250)
    hip_cm: float | None = Field(None, ge=30, le=250)
    arm_cm: float | None = Field(None, ge=10, le=100)
    thigh_cm: float | None = Field(None, ge=20, le=150)
    segmental: dict = {}
    source: Literal["manual", "inbody_scan"] = "manual"
    note: str = ""


class ScanIn(BaseModel):
    image: str


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    metric: Literal["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "waist_cm", "workouts_per_week", "custom"] = "custom"
    start_value: float | None = None
    target_value: float | None = None
    deadline: dt.date | None = None
    plan: str = ""
    status: Literal["active", "achieved", "archived"] = "active"


_KEYS = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "body_fat_kg", "visceral_fat", "bmr_kcal", "waist_cm", "chest_cm", "hip_cm", "arm_cm", "thigh_cm"]


def metric_out(m: BodyMetric) -> dict:
    return {"id": m.id, "date": m.date.isoformat(), **{k: getattr(m, k) for k in _KEYS}, "segmental": m.segmental or {},
            "source": m.source, "note": m.note}


@router.get("/body/metrics")
def list_metrics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(BodyMetric).where(BodyMetric.user_id == user.id).order_by(BodyMetric.date, BodyMetric.created_at))
    return [metric_out(m) for m in rows]


@router.post("/body/metrics")
def add_metric(body: MetricIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    if not any(data.get(k) is not None for k in _KEYS):
        raise HTTPException(400, "Nhập ít nhất 1 chỉ số")
    data["date"] = data["date"] or stats.today()
    m = BodyMetric(user_id=user.id, **data)
    db.add(m)
    p = stats.get_profile(db, user)
    if body.weight_kg and m.date >= stats.today() - dt.timedelta(days=1):
        p.weight_kg = body.weight_kg
        stats.recompute_targets(p)
    db.commit()
    return metric_out(m)


@router.delete("/body/metrics/{mid}")
def delete_metric(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(BodyMetric, mid)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy")
    db.delete(m)
    db.commit()
    return {"ok": True}


@router.post("/body/scan")
async def scan(body: ScanIn, user: User = Depends(get_current_user)):
    try:
        return await analyzers.scan_inbody(prepare_image(body.image, max_side=1600, quality=88))
    except llm.LLMError as e:
        raise HTTPException(503, str(e)) from e


def _latest_values(rows: list[BodyMetric]) -> dict:
    latest: dict = {}
    for m in rows:  # rows tăng dần theo ngày → giá trị sau ghi đè giá trị trước
        for k in _KEYS:
            v = getattr(m, k)
            if v is not None:
                latest[k] = {"value": v, "date": m.date.isoformat()}
    return latest


def _imbalance(seg: dict) -> list[dict]:
    """So sánh lean mass trái/phải. Chênh > 5% đáng chú ý, > 10% nên tập bài 1 bên (unilateral)."""
    out = []
    for part, (l, r) in {"Tay": ("left_arm", "right_arm"), "Chân": ("left_leg", "right_leg")}.items():
        if seg.get(l) and seg.get(r):
            gap_kg = abs(seg[l] - seg[r])
            diff = gap_kg / max(seg[l], seg[r]) * 100
            weaker = "trái" if seg[l] < seg[r] else "phải"
            level = "ok" if diff <= 5 else "watch" if diff <= 10 else "imbalanced"
            gap = f"{gap_kg:.1f}".replace(".", ",")
            # Tay chỉ ~3kg nạc nên vài trăm gram đã ra phần trăm lớn: nói rõ số kg và mức nhẹ nhàng,
            # để người mới không hoảng vì một con số phần trăm.
            if level == "ok":
                advice = "Cân đối tốt."
            elif level == "watch":
                advice = f"Bên {weaker} nhỏ hơn {gap}kg. Theo dõi ở lần đo sau; nếu vẫn lệch, thêm vài bài 1 tay/1 chân."
            else:
                advice = f"Bên {weaker} nhỏ hơn {gap}kg. Thêm bài 1 tay/1 chân (tạ đơn, lunge), bắt đầu bằng bên yếu."
            out.append({"part": part, "left": seg[l], "right": seg[r], "diff_pct": round(diff, 1), "level": level, "advice": advice})
    return out


def goal_progress(db: Session, user: User, g: Goal, latest: dict) -> dict:
    cur = None
    if g.metric in latest:
        cur = latest[g.metric]["value"]
    elif g.metric == "workouts_per_week":
        end = stats.today()
        cur = len(stats.completed_sessions(db, user.id, end - dt.timedelta(days=6), end))
    pct = None
    if cur is not None and g.target_value is not None:
        start = g.start_value if g.start_value is not None else cur
        if g.metric == "workouts_per_week":
            pct = min(100, round(cur / g.target_value * 100)) if g.target_value else None
        elif start != g.target_value:
            pct = max(0, min(100, round((start - cur) / (start - g.target_value) * 100)))
        else:
            pct = 100
    days_left = (g.deadline - stats.today()).days if g.deadline else None
    return {"id": g.id, "title": g.title, "metric": g.metric, "start_value": g.start_value, "target_value": g.target_value,
            "current_value": cur, "progress_pct": pct, "deadline": g.deadline.isoformat() if g.deadline else None,
            "days_left": days_left, "status": g.status, "plan": g.plan, "source": g.source}


@router.get("/body/summary")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = stats.get_profile(db, user)
    rows = list(db.scalars(select(BodyMetric).where(BodyMetric.user_id == user.id).order_by(BodyMetric.date, BodyMetric.created_at)))
    latest = _latest_values(rows)
    if p.height_cm and "weight_kg" in latest:
        latest["bmi"] = {"value": formulas.bmi(latest["weight_kg"]["value"], p.height_cm), "date": latest["weight_kg"]["date"]}
    # thay đổi so với lần đo đầu tiên
    first: dict = {}
    for m in rows:
        for k in _KEYS:
            v = getattr(m, k)
            if v is not None and k not in first:
                first[k] = v
    changes = {k: round(latest[k]["value"] - first[k], 1) for k in first if k in latest and len(rows) > 1}
    seg = next((m.segmental for m in reversed(rows) if m.segmental), {})
    goals = [goal_progress(db, user, g, latest) for g in db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at.desc()))]
    return {"latest": latest, "changes": changes, "count": len(rows), "info": METRIC_INFO, "segmental": seg,
            "imbalance": _imbalance(seg), "goals": goals, "height_cm": p.height_cm}


@router.get("/goals")
def list_goals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(BodyMetric).where(BodyMetric.user_id == user.id).order_by(BodyMetric.date)))
    latest = _latest_values(rows)
    return [goal_progress(db, user, g, latest) for g in db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at.desc()))]


@router.post("/goals")
def create_goal(body: GoalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = Goal(user_id=user.id, **body.model_dump(), source="manual")
    if g.start_value is None and g.metric not in ("custom", "workouts_per_week"):
        rows = list(db.scalars(select(BodyMetric).where(BodyMetric.user_id == user.id).order_by(BodyMetric.date)))
        lv = _latest_values(rows).get(g.metric)
        g.start_value = lv["value"] if lv else None
    db.add(g)
    db.commit()
    return {"id": g.id}


@router.put("/goals/{gid}")
def update_goal(gid: str, body: GoalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.get(Goal, gid)
    if not g or g.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy mục tiêu")
    for k, v in body.model_dump().items():
        setattr(g, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/goals/{gid}")
def delete_goal(gid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.get(Goal, gid)
    if not g or g.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy mục tiêu")
    db.delete(g)
    db.commit()
    return {"ok": True}


