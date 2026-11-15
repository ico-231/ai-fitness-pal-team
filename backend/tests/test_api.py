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
