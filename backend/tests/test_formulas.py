from app.agents.guard import check
from app.agents.orchestrator import sanitize
from app.services import formulas


def test_bmr_and_targets():
    # nam 20t, 62kg, 172cm: BMR = 620 + 1075 - 100 + 5 = 1600
    assert round(formulas.bmr_mifflin(62, 172, 20, "male")) == 1600
    t = formulas.nutrition_targets(62, 172, 20, "male", "muscle", "moderate")
    assert t["tdee"] == round(1600 * 1.55)
    assert t["calories"] == t["tdee"] + 300
    assert t["protein"] == 124  # 2.0 g/kg
    # tổng năng lượng từ macro ~ calo mục tiêu
    assert abs(t["protein"] * 4 + t["carbs"] * 4 + t["fat"] * 9 - t["calories"]) < 20


def test_fat_loss_floor():
    t = formulas.nutrition_targets(45, 150, 60, "female", "fat_loss", "sedentary")
    assert t["calories"] >= 1200


def test_one_rep_max():
    assert formulas.one_rep_max(100, 1) == 100
    assert formulas.one_rep_max(100, 10) == 133.3
    assert formulas.one_rep_max(0, 10) == 0


def test_readiness_bands():
    great = formulas.readiness_score(8, 5, 1, 1, 1)
    assert great["score"] == 100 and great["band"] == "high"
    bad = formulas.readiness_score(4, 1, 5, 5, 5)
    assert bad["score"] < 40 and bad["band"] == "low"
    mid = formulas.readiness_score(6, 3, 3, 3, 3)
    assert 40 <= mid["score"] < 80
    assert mid["weakest"] in {c["key"] for c in mid["components"]}


def test_overload():
    up = formulas.overload_suggestion([{"weight_kg": 60, "reps": 10}, {"weight_kg": 60, "reps": 10}], 10, True)
    assert up["weight_kg"] == 62.5
    hold = formulas.overload_suggestion([{"weight_kg": 60, "reps": 10}, {"weight_kg": 60, "reps": 7}], 10, True)
    assert hold["weight_kg"] == 60
    assert formulas.overload_suggestion([], 10, True) is None


def test_guard_no_false_positive():
    assert check("hạ tạ từ từ thôi")["level"] == "ok"
    assert check("tập xong mệt muốn chết")["level"] == "ok"
    assert check("bữa đầu tiên ăn đậu phụ")["level"] == "ok"
    assert check("tôi muốn tự tử")["kind"] == "crisis"
    assert check("dau nguc kho tho")["kind"] == "emergency"
    assert check("tôi bị đau gối khi squat")["level"] == "caution"
    assert check("liều dùng steroid")["kind"] == "drugs"


def test_sanitize_markdown():
    raw = "### Kế hoạch\n* **Ngày 1**: *ngực*\n* **Ngày 2**\n---\n**a** **b** **c** **d**"
    out = sanitize(raw)
    assert "#" not in out and "---" not in out
    assert out.count("**") <= 6  # tối đa 3 cặp in đậm
    assert "- " in out and "*ngực*" not in out


def test_key_and_model_rotation_order(monkeypatch):
    import time
    from app.agents import llm
    from app.config import get_settings

    st = get_settings()
    monkeypatch.setattr(st, "llm_api_key", "k1")
    monkeypatch.setattr(st, "llm_backup_api_keys", "k2")
    monkeypatch.setattr(st, "llm_fallback_models", "m2")
    llm._cooldown.clear()
    # model chính trên key chính → model chính trên key dự phòng → model dự phòng...
    monkeypatch.setattr(st, "secondary_llm_base_url", "http://other/v1")
    monkeypatch.setattr(st, "secondary_llm_api_keys", "g1")
    monkeypatch.setattr(st, "secondary_llm_models", "g-flash")
    pairs = lambda: [(e.key, e.model) for e in llm._candidates("m1")]  # noqa: E731
    # model chính trên mọi key → model dự phòng → nhà cung cấp thứ 2
    assert pairs() == [("k1", "m1"), ("k2", "m1"), ("k1", "m2"), ("k2", "m2"), ("g1", "g-flash")]
    llm._cooldown[llm._candidates("m1")[0]] = time.time() + 60  # key chính hết hạn mức với m1
    assert pairs()[0] == ("k2", "m1")
    # ảnh → chỉ dùng nhà cung cấp thứ 2 khi model chính không đọc được ảnh
    monkeypatch.setattr(st, "llm_vision_use_secondary", True)
    assert [(e.key, e.model) for e in llm._candidates("m1", vision=True)] == [("g1", "g-flash")]
    llm._cooldown.clear()

    from app.agents.orchestrator import tidy_cards
    cards = [{"kind": "foods", "items": [{"id": "a"}]}, {"kind": "foods", "items": [{"id": "a"}, {"id": "b"}]},
             {"kind": "confirm", "action_id": "x"}]
    t = tidy_cards(cards)
    assert len(t) == 2 and [i["id"] for i in t[0]["items"]] == ["a", "b"]
    assert [c["kind"] for c in tidy_cards(cards + [{"kind": "mealplan", "items": []}])] == ["confirm", "mealplan"]
