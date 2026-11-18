"""Gộp món bổ sung (foods_extra.py) vào data/foods.json.

  python scripts/build_foods.py --check     # chỉ kiểm tra số liệu
  python scripts/build_foods.py --images    # tìm ảnh trên Wikimedia Commons, ghi vào scripts/food_images.json
  python scripts/build_foods.py --write     # gộp vào data/foods.json (dùng ảnh đã duyệt trong food_images.json)

Kiểm tra: id/tên không trùng, nhóm hợp lệ, calo khớp 4·đạm + 4·carb + 9·béo (sai số ≤ 12% hoặc ≤ 25 kcal).
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from foods_extra import FOODS  # noqa: E402

DATA = ROOT / "data" / "foods.json"
IMAGES = ROOT / "scripts" / "food_images.json"
CATS = {"mon_nuoc", "com", "banh", "an_vat", "tinh_bot", "protein", "mon_man", "canh", "rau", "sua", "trai_cay", "do_uong", "do_ngot"}


def rows():
    out = []
    for r in FOODS:
        (fid, name, cat, serving, grams, kcal, p, c, f, emoji, clean, query, summary, tip) = r
        out.append({"id": fid, "name": name, "category": cat, "serving": serving, "grams": grams, "calories": kcal,
                    "protein": p, "carbs": c, "fat": f, "emoji": emoji, "clean": clean, "_query": query,
                    "summary": summary, "tip": tip})
    return out


def check(new: list[dict], old: list[dict]) -> list[str]:
    errs = []
    ids = {x["id"] for x in old}
    names = {x["name"].lower() for x in old}
    seen_i, seen_n = set(), set()
    for x in new:
        if x["id"] in ids or x["id"] in seen_i:
            errs.append(f"trùng id: {x['id']}")
        if x["name"].lower() in names or x["name"].lower() in seen_n:
            errs.append(f"trùng tên: {x['name']}")
        seen_i.add(x["id"])
        seen_n.add(x["name"].lower())
        if x["category"] not in CATS:
            errs.append(f"nhóm sai: {x['id']} {x['category']}")
        est = 4 * x["protein"] + 4 * x["carbs"] + 9 * x["fat"]
        # đồ uống có cồn: cồn 7 kcal/g không nằm trong macro
        if x["id"] != "bia" and abs(est - x["calories"]) > max(25, 0.12 * x["calories"]):
            errs.append(f"calo lệch: {x['id']} ghi {x['calories']} nhưng macro ra {est}")
        if not (x["summary"] and x["tip"]):
            errs.append(f"thiếu nhận xét/mẹo: {x['id']}")
    return errs


def commons_image(query: str) -> tuple[str | None, str | None]:
    params = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": "6", "gsrsearch": f"{query} filetype:bitmap",
              "gsrlimit": "5", "prop": "imageinfo", "iiprop": "url|mime", "iiurlwidth": "960"}
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "FitBroFoodLibrary/1.0 (educational project)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") in ("image/jpeg", "image/png", "image/webp") and info.get("thumburl"):
            return info["thumburl"].split("?")[0], p["title"]
    return None, None


def main():
    new = rows()
    # chạy lại nhiều lần được: bỏ các món bổ sung đã gộp từ lần trước rồi gộp lại
    extra_ids = {x["id"] for x in new}
    old = [x for x in json.loads(DATA.read_text(encoding="utf-8")) if x["id"] not in extra_ids]
    errs = check(new, old)
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    print(f"OK: {len(new)} món mới, số liệu hợp lệ (đang có {len(old)} món)")

    if "--images" in sys.argv:
        found = json.loads(IMAGES.read_text(encoding="utf-8")) if IMAGES.exists() else {}
        for x in new:
            if x["id"] in found:
                continue
            url = title = None
            for attempt in range(4):
                try:
                    url, title = commons_image(x["_query"])
                    break
                except Exception as e:  # 429 = Wikimedia giới hạn tốc độ → chờ rồi thử lại
                    print("chờ", x["id"], e, flush=True)
                    time.sleep(30 * (attempt + 1))
            else:
                continue
            found[x["id"]] = {"url": url, "title": title, "ok": None}
            IMAGES.write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")  # lưu dần
            print(f"{x['id']:<24} {title}", flush=True)
            time.sleep(3)
        IMAGES.write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")

    if "--write" in sys.argv:
        imgs = json.loads(IMAGES.read_text(encoding="utf-8")) if IMAGES.exists() else {}
        out = list(old)
        for x in new:
            im = imgs.get(x["id"]) or {}
            x["image"] = im.get("url") if im.get("ok") else None
            x.pop("_query")
            out.append({k: x[k] for k in ("id", "name", "category", "serving", "grams", "calories", "protein", "carbs", "fat",
                                          "image", "emoji", "clean", "summary", "tip")})
        DATA.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"Đã ghi {len(out)} món vào {DATA.name} ({sum(1 for x in out if x['image'])} món có ảnh)")


if __name__ == "__main__":
    main()
