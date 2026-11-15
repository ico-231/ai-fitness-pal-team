"""Nutrition: nhật ký bữa ăn theo ngày (lưu cả phân tích AI), thư viện món Việt, AI phân tích ảnh/mô tả."""
import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents import analyzers, llm
from ..db import get_db
from ..models import Meal, User
from ..security import get_current_user
from ..services import foods as foodsvc
from ..services import stats
from ..utils import prepare_image, thumbnail

router = APIRouter(prefix="/api", tags=["nutrition"])

MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class MealItem(BaseModel):
    name: str
    grams: float = 0
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    food_id: str | None = None
    servings: float | None = None


class MealIn(BaseModel):
    date: dt.date | None = None
    meal_type: MealType = "snack"
    name: str = Field(min_length=1, max_length=200)
    items: list[MealItem] = []
    calories: float = Field(ge=0, le=10000)
    protein: float = Field(0, ge=0, le=1000)
    carbs: float = Field(0, ge=0, le=1500)
    fat: float = Field(0, ge=0, le=1000)
    image: str | None = None  # data URL (sẽ được thu nhỏ) hoặc URL ảnh thư viện
    analysis: str = ""
    source: Literal["manual", "library", "photo", "text", "chat"] = "manual"


class AnalyzeIn(BaseModel):
    image: str | None = None
    text: str | None = Field(None, max_length=1000)


def meal_out(m: Meal) -> dict:
    return {"id": m.id, "date": m.date.isoformat(), "meal_type": m.meal_type, "name": m.name, "items": m.items,
            "calories": round(m.calories), "protein": round(m.protein, 1), "carbs": round(m.carbs, 1), "fat": round(m.fat, 1),
            "image": m.image, "analysis": m.analysis, "source": m.source, "created_at": m.created_at.isoformat() + "Z"}


def _img(v: str | None) -> str | None:
    if not v:
        return None
    if v.startswith("data:"):
        return thumbnail(v)
    return v[:600] if v.startswith("https://") else None


@router.get("/nutrition/day")
def day(date: dt.date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = date or stats.today()
    p = stats.get_profile(db, user)
    return {"date": d.isoformat(), "meals": [meal_out(m) for m in stats.meals_on(db, user.id, d)],
            "totals": stats.day_nutrition(db, user.id, d), "targets": stats.targets(p)}


@router.get("/nutrition/history")
def history(days: int = 30, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    days = max(1, min(days, 120))
    end = stats.today()
    start = end - dt.timedelta(days=days - 1)
    acc: dict[str, dict] = {}
    for m in db.scalars(select(Meal).where(Meal.user_id == user.id, Meal.date >= start).order_by(Meal.date)):
        a = acc.setdefault(m.date.isoformat(), {"date": m.date.isoformat(), "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "meals": 0})
        a["calories"] += m.calories
        a["protein"] += m.protein
        a["carbs"] += m.carbs
        a["fat"] += m.fat
        a["meals"] += 1
    rows = [{k: (round(v, 1) if isinstance(v, float) else v) for k, v in a.items()} for a in acc.values()]
    return {"days": rows, "targets": stats.targets(stats.get_profile(db, user))}


@router.post("/nutrition/meals")
def create_meal(body: MealIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = Meal(user_id=user.id, date=body.date or stats.today(), meal_type=body.meal_type, name=body.name,
             items=[i.model_dump() for i in body.items], calories=body.calories, protein=body.protein, carbs=body.carbs,
             fat=body.fat, image=_img(body.image), analysis=body.analysis, source=body.source)
    db.add(m)
    db.commit()
    return meal_out(m)


def _own(db: Session, user: User, mid: str) -> Meal:
    m = db.get(Meal, mid)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy bữa ăn")
    return m


@router.get("/nutrition/meals/{mid}")
def get_meal(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return meal_out(_own(db, user, mid))


@router.put("/nutrition/meals/{mid}")
def update_meal(mid: str, body: MealIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = _own(db, user, mid)
    data = body.model_dump()
    img = data.pop("image")
    data["items"] = [i.model_dump() for i in body.items]
    for k, v in data.items():
        if k == "date" and v is None:
            continue
        setattr(m, k, v)
    if img is not None and img != m.image:
        m.image = _img(img)
    db.commit()
    return meal_out(m)


@router.delete("/nutrition/meals/{mid}")
def delete_meal(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, mid))
    db.commit()
    return {"ok": True}


class RepeatIn(BaseModel):
    date: dt.date | None = None
    meal_type: MealType | None = None


@router.get("/nutrition/recent")
def recent(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Các món đã ăn gần đây (không trùng tên) để ghi lại nhanh — người Việt hay ăn lặp lại món quen."""
    seen, out = set(), []
    for m in db.scalars(select(Meal).where(Meal.user_id == user.id).order_by(Meal.created_at.desc()).limit(200)):
        key = m.name.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(meal_out(m))
        if len(out) >= 12:
            break
    return out


@router.post("/nutrition/meals/{mid}/repeat")
def repeat_meal(mid: str, body: RepeatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    src = _own(db, user, mid)
    m = Meal(user_id=user.id, date=body.date or stats.today(), meal_type=body.meal_type or src.meal_type, name=src.name,
             items=src.items, calories=src.calories, protein=src.protein, carbs=src.carbs, fat=src.fat, image=src.image,
             analysis=src.analysis, source=src.source)
    db.add(m)
    db.commit()
    return meal_out(m)


@router.post("/nutrition/analyze")
async def analyze(body: AnalyzeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not body.image and not (body.text or "").strip():
        raise HTTPException(400, "Cần ảnh hoặc mô tả bữa ăn")
    image = prepare_image(body.image) if body.image else None
    try:
        res = await analyzers.analyze_meal(db, user, image=image, text=body.text)
    except llm.LLMError as e:
        raise HTTPException(503, str(e)) from e
    res["image_thumb"] = thumbnail(body.image) if body.image else None
    return res


@router.get("/foods")
def foods(q: str = "", category: str | None = None, clean: bool = False):
    return {"categories": foodsvc.CATEGORIES, "items": foodsvc.search_foods(q, category or None, clean)}
