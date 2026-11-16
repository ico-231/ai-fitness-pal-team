"""Hồ sơ cá nhân, mục tiêu dinh dưỡng, cài đặt."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BodyMetric, Profile, User
from ..security import get_current_user
from ..services import formulas, stats

router = APIRouter(prefix="/api/profile", tags=["profile"])

Goal = Literal["muscle", "fat_loss", "maintain", "endurance", "health"]
Level = Literal["beginner", "intermediate", "advanced"]
Activity = Literal["sedentary", "light", "moderate", "active", "very_active"]
Equip = Literal["gym", "home", "bodyweight"]

DEFAULT_SETTINGS = {
    "voice_coach": True,
    "voice_rate": 1.0,
    "prep_seconds": 10,
    "auto_camera": True,  # bài có Camera AI thì tự bật camera khi vào hiệp tập
    "calorie_cycling": True,  # ngày tập +150 kcal, ngày nghỉ −150 kcal (theo lịch tuần)
    "theme": "system",
    "reminders": {"checkin": "07:30", "workout": "18:00", "water_every_min": 0, "enabled": False},
}
# Các khoá lưu trong settings nhưng không phải tuỳ chọn hiển thị (không trả trong /profile)
FAVORITES_KEY = "favorite_meals"


def profile_out(p: Profile) -> dict:
    t = stats.targets(p)
    calc = None
    if p.weight_kg and p.height_cm and p.age and p.gender:
        calc = formulas.nutrition_targets(p.weight_kg, p.height_cm, p.age, p.gender, p.goal, p.activity_level)
    return {
        "onboarded": p.onboarded, "age": p.age, "gender": p.gender, "height_cm": p.height_cm, "weight_kg": p.weight_kg,
        "goal": p.goal, "level": p.level, "activity_level": p.activity_level, "training_days": p.training_days,
        "equipment": p.equipment, "injuries": p.injuries, "targets": t, "targets_manual": p.targets_manual,
        "calculated": calc, "bmi": formulas.bmi(p.weight_kg, p.height_cm) if p.weight_kg and p.height_cm else None,
        "settings": {**DEFAULT_SETTINGS, **{k: v for k, v in (p.settings or {}).items() if k != FAVORITES_KEY}},
    }


class ProfileIn(BaseModel):
    name: str | None = Field(None, max_length=120)
    age: int | None = Field(None, ge=10, le=100)
    gender: Literal["male", "female", "other"] | None = None
    height_cm: float | None = Field(None, ge=100, le=250)
    weight_kg: float | None = Field(None, ge=25, le=300)
    goal: Goal | None = None
    level: Level | None = None
    activity_level: Activity | None = None
    training_days: int | None = Field(None, ge=0, le=7)
    equipment: Equip | None = None
    injuries: str | None = Field(None, max_length=1000)
    targets_manual: bool | None = None
    target_calories: int | None = Field(None, ge=800, le=6000)
    target_protein: int | None = Field(None, ge=20, le=400)
    target_carbs: int | None = Field(None, ge=0, le=900)
    target_fat: int | None = Field(None, ge=10, le=300)
    target_water_ml: int | None = Field(None, ge=500, le=8000)


def _apply(p: Profile, user: User, body: ProfileIn) -> None:
    data = body.model_dump(exclude_unset=True)
    name = data.pop("name", None)
    if name:
        user.name = name.strip()
    for k, v in data.items():
        setattr(p, k, v)
    stats.recompute_targets(p)  # tự bỏ qua nếu người dùng đặt mục tiêu bằng tay


@router.get("")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_out(stats.get_profile(db, user))


@router.put("")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = stats.get_profile(db, user)
    old_weight = p.weight_kg
    _apply(p, user, body)
    if body.weight_kg and body.weight_kg != old_weight:
        db.add(BodyMetric(user_id=user.id, date=stats.today(), weight_kg=body.weight_kg, source="manual", note="Cập nhật từ hồ sơ"))
    db.commit()
    return profile_out(p)


@router.post("/onboard")
def onboard(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = stats.get_profile(db, user)
    _apply(p, user, body)
    p.onboarded = True
    if body.weight_kg:  # điểm xuất phát thật do người dùng nhập
        db.add(BodyMetric(user_id=user.id, date=stats.today(), weight_kg=body.weight_kg, source="manual", note="Lúc tạo hồ sơ"))
    db.commit()
    return profile_out(p)


@router.put("/settings")
def update_settings(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = stats.get_profile(db, user)
    merged = {**DEFAULT_SETTINGS, **(p.settings or {})}  # giữ cả món yêu thích
    for k, v in body.items():
        if k in DEFAULT_SETTINGS:
            merged[k] = {**merged[k], **v} if isinstance(merged[k], dict) and isinstance(v, dict) else v
    p.settings = merged
    db.commit()
    return profile_out(p)


@router.get("/targets/preview")
def preview_targets(weight_kg: float, height_cm: float, age: int, gender: str, goal: str = "maintain", activity_level: str = "moderate"):
    return formulas.nutrition_targets(weight_kg, height_cm, age, gender, goal, activity_level)
