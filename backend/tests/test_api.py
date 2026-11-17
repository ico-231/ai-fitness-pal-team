"""Kiểm thử luồng dữ liệu thật end-to-end (không cần AI)."""


def test_auth_flow(client):
    r = client.post("/api/auth/register", json={"email": "a@b.vn", "password": "123456", "name": "Lan"})
    assert r.status_code == 200
    assert client.post("/api/auth/register", json={"email": "a@b.vn", "password": "123456", "name": "Lan"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "a@b.vn", "password": "sai"}).status_code == 401
    tok = client.post("/api/auth/login", json={"email": "A@b.vn", "password": "123456"}).json()["token"]
    me = client.get("/api/me", headers={"Authorization": f"Bearer {tok}"}).json()
    assert me["name"] == "Lan" and me["profile"]["onboarded"] is False
    assert client.get("/api/me").status_code == 401


def test_profile_targets(client, auth):
    p = client.get("/api/profile", headers=auth).json()
    assert p["onboarded"] and p["targets"]["protein"] == 124
    p = client.put("/api/profile", headers=auth, json={"goal": "fat_loss"}).json()
    assert p["targets"]["protein"] == round(62 * 2.2)
    p = client.put("/api/profile", headers=auth, json={"targets_manual": True, "target_calories": 2100}).json()
    assert p["targets"]["calories"] == 2100


def test_checkin_updates_dashboard(client, auth):
    # Bug cũ: cập nhật mức độ sẵn sàng ở Daily nhưng Dashboard không đổi → giờ dùng chung 1 nguồn dữ liệu
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["today"]["readiness"] is None and d["has_any_data"] is False
    r = client.post("/api/daily/checkin", headers=auth, json={"sleep_hours": 8, "sleep_quality": 5, "fatigue": 1, "soreness": 2, "stress": 1})
    assert r.json()["readiness"]["score"] >= 80
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["today"]["readiness"]["score"] == r.json()["readiness"]["score"]
    w = client.post("/api/daily/water", headers=auth, json={"delta_ml": 250}).json()
    assert w["water_ml"] == 250 and w["streak"]["current"] == 1


def test_meals_history_and_analysis_saved(client, auth):
    r = client.post("/api/nutrition/meals", headers=auth, json={
        "meal_type": "lunch", "name": "Phở bò", "calories": 450, "protein": 25, "carbs": 60, "fat": 12,
        "analysis": "Bữa trưa khá cân bằng.", "source": "library",
    })
    mid = r.json()["id"]
    day = client.get("/api/nutrition/day", headers=auth).json()
    assert day["totals"]["calories"] == 450 and len(day["meals"]) == 1
    # phân tích trước đó vẫn được lưu khi mở lại bữa ăn
    assert client.get(f"/api/nutrition/meals/{mid}", headers=auth).json()["analysis"] == "Bữa trưa khá cân bằng."
    hist = client.get("/api/nutrition/history", headers=auth).json()
    assert hist["days"][0]["calories"] == 450
    assert len(client.get("/api/foods?q=pho", headers=auth).json()["items"]) >= 1


def test_workout_session_pr_heatmap(client, auth):
    tpl = client.get("/api/workouts/templates", headers=auth).json()
    leg = next(t for t in tpl if t["id"] == "tpl_leg")
    assert len(leg["items"]) == 5 and leg["items"][0]["exercise"]["gif"].endswith(".gif")

    def do_session(weight):
        s = client.post("/api/workouts/sessions", headers=auth, json={"plan_id": "tpl_leg", "name": "Leg Workout"}).json()
        for i in range(1, 4):
            client.post(f"/api/workouts/sessions/{s['id']}/sets", headers=auth,
                        json={"exercise_id": "0043", "set_index": i, "weight_kg": weight, "reps": 8, "form_score": 90})
        return client.post(f"/api/workouts/sessions/{s['id']}/finish", headers=auth, json={}).json()

    first = do_session(60)
    assert first["status"] == "completed" and first["total_volume"] == 60 * 8 * 3
    second = do_session(65)
    assert len(second["prs"]) >= 1  # phá kỷ lục squat
    prs = client.get("/api/workouts/prs", headers=auth).json()
    assert prs[0]["exercise_id"] == "0043" and prs[0]["weight_kg"] == 65

    hm = client.get("/api/dashboard/heatmap?days=7", headers=auth).json()
    assert hm["muscles"]["glutes"]["sets"] == 6 and hm["muscles"]["glutes"]["level"] >= 2
    assert hm["muscles"]["chest"]["level"] == 0
    rep = client.get("/api/dashboard/report?period=week", headers=auth).json()
    assert rep["summary"]["sessions"] == 2 and rep["summary"]["pr_count"] >= 1

    detail = client.get("/api/exercises/0043", headers=auth).json()
    assert detail["overload"]["weight_kg"] == 65  # lần trước 8 rep < mục tiêu 10 → giữ tạ

    # buổi tập không có set nào thì không lưu
    s = client.post("/api/workouts/sessions", headers=auth, json={"name": "Trống"}).json()
    assert client.post(f"/api/workouts/sessions/{s['id']}/finish", headers=auth, json={}).json()["discarded"]


def test_suggest_rule_based_without_ai(client, auth, monkeypatch):
    from app.agents import llm

    async def boom(*a, **k):
        raise llm.LLMError("offline")

    monkeypatch.setattr(llm, "complete_json", boom)
    r = client.post("/api/workouts/suggest", headers=auth, json={"muscle": "biceps"}).json()
    assert r["method"] == "rules" and len(r["exercises"]) >= 3
    assert all(e["exercise"]["primary"] == ["biceps"] for e in r["exercises"])


def test_body_metrics_goal_progress(client, auth):
    client.post("/api/body/metrics", headers=auth, json={"weight_kg": 62, "body_fat_pct": 20})
    g = client.post("/api/goals", headers=auth, json={"title": "Mỡ 15%", "metric": "body_fat_pct", "target_value": 15}).json()
    client.post("/api/body/metrics", headers=auth, json={"body_fat_pct": 17.5, "segmental": {"left_arm": 2.9, "right_arm": 3.3}})
    s = client.get("/api/body/summary", headers=auth).json()
    goal = next(x for x in s["goals"] if x["id"] == g["id"])
    assert goal["start_value"] == 20 and goal["current_value"] == 17.5 and goal["progress_pct"] == 50
    assert s["latest"]["bmi"]["value"] == 21.0
    assert s["imbalance"][0]["level"] == "imbalanced"
    assert "training" in s["info"]["skeletal_muscle_kg"]


def test_briefing_and_wipe(client, auth):
    text = client.get("/api/dashboard/briefing", headers=auth).json()["text"]
    assert "chưa check-in" in text and "chưa ghi bữa ăn" in text
    client.post("/api/nutrition/meals", headers=auth, json={"name": "Trứng", "calories": 75, "protein": 6})
    assert client.post("/api/data/wipe", headers=auth, json={"confirm": "sai"}).status_code == 400
    assert client.post("/api/data/wipe", headers=auth, json={"confirm": "XOA"}).json()["ok"]
    assert client.get("/api/nutrition/day", headers=auth).json()["meals"] == []
    exp = client.get("/api/data/export", headers=auth).json()
    assert exp["meals"] == [] and exp["profile"]["onboarded"]


def test_schedule_insights_recent_meals(client, auth):
    r = client.put("/api/schedule", headers=auth, json={"days": {"0": {"plan_id": "tpl_leg"}, "3": {"plan_id": "tpl_back"}, "5": {"plan_id": "fake"}}})
    d = r.json()
    assert [x["plan"]["id"] if x["plan"] else None for x in d["days"]] == ["tpl_leg", None, None, "tpl_back", None, None, None]
    ov = client.get("/api/dashboard", headers=auth).json()
    assert "insights" in ov and "schedule_today" in ov
    assert isinstance(client.get("/api/insights", headers=auth).json(), list)

    m = client.post("/api/nutrition/meals", headers=auth, json={"name": "Phở bò", "calories": 450, "protein": 25, "analysis": "ok"}).json()
    client.post("/api/nutrition/meals", headers=auth, json={"name": "phở bò", "calories": 450, "protein": 25})
    rec = client.get("/api/nutrition/recent", headers=auth).json()
    assert len(rec) == 1  # không trùng tên
    copy = client.post(f"/api/nutrition/meals/{m['id']}/repeat", headers=auth, json={"meal_type": "dinner"}).json()
    assert copy["meal_type"] == "dinner" and copy["analysis"] == "ok"


def test_chat_daily_limit(client, auth, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "chat_daily_limit", 0)
    r = client.post("/api/chat/send", headers=auth, json={"text": "hi"})
    assert r.status_code == 429


def test_change_password(client):
    r = client.post("/api/auth/register", json={"email": "pw@test.vn", "password": "matkhau1", "name": "Hà"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.put("/api/me/password", headers=h, json={"current_password": "sai", "new_password": "matkhau2"}).status_code == 400
    assert client.put("/api/me/password", headers=h, json={"current_password": "matkhau1", "new_password": "matkhau1"}).status_code == 400
    assert client.put("/api/me/password", headers=h, json={"current_password": "matkhau1", "new_password": "123"}).status_code == 422
    assert client.put("/api/me/password", headers=h, json={"current_password": "matkhau1", "new_password": "matkhau2"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "pw@test.vn", "password": "matkhau1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "pw@test.vn", "password": "matkhau2"}).status_code == 200


def test_update_custom_plan(client, auth):
    items = [{"exercise_id": "0043", "sets": 3, "reps": 10, "rest_sec": 90}]
    p = client.post("/api/workouts/plans", headers=auth, json={"name": "Chân A", "focus": "legs", "items": items}).json()
    items.append({"exercise_id": "0001", "sets": 2, "reps": 12, "rest_sec": 60})
    r = client.put(f"/api/workouts/plans/{p['id']}", headers=auth, json={"name": "Chân B", "focus": "legs", "items": items})
    assert r.status_code == 200 and r.json()["name"] == "Chân B" and len(r.json()["items"]) == 2
    # chương trình có sẵn không sửa được; buổi của người khác cũng không
    assert client.put("/api/workouts/plans/tpl_leg", headers=auth, json={"name": "x", "items": items}).status_code == 404
    other = client.post("/api/auth/register", json={"email": "khac@test.vn", "password": "secret123", "name": "B"}).json()["token"]
    assert client.put(f"/api/workouts/plans/{p['id']}", headers={"Authorization": f"Bearer {other}"}, json={"name": "x", "items": items}).status_code == 404
    # buổi giãn cơ (focus mobility) giữ kiểu "tự chọn bài"
    m = client.post("/api/workouts/plans", headers=auth, json={"name": "Giãn", "focus": "mobility", "items": items}).json()
    assert m["optional"] is True


def test_auto_camera_setting(client, auth):
    assert client.get("/api/me", headers=auth).json()["profile"]["settings"]["auto_camera"] is True
    r = client.put("/api/profile/settings", headers=auth, json={"auto_camera": False})
    assert r.status_code == 200 and r.json()["settings"]["auto_camera"] is False


def _session(client, auth, sets, plan_id="tpl_leg"):
    """Tạo 1 buổi tập với danh sách set (dict) rồi kết thúc."""
    s = client.post("/api/workouts/sessions", headers=auth, json={"plan_id": plan_id, "name": "Test"}).json()
    out = [client.post(f"/api/workouts/sessions/{s['id']}/sets", headers=auth, json=x).json() for x in sets]
    fin = client.post(f"/api/workouts/sessions/{s['id']}/finish", headers=auth, json={}).json()
    return s["id"], out, fin


def test_edit_delete_set_and_warmup(client, auth):
    sid, sets, fin = _session(client, auth, [
        {"exercise_id": "0043", "set_index": 1, "weight_kg": 20, "reps": 10, "is_warmup": True},
        {"exercise_id": "0043", "set_index": 1, "weight_kg": 600, "reps": 8},  # gõ nhầm 60 → 600
        {"exercise_id": "0043", "set_index": 2, "weight_kg": 60, "reps": 8},
    ])
    assert sets[0]["is_warmup"] and sets[0]["is_pr"] is False
    # set khởi động không tính khối lượng
    assert fin["total_volume"] == 600 * 8 + 60 * 8
    assert client.get("/api/workouts/prs", headers=auth).json()[0]["weight_kg"] == 600
    # sửa set nhầm → kỷ lục và khối lượng tính lại
    r = client.put(f"/api/workouts/sessions/{sid}/sets/{sets[1]['id']}", headers=auth, json={"weight_kg": 60})
    assert r.status_code == 200 and r.json()["weight_kg"] == 60
    assert client.get(f"/api/workouts/sessions/{sid}", headers=auth).json()["total_volume"] == 60 * 8 * 2
    assert client.get("/api/workouts/prs", headers=auth).json()[0]["weight_kg"] == 60
    # xoá set → khối lượng giảm
    client.delete(f"/api/workouts/sessions/{sid}/sets/{sets[2]['id']}", headers=auth)
    assert client.get(f"/api/workouts/sessions/{sid}", headers=auth).json()["total_volume"] == 60 * 8
    # set khởi động không vào bản đồ cơ
    hm = client.get("/api/dashboard/heatmap?days=7", headers=auth).json()
    assert hm["muscles"]["glutes"]["sets"] == 1


def test_overload_uses_plan_target(client, auth):
    _session(client, auth, [{"exercise_id": "0043", "set_index": i, "weight_kg": 80, "reps": 5} for i in (1, 2, 3)])
    # chương trình 5 rep: đủ rep → tăng tạ (trước đây luôn so với 10 rep → "giữ tạ")
    assert client.get("/api/exercises/0043?target_reps=5", headers=auth).json()["overload"]["weight_kg"] == 82.5
    assert client.get("/api/exercises/0043?target_reps=8", headers=auth).json()["overload"]["weight_kg"] == 80
    # bài giữ: gợi ý theo giây
    _session(client, auth, [{"exercise_id": "0464", "set_index": 1, "duration_sec": 40}], plan_id="tpl_core")
    o = client.get("/api/exercises/0464?target_sec=40", headers=auth).json()["overload"]
    assert o["duration_sec"] == 45 and o["reps"] == 0


def test_bodyweight_and_time_prs(client, auth):
    _session(client, auth, [{"exercise_id": "3294", "set_index": 1, "reps": 12}, {"exercise_id": "0464", "set_index": 1, "duration_sec": 40}])
    prs = {p["exercise_id"]: p for p in client.get("/api/workouts/prs", headers=auth).json()}
    assert prs["3294"]["kind"] == "reps" and prs["3294"]["value"] == 12 and prs["3294"]["e1rm"] is None
    assert prs["0464"]["kind"] == "time" and prs["0464"]["unit"] == "giây"
    s = client.post("/api/workouts/sessions", headers=auth, json={"name": "Lần 2"}).json()
    r = client.post(f"/api/workouts/sessions/{s['id']}/sets", headers=auth, json={"exercise_id": "3294", "set_index": 1, "reps": 15}).json()
    assert r["is_pr"] and r["pr_kind"] == "reps" and r["previous_best"] == 12
    fin = client.post(f"/api/workouts/sessions/{s['id']}/finish", headers=auth, json={}).json()
    assert fin["prs"][0]["value"] == 15


def test_goal_auto_achieved_and_metric_edit(client, auth):
    client.post("/api/body/metrics", headers=auth, json={"weight_kg": 70})
    g = client.post("/api/goals", headers=auth, json={"title": "Về 66kg", "metric": "weight_kg", "target_value": 66}).json()
    m2 = client.post("/api/body/metrics", headers=auth, json={"weight_kg": 65.5}).json()
    assert client.get("/api/profile", headers=auth).json()["weight_kg"] == 65.5
    goal = next(x for x in client.get("/api/goals", headers=auth).json() if x["id"] == g["id"])
    assert goal["status"] == "achieved" and goal["progress_pct"] == 100
    # đã đạt rồi thì lần sau không báo "vừa đạt" nữa
    assert not next(x for x in client.get("/api/goals", headers=auth).json() if x["id"] == g["id"])["just_achieved"]
    # sửa lần cân → hồ sơ cập nhật theo
    r = client.put(f"/api/body/metrics/{m2['id']}", headers=auth, json={"weight_kg": 67})
    assert r.status_code == 200 and client.get("/api/profile", headers=auth).json()["weight_kg"] == 67
    # xoá lần cân mới nhất → hồ sơ quay về lần cân còn lại mới nhất (cùng ngày: lần nhập trước đó)
    client.delete(f"/api/body/metrics/{m2['id']}", headers=auth)
    assert client.get("/api/profile", headers=auth).json()["weight_kg"] == 70


def test_copy_day_and_favorites(client, auth):
    import datetime as dt
    y = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    a = client.post("/api/nutrition/meals", headers=auth, json={"date": y, "meal_type": "breakfast", "name": "Bánh mì trứng", "calories": 400, "protein": 18}).json()
    client.post("/api/nutrition/meals", headers=auth, json={"date": y, "meal_type": "lunch", "name": "Cơm gà", "calories": 650, "protein": 35})
    r = client.post("/api/nutrition/copy-day", headers=auth, json={"from_date": y, "meal_types": ["breakfast"]}).json()
    assert r["copied"] == 1
    r = client.post("/api/nutrition/copy-day", headers=auth, json={"from_date": y}).json()
    assert r["copied"] == 2
    assert client.post("/api/nutrition/copy-day", headers=auth, json={"from_date": "2001-01-01"}).status_code == 404
    favs = client.post(f"/api/nutrition/meals/{a['id']}/favorite", headers=auth).json()["favorites"]
    assert favs[0]["name"] == "Bánh mì trứng"
    # thêm lại cùng món không bị trùng
    assert len(client.post(f"/api/nutrition/meals/{a['id']}/favorite", headers=auth).json()["favorites"]) == 1
    logged = client.post(f"/api/nutrition/favorites/{a['id']}/log", headers=auth, json={}).json()
    assert logged["calories"] == 400
    # món yêu thích không lộ trong cài đặt hồ sơ, và đổi cài đặt không làm mất món yêu thích
    assert "favorite_meals" not in client.get("/api/profile", headers=auth).json()["settings"]
    client.put("/api/profile/settings", headers=auth, json={"voice_coach": False})
    assert len(client.get("/api/nutrition/favorites", headers=auth).json()) == 1
    client.delete(f"/api/nutrition/favorites/{a['id']}", headers=auth)
    assert client.get("/api/nutrition/favorites", headers=auth).json() == []


def test_calorie_cycling(client, auth):
    import datetime as dt
    base = client.get("/api/nutrition/day", headers=auth).json()["targets"]
    assert base["day_type"] is None and base["adjust_kcal"] == 0
    wd = dt.date.today().weekday()
    # hôm nay nghỉ theo lịch (lịch có buổi vào ngày khác)
    client.put("/api/schedule", headers=auth, json={"days": {str((wd + 1) % 7): {"plan_id": "tpl_leg"}}})
    rest = client.get("/api/nutrition/day", headers=auth).json()["targets"]
    assert rest["day_type"] == "rest" and rest["calories"] == base["calories"] - 150
    assert rest["protein"] == base["protein"]
    client.put("/api/schedule", headers=auth, json={"days": {str(wd): {"plan_id": "tpl_leg"}}})
    train = client.get("/api/dashboard", headers=auth).json()["today"]["targets"]
    assert train["day_type"] == "train" and train["calories"] == base["calories"] + 150
    client.put("/api/profile/settings", headers=auth, json={"calorie_cycling": False})
    assert client.get("/api/nutrition/day", headers=auth).json()["targets"]["calories"] == base["calories"]


def test_stale_session_auto_closed_with_real_duration(client, auth):
    import datetime as dt

    from app.db import SessionLocal
    from app.models import WorkoutSession

    s = client.post("/api/workouts/sessions", headers=auth, json={"plan_id": "tpl_leg", "name": "Bỏ dở"}).json()
    client.post(f"/api/workouts/sessions/{s['id']}/sets", headers=auth, json={"exercise_id": "0043", "set_index": 1, "weight_kg": 60, "reps": 8})
    # giả lập: bắt đầu và ghi set từ 20 giờ trước rồi quên bấm Kết thúc
    with SessionLocal() as db:
        ws = db.get(WorkoutSession, s["id"])
        ago = dt.timedelta(hours=20)
        ws.started_at -= ago
        for x in ws.sets:
            x.created_at -= ago
        db.commit()
    assert client.get("/api/workouts/active", headers=auth).json() is None
    done = client.get(f"/api/workouts/sessions/{s['id']}", headers=auth).json()
    assert done["status"] == "completed" and done["duration_sec"] < 30 * 60  # không phải 20 tiếng
    assert "bỏ dở" in done["notes"]


def test_ai_tools_daily_quota(client, auth, monkeypatch):
    from app.agents import analyzers
    from app.config import get_settings

    async def fake_meal(db, user, image=None, text=None):
        return {"name": "Phở", "items": [], "calories": 450, "protein": 25, "carbs": 60, "fat": 10, "confidence": "high", "analysis": "ok"}

    monkeypatch.setattr(analyzers, "analyze_meal", fake_meal)
    monkeypatch.setattr(get_settings(), "ai_tools_daily_limit", 2)
    for _ in range(2):
        assert client.post("/api/nutrition/analyze", headers=auth, json={"text": "1 bát phở"}).status_code == 200
    r = client.post("/api/nutrition/analyze", headers=auth, json={"text": "1 bát phở"})
    assert r.status_code == 429 and "lượt" in r.json()["detail"]
    # hết lượt AI: gợi ý bài vẫn chạy bằng luật, không lỗi
    sug = client.post("/api/workouts/suggest", headers=auth, json={"muscle": "biceps"}).json()
    assert sug["method"] == "rules" and sug["exercises"]


def test_no_future_dates(client, auth):
    import datetime as dt
    tomorrow = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    assert client.post("/api/nutrition/meals", headers=auth, json={"date": tomorrow, "name": "x", "calories": 100}).status_code == 400
    assert client.post("/api/body/metrics", headers=auth, json={"date": tomorrow, "weight_kg": 60}).status_code == 400


def test_wipe_clears_favorites_and_export_has_schedule(client, auth):
    m = client.post("/api/nutrition/meals", headers=auth, json={"name": "Xôi", "calories": 400}).json()
    client.post(f"/api/nutrition/meals/{m['id']}/favorite", headers=auth)
    client.put("/api/schedule", headers=auth, json={"days": {"0": {"plan_id": "tpl_leg"}}})
    ex = client.get("/api/data/export", headers=auth).json()
    assert ex["favorite_meals"][0]["name"] == "Xôi" and ex["weekly_schedule"][0]["plan"]
    client.post("/api/data/wipe", headers=auth, json={"confirm": "XOA"})
    assert client.get("/api/nutrition/favorites", headers=auth).json() == []


def test_goal_deadline_insight(client, auth):
    import datetime as dt
    soon = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    client.post("/api/goals", headers=auth, json={"title": "Eo 78cm", "metric": "waist_cm", "target_value": 78, "deadline": soon})
    ins = client.get("/api/insights", headers=auth).json()
    assert any("Eo 78cm" in x["title"] and "Còn 3 ngày" in x["title"] for x in ins)


def test_exercise_progress(client, auth):
    for w in (60, 62.5, 65):
        _session(client, auth, [
            {"exercise_id": "0043", "set_index": 1, "weight_kg": 20, "reps": 10, "is_warmup": True},
            {"exercise_id": "0043", "set_index": 1, "weight_kg": w, "reps": 8},
            {"exercise_id": "0043", "set_index": 2, "weight_kg": w, "reps": 8},
        ])
    p = client.get("/api/exercises/0043/progress", headers=auth).json()
    assert p["kind"] == "weight" and p["sessions"] == 3
    assert [x["top_weight"] for x in p["points"]] == [60, 62.5, 65]  # set khởi động 20kg không tính
    assert p["points"][0]["sets"] == 2 and p["change"] > 0 and p["change_pct"] > 0
    empty = client.get("/api/exercises/0025/progress", headers=auth).json()
    assert empty["points"] == [] and empty["kind"] is None
    assert client.get("/api/exercises/khong-co/progress", headers=auth).status_code == 404
