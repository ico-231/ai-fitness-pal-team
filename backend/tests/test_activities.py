"""M8 — Hoạt động khác: công thức calo, chống ghi trùng, mục tiêu calo 2 chế độ, tuần WHO, chat."""
import datetime as dt

import pytest

from app.services import activities as actsvc
from app.services import formulas


# ------------------------------------------------------------------ công thức (hàm thuần)
def test_activity_energy_gross_and_net():
    # 62 kg đạp xe 6,8 MET 60 phút: gross = 6,8 × 62 = 422; net trừ BMR riêng / 24
    bmr = formulas.bmr_mifflin(62, 172, 20, "male")  # 1600
    e = formulas.activity_energy(6.8, 62, 60, bmr)
    assert e["kcal_gross"] == 422
    assert e["kcal_net"] == round(422 - bmr / 24)
    # thiếu BMR → (MET − 1) × kg × giờ
    assert formulas.activity_energy(6.8, 62, 60)["kcal_net"] == round(5.8 * 62)


def test_who_minutes_and_intensity():
    assert formulas.who_intensity(2.5) == "light" and formulas.who_minutes(30, 2.5) == 0
    assert formulas.who_intensity(4.0) == "moderate" and formulas.who_minutes(30, 4.0) == 30
    assert formulas.who_intensity(8.0) == "vigorous" and formulas.who_minutes(30, 8.0) == 60


def test_met_from_speed_and_keytel():
    bike = actsvc.get("dap_xe")["speed_mets"]
    assert formulas.met_from_speed(bike, 14) == 4.0
    assert formulas.met_from_speed(bike, 18) == 6.8
    assert formulas.met_from_speed(bike, 99) == bike[-1]["met"]
    assert 8 < formulas.keytel_kcal(140, 62, 20, "male", 1) < 14  # ~11 kcal/phút ở nhịp 140


def test_catalog_has_no_gym_and_search_aliases():
    ids = {a["id"] for a in actsvc.catalog()["items"]}
    assert not any("ta" == i or "gym" in i for i in ids)  # buổi gym đã tự tính → không có trong danh mục
    assert actsvc.search("đá banh")[0]["id"] == "bong_da"
    assert actsvc.search("bike")[0]["id"] == "dap_xe"
    assert actsvc.search("boi")[0]["id"] == "boi"
    assert len([a for a in actsvc.catalog()["items"] if a["popular"]]) == 8


# ------------------------------------------------------------------ API
def test_estimate_and_create_and_duplicate(client, auth):
    est = client.post("/api/activities/estimate", headers=auth, json={"activity_code": "dap_xe", "duration_min": 40, "intensity": "moderate"}).json()
    assert est["kcal_gross"] == round(6.8 * 62 * 40 / 60) and est["who_minutes"] == 40
    # nhập quãng đường → MET tự chọn theo tốc độ (12 km trong 40 phút = 18 km/h → 6,8)
    est2 = client.post("/api/activities/estimate", headers=auth, json={"activity_code": "dap_xe", "duration_min": 40, "distance_km": 12}).json()
    assert est2["speed_kmh"] == 18.0 and est2["met"] == 6.8
    r = client.post("/api/activities", headers=auth, json={"activity_code": "dap_xe", "duration_min": 40})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["kcal_gross"] == est["kcal_gross"] and a["source"] == "manual"
    # ghi lại gần giống → hỏi trùng (409), force thì lưu
    r = client.post("/api/activities", headers=auth, json={"activity_code": "dap_xe", "duration_min": 45})
    assert r.status_code == 409 and r.json()["code"] == "duplicate"
    assert client.post("/api/activities", headers=auth, json={"activity_code": "dap_xe", "duration_min": 45, "force": True}).status_code == 200
    # sửa thời lượng → calo tính lại
    u = client.put(f"/api/activities/{a['id']}", headers=auth, json={"activity_code": "dap_xe", "duration_min": 20, "force": True}).json()
    assert u["kcal_gross"] == round(6.8 * 62 * 20 / 60)
    assert client.delete(f"/api/activities/{a['id']}", headers=auth).status_code == 200
    assert len(client.get("/api/activities", headers=auth).json()) == 1


def test_validation_and_confirm(client, auth):
    bad = [
        {"activity_code": "khong_co", "duration_min": 30},
        {"activity_code": "chay_bo", "duration_min": 0},
        {"activity_code": "chay_bo", "duration_min": 700},
        {"activity_code": "di_bo", "duration_min": 30, "distance_km": 20},  # 40 km/h đi bộ: vô lý
        {"activity_code": "chay_bo", "duration_min": 30, "date": (dt.date.today() + dt.timedelta(days=2)).isoformat()},
        {"activity_code": "chay_bo", "duration_min": 30, "date": (dt.date.today() - dt.timedelta(days=20)).isoformat()},
    ]
    for b in bad:
        r = client.post("/api/activities", headers=auth, json=b)
        assert r.status_code == 400, (b, r.text)
    # 5 tiếng đá bóng: không chặn nhưng phải hỏi lại
    r = client.post("/api/activities", headers=auth, json={"activity_code": "bong_da", "duration_min": 300})
    assert r.status_code == 409 and r.json()["code"] == "confirm"


def test_steps_only_count_above_baseline(client, auth):
    low = client.post("/api/activities/estimate", headers=auth, json={"activity_code": "buoc_chan", "steps": 4000}).json()
    assert low["kcal_gross"] == 0 and low["minutes"] == 0  # chưa vượt 5.000 bước nền
    high = client.post("/api/activities/estimate", headers=auth, json={"activity_code": "buoc_chan", "steps": 9000}).json()
    assert high["minutes"] == 40  # (9000 − 5000) / 100 bước/phút


def test_targets_two_modes_no_double_count(client, auth):
    base = client.get("/api/nutrition/day", headers=auth).json()["targets"]
    assert base["mode"] == "average"
    client.post("/api/activities", headers=auth, json={"activity_code": "bong_da", "duration_min": 60})
    avg = client.get("/api/nutrition/day", headers=auth).json()["targets"]
    # chế độ trung bình: hoạt động KHÔNG cộng thêm calo, chỉ đánh dấu ngày tập (+150)
    assert avg["activity_adjust_kcal"] == 0 and avg["day_type"] == "train" and avg["calories"] == avg["base_calories"] + 150
    # bật chế độ theo vận động thực tế
    r = client.put("/api/profile/settings", headers=auth, json={"energy_mode": "tracked", "lifestyle": "sitting"})
    assert r.status_code == 200 and r.json()["energy_preview"]["sitting"] < r.json()["energy_preview"]["manual"]
    tr = client.get("/api/nutrition/day", headers=auth).json()["targets"]
    assert tr["mode"] == "tracked"
    assert tr["base_calories"] < avg["base_calories"]  # nền 1,2 thấp hơn 1,55
    assert tr["calories"] == tr["base_calories"] + round(0.5 * tr["activity_kcal_net"])
    assert client.put("/api/profile/settings", headers=auth, json={"energy_mode": "x"}).status_code == 400


def test_week_summary_who_excludes_strength(client, auth):
    client.post("/api/activities", headers=auth, json={"activity_code": "chay_bo", "duration_min": 30, "intensity": "vigorous"})
    s = client.get("/api/activities/summary", headers=auth).json()
    assert s["week"]["who_minutes"] == 60  # 30 phút mạnh = 60 phút quy đổi
    assert s["week"]["target_min"] == 150 and s["week"]["strength_target"] == 2
    assert s["recent"][0]["activity_code"] == "chay_bo"
    assert len(s["history"]) == 4


def test_schedule_week_shows_activity(client, auth):
    client.post("/api/activities", headers=auth, json={"activity_code": "boi", "duration_min": 30})
    w = client.get("/api/schedule/week", headers=auth).json()
    today = next(d for d in w["days"] if d["is_today"])
    assert today["activities"][0]["name"] == "Bơi"
    # hôm nay chưa kết luận "thay bằng" (tối vẫn có thể đi tập); không có lịch → "active"
    assert today["status"] in ("active", "planned")


def test_export_and_delete_include_activities(client, auth):
    client.post("/api/activities", headers=auth, json={"activity_code": "yoga", "duration_min": 30})
    ex = client.get("/api/data/export", headers=auth).json()
    assert ex["activities"][0]["activity_code"] == "yoga"


def test_chat_activity_tool_server_computes_kcal(client, auth):
    from app.agents import tools
    from app.db import SessionLocal
    from app.models import PendingAction, User
    from app.services import stats

    db = SessionLocal()
    me = client.get("/api/me", headers=auth).json()
    user = db.get(User, me["id"])

    ctx = tools.ToolContext(db=db, user=user, profile=stats.get_profile(db, user), agent="coachbro")
    # thiếu thời gian → yêu cầu hỏi lại, không tạo thẻ
    assert "need_info" in tools.propose_activity_log(ctx, "dap_xe")
    res = tools.propose_activity_log(ctx, "dap_xe", duration_min=40)
    assert res["calories_from_server"] == round(6.8 * 62 * 40 / 60)
    pa = db.get(PendingAction, res["action_id"])
    # thẻ cố tình bị sửa calo phía client → bị bỏ qua, server tính lại; sửa thời lượng thì được
    out = tools.execute_action(db, user, pa, {"kcal_gross": 9999, "duration_min": 20})
    assert out["kcal"] == round(6.8 * 62 * 20 / 60)
    db.close()


def test_met_values_match_compendium_2024():
    """Chốt vài giá trị đã đối chiếu với pacompendium.com (Adult Compendium 2024) — sửa danh mục thì phải tra lại."""
    m = {a["id"]: a["met"] for a in actsvc.catalog()["items"]}
    assert m["dap_xe"]["moderate"] == 6.8      # 01011 to/from work, self-selected pace
    assert m["chay_bo"]["moderate"] == 7.5     # 12020 jogging, general
    assert m["di_bo"]["vigorous"] == 4.8       # 17200 brisk 3.5-3.9 mph
    assert m["bong_da"]["moderate"] == 7.0     # 15610 soccer casual
    assert m["cau_long"]["moderate"] == 5.5    # 15030 badminton social
    assert m["boi"]["moderate"] == 6.0         # 18310 swimming leisurely
    assert m["yoga"]["light"] == 2.3           # 02150 hatha
    run = actsvc.get("chay_bo")["speed_mets"]
    assert formulas.met_from_speed(run, 10.0) == 9.3   # 12050 6-6.3 mph
    walk = actsvc.get("di_bo")["speed_mets"]
    assert formulas.met_from_speed(walk, 5.0) == 3.8   # 17190 2.8-3.4 mph
    assert actsvc.catalog()["version"].startswith("Compendium 2024")


def test_knowledge_chunk_ids_unique():
    """Trùng mã đoạn kiến thức làm BM25 cộng dồn điểm → đoạn đó lên đầu MỌI câu hỏi (lỗi đã gặp khi thêm 07_van_dong.md)."""
    from collections import Counter

    from app.services import knowledge
    dup = [k for k, n in Counter(c.id for c in knowledge.kb().chunks).items() if n > 1]
    assert not dup, dup



def test_activity_keeps_streak_and_calendar(client, auth):
    client.post("/api/activities", headers=auth, json={"activity_code": "bong_da", "duration_min": 60})
    cal = client.get("/api/daily/calendar?days=7", headers=auth).json()["days"]
    today = cal[-1]
    assert today["workout"] == 1 and today["activity"] == 1  # 60 phút đá bóng = 1 buổi trên lịch chuỗi
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["today"]["streak"]["today_active"] is True
