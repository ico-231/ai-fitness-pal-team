"""Thư viện món ăn Việt (giá trị dinh dưỡng ước tính cho 1 khẩu phần phổ biến)."""
from __future__ import annotations

import json
from functools import lru_cache

from ..config import DATA_DIR
from .exercises import _norm

CATEGORIES = {
    "mon_nuoc": "Món nước", "com": "Cơm & món xào", "banh": "Bánh", "an_vat": "Ăn vặt",
    "tinh_bot": "Tinh bột", "protein": "Giàu đạm", "mon_man": "Món mặn", "canh": "Canh",
    "rau": "Rau", "sua": "Sữa & sữa chua", "trai_cay": "Trái cây", "do_uong": "Đồ uống", "do_ngot": "Đồ ngọt",
}


@lru_cache
def all_foods() -> list[dict]:
    foods = json.loads((DATA_DIR / "foods.json").read_text(encoding="utf-8"))
    for f in foods:
        f["category_vi"] = CATEGORIES.get(f["category"], f["category"])
        f["_search"] = _norm(f["name"] + " " + f["category_vi"])
    return foods


def public(f: dict) -> dict:
    return {k: v for k, v in f.items() if not k.startswith("_")}


def get_food(fid: str) -> dict | None:
    return next((f for f in all_foods() if f["id"] == fid), None)


def search_foods(q: str = "", category: str | None = None, clean_only: bool = False, limit: int = 100) -> list[dict]:
    words = _norm(q).split()
    res = []
    for f in all_foods():
        if words and not all(w in f["_search"] for w in words):
            continue
        if category and f["category"] != category:
            continue
        if clean_only and not f["clean"]:
            continue
        res.append(public(f))
    return res[:limit]
