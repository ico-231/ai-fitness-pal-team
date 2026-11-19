"""Dị ứng thực phẩm — kiểm tra bằng CODE, không trông chờ AI tự nhớ.

Nguồn: Trí nhớ AI của người dùng (Cài đặt → Trí nhớ), các dòng có chữ "dị ứng" (vd "Dị ứng hải sản (tôm, cua)").
Dòng đó được quy ra danh sách từ khoá nguyên liệu (hải sản → cá, tôm, cua, mực, ốc...). Món (tên + mô tả) chứa từ khoá
→ cảnh báo trên thư viện món, và bị loại khỏi món AI gợi ý / thực đơn AI tạo.
Chỉ là lớp an toàn theo tên món (thư viện không có danh sách thành phần) — luôn nói rõ "có thể chứa".
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Memory

_SEAFOOD = ["cá", "tôm", "tép", "cua", "ghẹ", "mực", "bạch tuộc", "ốc", "sò", "nghêu", "ngao", "hàu", "hến", "hải sản", "sushi",
            "chả cá", "mắm tôm", "mắm ruốc"]
# (từ trong dòng trí nhớ) → (nhãn, từ khoá nguyên liệu)
_TRIGGERS: list[tuple[tuple[str, ...], str, list[str]]] = [
    (("hải sản",), "hải sản", _SEAFOOD),
    (("tôm", "tép"), "tôm", ["tôm", "tép", "mắm tôm"]),
    (("cua", "ghẹ"), "cua", ["cua", "ghẹ"]),
    (("cá",), "cá", ["cá", "chả cá"]),
    (("mực", "bạch tuộc"), "mực", ["mực", "bạch tuộc"]),
    (("ốc", "sò", "nghêu", "ngao", "hàu", "hến", "nhuyễn thể"), "nhuyễn thể", ["ốc", "sò", "nghêu", "ngao", "hàu", "hến"]),
    (("trứng",), "trứng", ["trứng"]),
    (("sữa",), "sữa", ["sữa", "phô mai", "sữa chua"]),
    (("đậu phộng", "lạc"), "đậu phộng", ["đậu phộng", "lạc"]),
    (("đậu nành",), "đậu nành", ["đậu nành", "đậu phụ", "đậu hũ", "tàu hũ"]),
    (("gluten", "lúa mì"), "gluten", ["bánh mì", "bột mì", "lúa mì", "mì"]),
]
_PHRASE_FALSE = re.compile(r"cá nhân|cá tính|cá cược", re.I)  # "cá" không phải con cá
_LET = r"[\wÀ-ỹ]"


def _has_word(text: str, word: str) -> bool:
    return re.search(rf"(?<!{_LET}){re.escape(word)}(?!{_LET})", text, re.I) is not None


def user_allergens(db: Session, uid: str) -> list[dict]:
    """[{note, labels, words}] — mỗi dòng "dị ứng ..." trong Trí nhớ AI → từ khoá nguyên liệu cần tránh."""
    out = []
    for m in db.scalars(select(Memory).where(Memory.user_id == uid)):
        c = (m.content or "").lower()
        if "dị ứng" not in c and "allergic" not in c and "allergy" not in c:
            continue
        labels, words = [], []
        for keys, label, kws in _TRIGGERS:
            if any(_has_word(c, k) for k in keys):
                labels.append(label)
                words += [w for w in kws if w not in words]
        if words:
            out.append({"note": m.content, "labels": labels, "words": words})
    return out


def matches(allergens: list[dict], text: str) -> list[str]:
    """Các từ khoá dị ứng xuất hiện trong `text` (tên món + mô tả); rỗng = không thấy."""
    if not allergens or not text:
        return []
    t = _PHRASE_FALSE.sub(" ", text.lower())
    hit: list[str] = []
    for a in allergens:
        for w in a["words"]:
            if w not in hit and _has_word(t, w):
                hit.append(w)
    return hit


def warning(allergens: list[dict], text: str) -> str | None:
    hit = matches(allergens, text)
    if not hit:
        return None
    notes = "; ".join(dict.fromkeys(a["note"] for a in allergens if any(w in hit for w in a["words"])))
    return f"Có thể chứa {', '.join(hit)} — bạn đã ghi nhớ: “{notes}”."


def food_text(f: dict) -> str:
    return f"{f.get('name', '')}. {f.get('summary', '')}"


def flag_foods(allergens: list[dict], foods: list[dict]) -> dict[str, str]:
    """food_id → câu cảnh báo cho các món có thể chứa chất người dùng dị ứng."""
    res = {}
    for f in foods:
        w = warning(allergens, food_text(f))
        if w:
            res[f["id"]] = w
    return res
