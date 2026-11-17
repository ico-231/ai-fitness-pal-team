"""Safety Guard — lớp an toàn chạy TRƯỚC mọi agent.

2 mức:
- "emergency": dấu hiệu cấp cứu / khủng hoảng tâm lý / rối loạn ăn uống → dừng, trả lời hướng dẫn an toàn,
  KHÔNG chuyển cho agent nào (không gọi LLM — nhanh và chắc chắn).
- "caution": có nhắc tới đau/chấn thương/bệnh → vẫn trả lời, nhưng agent nhận thêm chỉ dẫn thận trọng.
"""
from __future__ import annotations

import re
import unicodedata



def _plain(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d")


# Mỗi nhóm có 2 loại mẫu: "vi" so với văn bản CÓ dấu (tránh nhầm "từ từ" với "tự tử"),
# "plain" so với văn bản KHÔNG dấu (bắt cả khi người dùng gõ không dấu) — chỉ dùng cho cụm không gây nhầm.
_EMERGENCY = {
    "vi": [r"đau (thắt )?ngực", r"tức ngực", r"khó thở", r"không thở được", r"ngất", r"đột quỵ", r"co giật",
           r"tim đập (loạn|rất nhanh)", r"gãy xương", r"chảy máu (nhiều|không cầm)"],
    "plain": [r"dau (that )?nguc", r"tuc nguc", r"kho tho", r"ngat xiu", r"dot quy", r"co giat", r"gay xuong",
              r"chest pain", r"heart attack", r"can'?t breathe", r"shortness of breath", r"seizure", r"\bstroke\b"],
}
_CRISIS = {
    "vi": [r"tự tử", r"tự sát", r"không muốn sống", r"tự làm hại", r"tự hại", r"kết liễu", r"rạch tay"],
    "plain": [r"khong muon song", r"suicid", r"kill myself", r"self[- ]?harm", r"want to die"],
}
_EATING = {
    "vi": [r"móc họng", r"nôn (ra )?sau (khi )?ăn", r"cố tình nôn", r"nhịn ăn (nhiều|mấy|vài|\d+) ngày", r"chán ăn tâm thần", r"cuồng ăn"],
    "plain": [r"moc hong", r"co tinh non", r"purging", r"anorexi", r"bulimi", r"starving myself"],
}
_DRUGS = {
    "vi": [r"tiêm (hormone|testosterone|hgh)", r"liều (dùng )?(steroid|clen|sarm)"],
    "plain": [r"steroid", r"doping", r"\bsarms?\b", r"clenbuterol", r"tiem (hormone|testosterone)",
              r"(chu ky|cycle|lieu|stack|chich|bom).{0,30}(testosterone|trenbolone|nandrolone|deca|anavar|winstrol|dianabol|oxandrolone|hgh)",
              r"(testosterone|trenbolone|nandrolone|deca|anavar|winstrol|dianabol|oxandrolone|hgh).{0,30}(chu ky|cycle|lieu|bao nhieu mg|\d+ ?mg)"],
}
_CAUTION = {
    "vi": [r"\bđau\b", r"chấn thương", r"bong gân", r"trật khớp", r"thoát vị", r"viêm", r"bệnh", r"huyết áp", r"tiểu đường",
           r"mang thai", r"có thai", r"phẫu thuật", r"mổ"],
    "plain": [r"\bbi dau\b", r"dau (lung|goi|vai|khop|co tay|mat ca|hong)", r"chan thuong", r"bong gan", r"thoat vi",
              r"huyet ap", r"tieu duong", r"mang thai", r"phau thuat", r"injur", r"\bpain\b", r"\bhurt", r"pregnan"],
}
# "muốn chết" thường là cách nói quá ("mệt muốn chết") → chỉ coi là khủng hoảng khi KHÔNG đi sau các từ này
_HYPERBOLE_BEFORE = ("mệt", "đói", "nóng", "mỏi", "buồn ngủ", "đau", "chán", "nhục", "ngại", "lười", "vui", "sướng", "cười")


def _match(group: dict, vi: str, plain: str) -> bool:
    return any(re.search(x, vi) for x in group["vi"]) or any(re.search(x, plain) for x in group["plain"])


def _wants_to_die(vi: str) -> bool:
    for m in re.finditer(r"muốn chết", vi):
        before = vi[max(0, m.start() - 14): m.start()]
        if not any(w in before for w in _HYPERBOLE_BEFORE):
            return True
    return False


EMERGENCY_MSG = """Mình rất tiếc bạn đang gặp tình trạng này. Đây có thể là dấu hiệu cần **hỗ trợ y tế ngay**, mình không thể tư vấn tập luyện lúc này.

- Dừng mọi hoạt động thể lực, ngồi hoặc nằm nghỉ ở nơi an toàn.
- Gọi **115** (cấp cứu) hoặc nhờ người bên cạnh đưa tới cơ sở y tế gần nhất nếu triệu chứng nặng hoặc kéo dài.
- Không tự dùng thuốc khi chưa có chỉ định của bác sĩ.

Khi đã ổn và được bác sĩ cho phép, mình sẽ cùng bạn xây dựng lại lộ trình tập an toàn."""

CRISIS_MSG = """Cảm ơn bạn đã chia sẻ. Những gì bạn đang trải qua rất quan trọng, và bạn không phải đối mặt một mình.

- Nếu bạn đang gặp nguy hiểm, hãy gọi **115** ngay hoặc tới cơ sở y tế gần nhất.
- Đường dây hỗ trợ tâm lý miễn phí **Ngày Mai: 096 306 1414** (hỗ trợ người trầm cảm và người thân).
- Hãy nói chuyện với một người bạn tin tưởng (gia đình, bạn bè) ngay hôm nay.
- Chuyên gia tâm lý hoặc bác sĩ có thể giúp bạn — tìm tới phòng khám tâm lý/bệnh viện gần bạn.

Mình là trợ lý thể hình nên không thể thay thế chuyên gia, nhưng mình luôn ở đây khi bạn muốn quay lại với việc chăm sóc bản thân."""

EATING_MSG = """Mình hiểu bạn muốn có kết quả nhanh, nhưng nhịn ăn nhiều ngày hoặc cắt ăn quá khắt khe có thể gây tụt đường huyết, mất cơ, rối loạn điện giải, và cân thường tăng lại rất nhanh sau đó. Nếu bạn đang thấy khó kiểm soát việc ăn uống (sợ ăn, ăn rồi tìm cách bù trừ), hãy nói chuyện với **bác sĩ hoặc chuyên gia dinh dưỡng** nhé.

Cách an toàn mà vẫn hiệu quả:
- Thâm hụt vừa phải khoảng 300–500 kcal/ngày, giảm chừng 0,5–1% cân nặng mỗi tuần.
- Đủ đạm (1,6–2,2 g/kg) và vẫn tập tạ để giữ cơ.

Bạn muốn mình tính mức calo phù hợp cho bạn không?"""

DRUG_MSG = """Mình không tư vấn liều dùng steroid, hormone, SARMs hay chất cấm — chúng có rủi ro nghiêm trọng cho tim mạch, gan và nội tiết, và cần bác sĩ theo dõi.

Nếu bạn muốn tối ưu kết quả tự nhiên, mình có thể giúp về: ngủ đủ, tăng tải lũy tiến, đủ đạm (1.6-2.2 g/kg), và các thực phẩm bổ sung an toàn phổ biến như whey hoặc creatine."""


# ---------------------------------------------------------------------------
# Lớp bổ sung (không chặn, chỉ gắn "ghi chú" để agent trả lời thận trọng)
# ---------------------------------------------------------------------------

# Prompt injection: người dùng cố bắt agent bỏ quy tắc / lộ prompt hệ thống
_INJECTION = {
    "vi": [r"bỏ qua (mọi |tất cả |các |những )?(hướng dẫn|chỉ dẫn|quy tắc|lệnh|yêu cầu) (trước|ở trên|hệ thống|của bạn)",
           r"(tiết lộ|in ra|cho (mình|tôi|tao) xem|đưa|chép lại) .{0,25}(system prompt|prompt hệ thống|chỉ dẫn hệ thống|câu lệnh gốc|prompt gốc)",
           r"từ (giờ|bây giờ|nay) (bạn|mày) (là|đóng vai|hãy đóng vai)", r"chế độ (nhà phát triển|developer|không giới hạn|không kiểm duyệt)"],
    "plain": [r"ignore (all |any |the )?(previous|above|prior|earlier) (instructions|rules|prompts?)", r"system prompt",
              r"developer mode", r"jailbreak", r"\bdan mode\b", r"you are now", r"disregard (all|any|previous|the)",
              r"reveal (your )?(prompt|instructions|rules)"],
}
# Yêu cầu ăn kiêng / giảm cân cực đoan (vẫn trả lời, nhưng theo ngưỡng an toàn)
_EXTREME = {
    "vi": [r"thuốc (giảm cân|giảm mỡ|xổ|lợi tiểu|tan mỡ)", r"nhịn ăn hoàn toàn", r"chỉ uống nước", r"ép cân", r"detox"],
    "plain": [r"thuoc (giam can|giam mo|xo|loi tieu|tan mo)", r"nhin an hoan toan", r"chi uong nuoc", r"ep can", r"detox",
              r"fat burner", r"diet pills?"],
}
_KCAL = r"(\d{1,2}[.,]\d{3}|\d{3,4})\s*(?:kcal|calo|calories|cal)\b"


def _num(x: str) -> float:
    x = x.strip()
    if re.fullmatch(r"\d{1,2}[.,]\d{3}", x):  # 1.200 / 1,200 = nghìn
        return float(x.replace(".", "").replace(",", ""))
    return float(x.replace(",", "."))


def _extreme_numbers(plain: str) -> bool:
    """'ăn 600 calo/ngày', 'giảm 5kg trong 1 tuần' → yêu cầu cực đoan."""
    for m in re.finditer(_KCAL, plain):
        around = plain[max(0, m.start() - 30): m.end() + 20]
        if 200 <= _num(m.group(1)) < 1000 and re.search(r"ngay|moi ngay|/ngay|1 ngay|hang ngay", around) and \
                not re.search(r"bua|mon|to |phan|da an", around):
            return True
    for m in re.finditer(r"giam\s*(\d+(?:[.,]\d+)?)\s*(?:kg|can|ky)\s*(?:trong\s*)?(\d+)?\s*(tuan|ngay)", plain):
        kg, n, unit = _num(m.group(1)), int(m.group(2) or 1), m.group(3)
        weeks = n if unit == "tuan" else max(n, 1) / 7
        if kg / max(weeks, 1 / 7) > 2:
            return True
    return False


def notes_for(text: str) -> list[str]:
    """Các ghi chú thận trọng cho agent (không chặn): medical_caution, injection, extreme_diet."""
    vi = (text or "").lower()
    plain = _plain(vi)
    out = []
    if _match(_CAUTION, vi, plain):
        out.append("medical_caution")
    if _match(_INJECTION, vi, plain):
        out.append("injection")
    if _match(_EXTREME, vi, plain) or _extreme_numbers(plain):
        out.append("extreme_diet")
    return out


def check(text: str) -> dict:
    """Kiểm tra bằng luật (regex) — nhanh, chắc chắn, không tốn API."""
    vi = (text or "").lower()
    plain = _plain(vi)
    if _match(_EMERGENCY, vi, plain):
        return {"level": "block", "kind": "emergency", "message": EMERGENCY_MSG, "notes": [], "method": "rule"}
    if _match(_CRISIS, vi, plain) or _wants_to_die(vi):
        return {"level": "block", "kind": "crisis", "message": CRISIS_MSG, "notes": [], "method": "rule"}
    if _match(_EATING, vi, plain):
        return {"level": "block", "kind": "eating_disorder", "message": EATING_MSG, "notes": [], "method": "rule"}
    if _match(_DRUGS, vi, plain):
        return {"level": "block", "kind": "drugs", "message": DRUG_MSG, "notes": [], "method": "rule"}
    notes = notes_for(text)
    if notes:
        return {"level": "caution", "kind": notes[0], "message": None, "notes": notes, "method": "rule"}
    return {"level": "ok", "kind": None, "message": None, "notes": [], "method": "rule"}


# ---------------------------------------------------------------------------
# Lớp 2: LLM phân loại — chỉ chạy với câu "lưng chừng" (có từ gợi ý rủi ro nhưng regex không bắt được),
# vd "dạo này mình thấy sống chẳng còn ý nghĩa gì", "uống gì để xuống 3 ký trước đám cưới tuần sau".
# ---------------------------------------------------------------------------

_SOFT = [r"y nghia", r"chan nan", r"tuyet vong", r"buong xuoi", r"vo dung", r"ket thuc", r"bien mat", r"tram cam",
         r"lo au", r"khoc", r"co don", r"met moi voi", r"nhin", r"bo bua", r"an it", r"so beo", r"ghet co the",
         r"thuoc", r"tiem", r"uong gi de", r"cap toc", r"nhanh nhat", r"xuong \d+ ?(kg|ky|can)", r"chong mat", r"hoa mat",
         r"tim dap", r"te (tay|chan|bi)", r"non mua", r"buon non", r"ngat", r"kho chiu", r"hormone", r"kich duc",
         r"hurt myself", r"hopeless", r"pills?"]

CLASSIFIER_PROMPT = """Bạn là bộ phân loại an toàn cho một ứng dụng thể hình. Đọc tin nhắn của người dùng và phân loại rủi ro.
Các nhãn:
- "ok": câu hỏi bình thường về tập luyện, ăn uống, sức khoẻ thông thường.
- "emergency": triệu chứng cấp cứu đang xảy ra (đau ngực, khó thở, ngất, co giật...).
- "crisis": có ý nghĩ tự hại, tự tử, tuyệt vọng nghiêm trọng.
- "eating_disorder": dấu hiệu rối loạn ăn uống (nhịn ăn kéo dài, cố nôn, sợ ăn, bù trừ cực đoan).
- "drugs": hỏi liều steroid, hormone, chất cấm, thuốc giảm cân không rõ nguồn gốc.
- "extreme_diet": muốn giảm cân/ăn kiêng cực đoan nhưng không có dấu hiệu bệnh lý.
- "medical_caution": nhắc tới bệnh, đau, chấn thương, thuốc đang dùng → cần trả lời thận trọng.
Chỉ dùng emergency/crisis/eating_disorder/drugs khi khá chắc chắn. Câu nói quá/đùa ("mệt muốn xỉu") là "ok".
Trả về JSON: {"label": "...", "confidence": 0.0-1.0, "reason": "ngắn gọn tiếng Việt"}"""

_BLOCK_MSG = {"emergency": EMERGENCY_MSG, "crisis": CRISIS_MSG, "eating_disorder": EATING_MSG, "drugs": DRUG_MSG}


def needs_classifier(text: str) -> bool:
    plain = _plain((text or "").lower())
    return any(re.search(x, plain) for x in _SOFT)


async def check_async(text: str) -> dict:
    """Regex trước; nếu chưa chặn và câu có dấu hiệu lưng chừng → hỏi model nhanh (tối đa ~1 lượt gọi)."""
    from ..config import get_settings
    from . import llm  # import muộn: guard dùng được cả khi không có LLM

    g = check(text)
    s = get_settings()
    if g["level"] == "block" or not (s.guard_llm_classifier and s.ai_enabled) or not needs_classifier(text):
        return g
    try:
        data = await llm.complete_json(
            [{"role": "system", "content": CLASSIFIER_PROMPT}, {"role": "user", "content": text[:1500]}],
            model=s.router_model, temperature=0, max_tokens=120, purpose="guard_classifier",
        )
    except Exception:
        return g  # lỗi mạng → giữ kết quả regex, không chặn nhầm
    label = str(data.get("label", "ok"))
    try:
        conf = float(data.get("confidence", 0))
    except (TypeError, ValueError):
        conf = 0.0
    if label in _BLOCK_MSG and conf >= 0.8:
        return {"level": "block", "kind": label, "message": _BLOCK_MSG[label], "notes": [], "method": "llm",
                "confidence": conf, "reason": str(data.get("reason", ""))[:200]}
    if label in ("extreme_diet", "medical_caution") or (label in _BLOCK_MSG and conf >= 0.5):
        note = label if label in ("extreme_diet", "medical_caution") else "medical_caution"
        notes = list(dict.fromkeys([*g["notes"], note]))
        return {"level": "caution", "kind": notes[0], "message": None, "notes": notes, "method": "llm", "confidence": conf}
    return g


# ---------------------------------------------------------------------------
# Lớp 3: kiểm tra CÂU TRẢ LỜI của agent (output guardrail) — không tin tuyệt đối vào model
# ---------------------------------------------------------------------------

_DRUG_WORDS = r"thuốc|ibuprofen|paracetamol|aspirin|diclofenac|kháng sinh|giảm đau|corticoid|steroid|testosterone|insulin|clen|sarm|hgh|metformin"
_NEG = r"không nên|đừng|tránh|nguy hiểm|không an toàn|quá thấp|quá nhanh|quá ít|rủi ro|không khuyến|tuyệt đối không|dưới mức|thấp hơn mức|không được"
_PROMPT_MARKERS = ("QUY TẮC TRÌNH BÀY", "QUY TẮC DỮ LIỆU", "TÌNH HÌNH HÔM NAY (số liệu thật", "HỒ SƠ NGƯỜI DÙNG (dữ liệu thật)")

OUTPUT_NOTES = {
    "low_calorie": "Mức calo dưới {floor} kcal/ngày chỉ nên áp dụng khi có bác sĩ/chuyên gia dinh dưỡng theo dõi. "
                   "Mức an toàn phổ biến là thâm hụt 300-500 kcal so với TDEE.",
    "fast_weight_loss": "Tốc độ giảm cân an toàn là khoảng 0,5-1% cân nặng mỗi tuần; giảm nhanh hơn dễ mất cơ và phản tác dụng.",
    "long_fasting": "Không nên nhịn ăn nhiều ngày liền nếu không có chỉ định và theo dõi y tế.",
    "diagnosis": "FitBro không chẩn đoán bệnh — hãy gặp bác sĩ để được khám và kết luận chính xác.",
    "medication_dose": "Liều thuốc cần do bác sĩ/dược sĩ chỉ định, đừng tự dùng theo gợi ý của AI.",
}


def _sentences(text: str) -> list[str]:
    return [x for x in re.split(r"(?<=[.!?])\s+|\n+", text) if x.strip()]


def check_output(text: str, gender: str | None = None, weight_kg: float | None = None) -> list[dict]:
    """Trả về danh sách cờ vi phạm trong câu trả lời: [{kind, detail}]."""
    flags: list[dict] = []
    floor = 1200 if gender == "female" else 1500
    for sent in _sentences(text or ""):
        low = sent.lower()
        neg = re.search(_NEG, low)
        # 1) Khuyên ăn quá ít calo mỗi ngày
        for m in re.finditer(_KCAL, low):
            v = _num(m.group(1))
            if 500 <= v < floor and re.search(r"ngày", low) and not neg and \
                    re.search(r"nên|hãy|mục tiêu|giữ|chỉ ăn|ăn khoảng|ăn tầm|cắt|xuống còn|giảm xuống|nạp|duy trì|đặt", low) and \
                    not re.search(r"đã ăn|mới ăn|đã nạp|còn thiếu|còn lại|bữa|tô|phần ăn|món|hôm nay bạn", low):
                flags.append({"kind": "low_calorie", "detail": f"{v:g} kcal/ngày < {floor}", "floor": floor})
                break
        # 2) Tốc độ giảm cân quá nhanh
        for m in re.finditer(r"giảm\s*(?:khoảng|tầm|được|chừng)?\s*(\d+(?:[.,]\d+)?)\s*(?:-|–|đến)?\s*(\d+(?:[.,]\d+)?)?\s*kg"
                             r"\s*(?:/|mỗi|một|1|trong\s*(\d+)?\s*)?\s*(tuần|ngày)", low):
            if neg:
                break
            kg = _num(m.group(2) or m.group(1))
            n = int(m.group(3) or 1)
            weeks = n if m.group(4) == "tuần" else n / 7
            per_week = kg / max(weeks, 1 / 7)
            limit = max(1.5, (weight_kg or 0) * 0.015)
            if per_week > limit:
                flags.append({"kind": "fast_weight_loss", "detail": f"~{per_week:.1f} kg/tuần"})
                break
        # 3) Nhịn ăn nhiều ngày
        m = re.search(r"nhịn ăn\s*(?:hoàn toàn\s*)?(\d+)\s*ngày", low)
        if m and int(m.group(1)) >= 2 and not neg:
            flags.append({"kind": "long_fasting", "detail": m.group(0)})
        # 4) Chẩn đoán bệnh khẳng định
        if re.search(r"\b(bạn|cậu)\s+(chắc chắn\s+)?(đang\s+)?(bị|mắc)\s+(bệnh|hội chứng|thoát vị|viêm|rách|đứt|gãy|tiểu đường|trầm cảm|rối loạn)", low) \
                and not re.search(r"nếu|có thể|có khả năng|nghi|dấu hiệu|hãy đi khám|bác sĩ", low):
            flags.append({"kind": "diagnosis", "detail": sent.strip()[:120]})
        # 5) Liều thuốc cụ thể
        if re.search(r"\d+\s*(mg|mcg|µg|iu|ui|ml)\b", low) and re.search(_DRUG_WORDS, low) and not neg:
            flags.append({"kind": "medication_dose", "detail": sent.strip()[:120]})
    # 6) Lộ prompt hệ thống
    if any(mk in (text or "") for mk in _PROMPT_MARKERS):
        flags.append({"kind": "prompt_leak", "detail": "câu trả lời chứa nội dung prompt hệ thống"})
    seen, out = set(), []
    for f in flags:
        if f["kind"] not in seen:
            seen.add(f["kind"])
            out.append(f)
    return out


def apply_output_guard(text: str, flags: list[dict]) -> str:
    """Sửa câu trả lời theo cờ: lộ prompt → thay toàn bộ; còn lại → nối thêm ghi chú an toàn."""
    if not flags:
        return text
    if any(f["kind"] == "prompt_leak" for f in flags):
        return "Xin lỗi, mình không chia sẻ được cấu hình nội bộ của hệ thống. Mình có thể giúp bạn về tập luyện, dinh dưỡng hoặc theo dõi tiến độ nhé."
    notes = [OUTPUT_NOTES[f["kind"]].format(floor=f.get("floor", 1200)) for f in flags if f["kind"] in OUTPUT_NOTES]
    return text.rstrip() + "\n\n> Lưu ý an toàn: " + " ".join(notes)


INJECTION_HINT = re.compile("|".join(_INJECTION["plain"] + [r"bo qua (moi |tat ca |cac )?(huong dan|chi dan|quy tac)"]))


def looks_like_injection(text: str) -> bool:
    """Dùng cho dữ liệu KHÔNG phải tin nhắn trực tiếp (trí nhớ, chữ trong ảnh, ngữ cảnh trang)."""
    vi = (text or "").lower()
    return bool(INJECTION_HINT.search(_plain(vi))) or _match(_INJECTION, vi, _plain(vi))
