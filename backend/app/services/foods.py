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


# Cách gọi khác của cùng một nhóm (người dùng gõ tự nhiên)
_ALIASES = {"hoa qua": "trai cay", "qua": "trai cay", "nuoc uong": "do uong", "do an vat": "an vat", "trang mieng": "do ngot"}


def search_foods(q: str = "", category: str | None = None, clean_only: bool = False, limit: int = 100) -> list[dict]:
    """Tìm món: mỗi từ gõ vào phải là ĐẦU một từ trong tên/nhóm món (không dấu vẫn tìm được).
    Xếp hạng: khớp đúng dấu (khi có gõ dấu) > tên bắt đầu bằng từ khoá > tên chứa cả cụm từ khoá.
    Khi đã có món chứa cả cụm từ khoá thì bỏ các kết quả chỉ khớp lỏng ("trà đá" không kéo theo "Lòng TRắng trứng")."""
    qn = " ".join(_norm(q).split())
    qn = _ALIASES.get(qn, qn)
    words = qn.split()
    acc = " ".join(q.lower().split())
    scored = []
    for i, f in enumerate(all_foods()):
        if category and f["category"] != category:
            continue
        if clean_only and not f["clean"]:
            continue
        score = 0
        if words:
            tokens = f["_search"].replace("(", " ").replace(")", " ").replace("/", " ").replace(",", " ").split()
            if not all(any(t.startswith(w) for t in tokens) for w in words):
                continue
            name_n = _norm(f["name"])
            accented = acc != qn  # có gõ dấu
            score = (8 if accented and acc in f["name"].lower() else 0) + (4 if name_n.startswith(qn) else 0) + (2 if qn in name_n else 0)
        scored.append((-score, i, f))
    if any(sc < 0 for sc, _, _ in scored):
        scored = [x for x in scored if x[0] < 0]
    scored.sort(key=lambda x: (x[0], x[1]))
    return [public(f) for _, _, f in scored[:limit]]
