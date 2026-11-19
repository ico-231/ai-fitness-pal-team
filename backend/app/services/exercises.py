"""Thư viện 1.324 bài tập (ExerciseDB) + chuẩn hoá nhóm cơ cho bản đồ nhiệt."""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache

from ..config import DATA_DIR

GIF_CDN = "https://cdn.jsdelivr.net/gh/Johnson-Jia/exercises-dataset@master/media/{}.gif"

# 16 nhóm cơ chuẩn dùng cho bản đồ nhiệt (front/back)
MUSCLES = {
    "chest": "Ngực",
    "shoulders": "Vai",
    "biceps": "Tay trước",
    "triceps": "Tay sau",
    "forearms": "Cẳng tay",
    "abs": "Bụng",
    "obliques": "Liên sườn",
    "traps": "Cầu vai",
    "upper_back": "Lưng trên",
    "lats": "Lưng xô",
    "lower_back": "Lưng dưới",
    "glutes": "Mông",
    "quads": "Đùi trước",
    "hamstrings": "Đùi sau",
    "calves": "Bắp chân",
    "adductors": "Đùi trong",
}

_TARGET_MAP = {
    "pectorals": "chest", "delts": "shoulders", "biceps": "biceps", "triceps": "triceps",
    "forearms": "forearms", "abs": "abs", "upper back": "upper_back", "lats": "lats",
    "traps": "traps", "spine": "lower_back", "glutes": "glutes", "quads": "quads",
    "hamstrings": "hamstrings", "calves": "calves", "adductors": "adductors",
    "abductors": "glutes", "serratus anterior": "obliques", "levator scapulae": "traps",
}
_SECONDARY_MAP = {
    "shoulders": "shoulders", "deltoids": "shoulders", "rear deltoids": "shoulders", "rotator cuff": "shoulders",
    "hamstrings": "hamstrings", "forearms": "forearms", "wrists": "forearms", "wrist flexors": "forearms",
    "wrist extensors": "forearms", "hands": "forearms", "grip muscles": "forearms",
    "triceps": "triceps", "biceps": "biceps", "brachialis": "biceps", "quadriceps": "quads",
    "calves": "calves", "soleus": "calves", "ankles": "calves", "ankle stabilizers": "calves",
    "feet": "calves", "shins": "calves", "glutes": "glutes", "core": "abs", "abdominals": "abs",
    "lower abs": "abs", "chest": "chest", "upper chest": "chest", "hip flexors": "quads",
    "obliques": "obliques", "lower back": "lower_back", "back": "upper_back", "rhomboids": "upper_back",
    "upper back": "upper_back", "trapezius": "traps", "traps": "traps", "latissimus dorsi": "lats",
    "lats": "lats", "sternocleidomastoid": "traps", "groin": "adductors", "inner thighs": "adductors",
}

BODY_PARTS = {
    "chest": "Ngực", "back": "Lưng", "shoulders": "Vai", "upper arms": "Bắp tay",
    "lower arms": "Cẳng tay", "upper legs": "Đùi & Mông", "lower legs": "Bắp chân",
    "waist": "Bụng", "cardio": "Cardio", "neck": "Cổ",
}

EQUIPMENT = {
    "body weight": "Không dụng cụ", "dumbbell": "Tạ đơn", "barbell": "Tạ đòn", "cable": "Máy cáp",
    "leverage machine": "Máy tập", "band": "Dây kháng lực", "resistance band": "Dây kháng lực",
    "smith machine": "Máy Smith", "kettlebell": "Tạ ấm", "weighted": "Tạ đeo", "stability ball": "Bóng tập",
    "ez barbell": "Tạ EZ", "assisted": "Hỗ trợ", "medicine ball": "Bóng tạ", "rope": "Dây",
    "roller": "Con lăn", "trap bar": "Tạ trap", "olympic barbell": "Tạ đòn Olympic",
    "sled machine": "Máy sled (đạp đùi, hack)", "bosu ball": "Bóng Bosu", "tire": "Lốp xe", "upper body ergometer": "Máy đạp tay",
    "elliptical machine": "Máy elip", "stationary bike": "Xe đạp tập", "skierg machine": "Máy SkiErg",
    "stepmill machine": "Máy leo bậc", "hammer": "Máy Hammer", "wheel roller": "Con lăn bụng",
}

# Nhóm "focus" để lọc nhanh (UI + agent)
FOCUS = {
    "chest": {"label": "Ngực", "muscles": ["chest"]},
    "back": {"label": "Lưng", "muscles": ["lats", "upper_back", "lower_back", "traps"]},
    "shoulders": {"label": "Vai", "muscles": ["shoulders"]},
    "arms": {"label": "Tay", "muscles": ["biceps", "triceps", "forearms"]},
    "legs": {"label": "Chân & Mông", "muscles": ["quads", "hamstrings", "glutes", "calves", "adductors"]},
    "abs": {"label": "Bụng & Core", "muscles": ["abs", "obliques"]},
    "cardio": {"label": "Cardio", "muscles": []},
    "mobility": {"label": "Giãn cơ & Phục hồi", "muscles": []},
}

# Hai nhãn gốc cùng nghĩa → gộp thành MỘT chip lọc (bộ lọc "band" khớp cả "resistance band")
EQUIPMENT_ALIAS = {"resistance band": "band"}

HOME_EQUIPMENT = {"body weight", "dumbbell", "band", "resistance band", "kettlebell", "stability ball", "rope", "roller"}

# Bài nào có thể dùng Camera AI (khớp theo tên, xem frontend/src/lib/pose.ts)
_CAMERA_RULES = [
    # (mô hình Camera AI, mẫu tên bài, mẫu LOẠI TRỪ). Mỗi mô hình chỉ chấm đúng kiểu chuyển động của nó;
    # bài khác kiểu (wrist/leg/preacher curl, single-leg, side plank...) để KHÔNG có camera, thay vì chấm sai rồi luôn "xanh".
    ("lunge", r"lunge|split squat", r"lateral|side split|jump|twist|swing|curl|triceps|pass through|high knees|step-up"),
    ("squat", r"\bsquat\b", r"split|single leg|one leg|jump|plyo|curl|lunge|sissy|row|drop|on knees|overhead|pistol|turkish|calf|lying|jerk|curtsey|frankenstein|potty|chair|seated"),
    ("pushup", r"push-?up", r"handstand|planche|scapula|pike|elbow lift|side push|single arm|one arm|clock|kick|to side plank|plus|on lower arms|wall"),
    ("curl", r"\bcurl\b", r"wrist|\bleg\b|preacher|peacher|lying|prone|incline|concentration|drag|squat|lunge|spider|side lying|overhead|curl-up|lower back|hamstring|pulldown|press|waiter|kick"),
    ("press", r"(shoulder|overhead|military) press", r"behind head|twisting|to the side|one arm|alternate"),
    ("deadlift", r"deadlift", r"single leg|one arm|side"),
    ("plank", r"\bplank\b", r"side|reverse|twist|tap|leg lift|rear fly"),
    ("jumping_jack", r"jack jump|jumping jack", r"^$"),
]

# Bài phổ biến (hay gặp ở phòng tập / app gym) — được ưu tiên hiển thị trước
POPULAR = [
    # chân & mông
    "0043", "0042", "0739", "0085", "1459", "0032", "0336", "1460", "0431", "1760", "0413", "0585", "0586", "0599",
    "0417", "0605", "1373", "1409", "3561", "0597", "0300", "2368", "0514",
    # ngực
    "0025", "0289", "0047", "0314", "0577", "0308", "0596", "0155", "0251", "0662", "0493", "0279", "3211", "0375",
    # lưng
    "0652", "1326", "0150", "0027", "0293", "0861", "0064", "1349", "0095", "0406", "0032",
    # vai
    "0405", "0091", "2137", "0334", "0310", "0380", "2292", "0154", "0437", "0120",
    # tay
    "0031", "0294", "0313", "0070", "0372", "0297", "0318", "0241", "0060", "0351", "0333", "0814", "0129", "1399", "0283",
    # bụng
    "0274", "0003", "0687", "0276", "0472", "0620", "0464", "2135", "3544", "1471",
    # cardio
    "3224", "1160", "0630", "2612", "0685", "0501",
    # giãn cơ
    "1604", "1511", "1363", "1271", "1377", "1585", "0643", "1365",
]
_POP_RANK = {eid: i for i, eid in enumerate(dict.fromkeys(POPULAR))}

_COMPOUND = re.compile(r"squat|deadlift|bench press|row|pull-?up|chin-?up|press|dip|lunge|clean|thrust")
_TIMED = re.compile(r"plank|stretch|hold|run\b|jump rope|wall sit|march|walk|climber|jack|burpee|high knee|step")


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")


@lru_cache
def _load() -> tuple[list[dict], dict[str, dict]]:
    raw = json.loads((DATA_DIR / "exercises.json").read_text(encoding="utf-8"))
    names_vi = json.loads((DATA_DIR / "exercise_names_vi.json").read_text(encoding="utf-8"))
    items = []
    for e in raw:
        primary = _TARGET_MAP.get(e["target"])
        sec = []
        for m in e.get("secondary", []):
            c = _SECONDARY_MAP.get(m)
            if c and c != primary and c not in sec:
                sec.append(c)
        name = e["name"]
        camera = next((k for k, pat, ex in _CAMERA_RULES if re.search(pat, name) and not re.search(ex, name)), None)
        is_cardio = e["body_part"] == "cardio"
        is_stretch = "stretch" in name
        items.append({
            "id": e["id"],
            "name": name,
            "name_vi": names_vi.get(e["id"]),
            "body_part": e["body_part"],
            "body_part_vi": BODY_PARTS.get(e["body_part"], e["body_part"]),
            "target": e["target"],
            "equipment": e["equipment"],
            "equipment_vi": EQUIPMENT.get(e["equipment"], e["equipment"]),
            "primary": [primary] if primary else [],
            "secondary": sec,
            "steps": e.get("steps", []),
            "gif": GIF_CDN.format(e["media"]),
            "camera": camera,
            "timed": bool(is_cardio or is_stretch or _TIMED.search(name)),
            "compound": bool(_COMPOUND.search(name)),
            "kind": "cardio" if is_cardio else "mobility" if is_stretch else "strength",
            "_search": _norm(" ".join([name, names_vi.get(e["id"], ""), e["target"], e["body_part"], e["equipment"],
                                       BODY_PARTS.get(e["body_part"], ""), EQUIPMENT.get(e["equipment"], "")])),
        })
    return items, {x["id"]: x for x in items}


def public(ex: dict, full: bool = True) -> dict:
    d = {k: v for k, v in ex.items() if not k.startswith("_")}
    if not full:
        d.pop("steps", None)
    return d


def get_exercise(ex_id: str) -> dict | None:
    return _load()[1].get(ex_id)


def all_exercises() -> list[dict]:
    return _load()[0]


def muscles_of(ex_id: str) -> dict:
    ex = get_exercise(ex_id)
    if not ex:
        return {"primary": [], "secondary": []}
    return {"primary": ex["primary"], "secondary": ex["secondary"]}


def equipment_allowed(equipment: str, profile_equipment: str | None) -> bool:
    if profile_equipment == "bodyweight":
        return equipment == "body weight"
    if profile_equipment == "home":
        return equipment in HOME_EQUIPMENT
    return True


def search_exercises(
    q: str = "",
    focus: str | None = None,
    muscle: str | None = None,
    body_part: str | None = None,
    equipment: str | None = None,
    kind: str | None = None,
    camera_only: bool = False,
    profile_equipment: str | None = None,
    limit: int = 40,
    offset: int = 0,
) -> tuple[list[dict], int]:
    items = all_exercises()
    nq = _norm(q).strip()
    words = [w for w in nq.split() if w]
    muscles = set()
    if focus and focus in FOCUS:
        muscles = set(FOCUS[focus]["muscles"])
    if muscle:
        muscles = {muscle}

    def ok(e: dict) -> bool:
        if words and not all(w in e["_search"] for w in words):
            return False
        if focus == "cardio" and e["kind"] != "cardio":
            return False
        if focus == "mobility" and e["kind"] != "mobility":
            return False
        if muscles and not (set(e["primary"]) & muscles):
            return False
        if focus in FOCUS and focus not in ("cardio", "mobility") and e["kind"] == "mobility":
            return False
        if body_part and e["body_part"] != body_part:
            return False
        if equipment and EQUIPMENT_ALIAS.get(e["equipment"], e["equipment"]) != EQUIPMENT_ALIAS.get(equipment, equipment):
            return False
        if kind and e["kind"] != kind:
            return False
        if camera_only and not e["camera"]:
            return False
        if profile_equipment and not equipment_allowed(e["equipment"], profile_equipment):
            return False
        return True

    res = [e for e in items if ok(e)]

    # Ưu tiên: bài phổ biến → bài "gốc" (không phải biến thể v.2/(male)/with...) → compound → tên ngắn
    def rank(e: dict) -> tuple:
        n = e["name"]
        variant = bool(re.search(r"\(|v\. ?\d|\bwith\b|\bon\b|\balternat", n))
        return (_POP_RANK.get(e["id"], 10_000), variant, 0 if e["compound"] else 1, len(n.split()), n)

    res.sort(key=rank)
    return res[offset: offset + limit], len(res)
