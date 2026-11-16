"""Kiểm thử hệ thống multi-agent với LLM GIẢ LẬP (không tốn tiền, kết quả xác định).

Giả lập cho phép kiểm tra: router chọn đúng agent, agent gọi đúng tool, thẻ (card) hiển thị,
human-in-the-loop (xác nhận mới ghi DB), cộng tác 2 agent + tổng kết, guard chặn trước LLM.
"""
import json

import pytest

from app.agents import llm


def sse_events(resp) -> list[dict]:
    return [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith("data: ")]


def which_agent(messages) -> str:
    sys = messages[0]["content"]
    if "TỔNG KẾT" in sys:
        return "synth"
    for name in ("HeadBro", "CoachBro", "NutriBro"):
        if sys.startswith(f"Bạn là {name}"):
            return name.lower()
    return "synth" if "TỔNG KẾT" in sys else "unknown"


class FakeLLM:
    """scripts[agent] = danh sách lượt; mỗi lượt là ("text", "...") hoặc ("tool", name, args)."""

    def __init__(self, route: list[str], scripts: dict):
        self.route = route
        self.scripts = {k: list(v) for k, v in scripts.items()}
        self.calls: list[str] = []
        self.tools_seen: dict[str, list[str]] = {}

    async def complete_json(self, messages, **kw):
        if "TIẾP THEO" in messages[0]["content"]:
            self.calls.append("followups")
            return {"questions": ["Câu hỏi 1", "Câu hỏi 2", "Câu hỏi 3"]}
        self.calls.append("router")
        return {"agents": self.route, "reason": "test", "offtopic": False}

    async def stream(self, messages, tools=None, model=None, temperature=None, vision=False):
        agent = which_agent(messages)
        self.calls.append(agent)
        if tools:
            self.tools_seen[agent] = [t["function"]["name"] for t in tools]
        step = self.scripts.get(agent, [("text", f"Trả lời từ {agent}")])
        turn = step.pop(0) if step else ("text", f"Kết luận của {agent}")
        res = llm.StreamResult()
        if turn[0] == "text":
            for chunk in (turn[1][: len(turn[1]) // 2], turn[1][len(turn[1]) // 2:]):
                res.text += chunk
                yield ("text", chunk)
        else:
            res.tool_calls.append(llm.ToolCall(id=f"c{len(self.calls)}", name=turn[1], arguments=turn[2], raw_arguments=json.dumps(turn[2])))
        yield ("done", res)


@pytest.fixture
def fake(monkeypatch):
    def install(route, scripts):
        f = FakeLLM(route, scripts)
        monkeypatch.setattr(llm, "complete_json", f.complete_json)
        monkeypatch.setattr(llm, "stream", f.stream)
        return f

    return install


def test_coach_uses_tools_and_shows_exercise_cards(client, auth, fake):
    f = fake(["coachbro"], {"coachbro": [
        ("tool", "search_exercises", {"focus": "arms", "limit": 4}),
        ("text", "Hôm nay tập tay nhé, mình đã lọc 4 bài phía dưới."),
    ]})
    r = client.post("/api/chat/send", headers=auth, json={"text": "hôm nay tôi muốn tập tay"})
    ev = sse_events(r)
    types = [e["type"] for e in ev]
    assert types[0] == "conversation" and types[-1] == "done"
    route = next(e for e in ev if e["type"] == "route")
    assert route["agents"] == ["coachbro"]
    assert any(e["type"] == "tool_call" and e["name"] == "search_exercises" for e in ev)
    card = next(e for e in ev if e["type"] == "card")["card"]
    assert card["kind"] == "exercises" and len(card["items"]) == 4 and card["items"][0]["gif"]
    msg = next(e for e in ev if e["type"] == "agent_message")
    assert msg["agent"] == "coachbro" and "tập tay" in msg["content"]
    # Phân quyền: CoachBro không có tool ghi bữa ăn
    assert "propose_meal_log" not in f.tools_seen["coachbro"]
    assert "create_workout_plan" in f.tools_seen["coachbro"]
    # Lịch sử được lưu
    cid = ev[0]["id"]
    conv = client.get(f"/api/chat/conversations/{cid}", headers=auth).json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant"]
    assert conv["messages"][1]["meta"]["cards"][0]["kind"] == "exercises"


def test_coach_creates_named_plan(client, auth, fake):
    fake(["coachbro"], {"coachbro": [
        ("tool", "create_workout_plan", {"name": "Arm Workout", "focus": "arms", "items": [
            {"exercise_id": "0031", "sets": 3, "reps": 10}, {"exercise_id": "0241", "sets": 3, "reps": 12},
            {"exercise_id": "khong-ton-tai", "sets": 3},
        ]}),
        ("text", "Mình đã tạo Arm Workout."),
    ]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "tạo buổi tập tay 45 phút"}))
    plan = next(e for e in ev if e["type"] == "card")["card"]["plan"]
    assert plan["name"] == "Arm Workout" and len(plan["items"]) == 2  # id bịa bị loại
    plans = client.get("/api/workouts/plans", headers=auth).json()
    assert plans[0]["source"] == "ai"


def test_nutri_human_in_the_loop(client, auth, fake):
    fake(["nutribro"], {"nutribro": [
        ("tool", "propose_meal_log", {"name": "Phở bò", "meal_type": "lunch", "calories": 450, "protein": 25, "carbs": 60, "fat": 12,
                                       "analysis": "Đủ đạm cho bữa trưa."}),
        ("text", "Bạn bấm Xác nhận để lưu bữa phở nhé."),
    ]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "trưa nay ăn 1 tô phở bò"}))
    card = next(e for e in ev if e["type"] == "card")["card"]
    assert card["kind"] == "confirm" and card["status"] == "pending"
    # chưa xác nhận → chưa có trong nhật ký
    assert client.get("/api/nutrition/day", headers=auth).json()["meals"] == []
    r = client.post(f"/api/chat/actions/{card['action_id']}/confirm", headers=auth, json={}).json()
    assert r["status"] == "confirmed"
    meals = client.get("/api/nutrition/day", headers=auth).json()["meals"]
    assert meals[0]["name"] == "Phở bò" and meals[0]["analysis"] == "Đủ đạm cho bữa trưa."
    # xác nhận 2 lần bị chặn; trạng thái thẻ trong lịch sử được cập nhật
    assert client.post(f"/api/chat/actions/{card['action_id']}/confirm", headers=auth, json={}).status_code == 409
    conv = client.get(f"/api/chat/conversations/{ev[0]['id']}", headers=auth).json()
    assert conv["messages"][1]["meta"]["cards"][0]["status"] == "confirmed"


def test_two_agents_collaborate_then_synthesis(client, auth, fake):
    f = fake(["coachbro", "nutribro"], {
        "coachbro": [("text", "Tập compound 4 buổi/tuần.")],
        "nutribro": [("text", "Ăn đủ 124g đạm mỗi ngày.")],
        "synth": [("text", "Tóm lại: tập đều và ăn đủ đạm.")],
    })
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "muốn tăng cơ thì tập và ăn thế nào"}))
    msgs = [e for e in ev if e["type"] == "agent_message"]
    assert [m["agent"] for m in msgs] == ["coachbro", "nutribro", "headbro"]
    assert msgs[2].get("synthesis") is True
    assert f.calls == ["router", "coachbro", "nutribro", "synth", "followups"]


def test_guard_blocks_before_llm(client, auth, fake):
    f = fake(["coachbro"], {})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "tôi bị đau ngực và khó thở khi chạy"}))
    msg = next(e for e in ev if e["type"] == "agent_message")
    assert msg["agent"] == "guard" and "115" in msg["content"]
    assert f.calls == []  # không gọi LLM


def test_forced_agent_skips_router(client, auth, fake):
    f = fake(["coachbro"], {"headbro": [("text", "Chào bạn, mình là HeadBro.")]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "xin chào", "agent": "headbro"}))
    assert next(e for e in ev if e["type"] == "route")["method"] == "user"
    assert f.calls == ["headbro", "followups"]
    fu = next(e for e in ev if e["type"] == "followups")
    assert len(fu["items"]) == 3


def test_tools_not_supported_fallback(client, auth, monkeypatch):
    calls = {"n": 0}

    async def router_json(messages, **kw):
        return {"agents": ["nutribro"], "reason": "t"}

    async def stream(messages, tools=None, model=None, temperature=None, vision=False):
        calls["n"] += 1
        if tools:
            raise llm.ToolsNotSupported("tools are not supported")
        assert "DỮ LIỆU ĐÃ NẠP SẴN" in messages[0]["content"]
        r = llm.StreamResult(text="Hôm nay bạn chưa ghi bữa nào.")
        yield ("text", r.text)
        yield ("done", r)

    monkeypatch.setattr(llm, "complete_json", router_json)
    monkeypatch.setattr(llm, "stream", stream)
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "hôm nay tôi ăn đủ chưa"}))
    assert next(e for e in ev if e["type"] == "agent_message")["content"] == "Hôm nay bạn chưa ghi bữa nào."
    assert calls["n"] == 2


def test_keyword_router_fallback():
    from app.agents.router import keyword_route

    assert keyword_route("hôm nay ăn gì để đủ protein")["agents"] == ["nutribro"]
    assert keyword_route("bài tập cho tay sau")["agents"] == ["coachbro"]
    assert keyword_route("đặt mục tiêu giảm cân")["agents"] == ["headbro"]


def test_memory_is_saved_and_injected(client, auth, fake):
    fake(["nutribro"], {"nutribro": [
        ("tool", "remember", {"content": "Dị ứng hải sản", "category": "health"}),
        ("text", "Mình đã ghi nhớ bạn dị ứng hải sản."),
    ]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "mình bị dị ứng hải sản nhé"}))
    assert next(e for e in ev if e["type"] == "card")["card"]["kind"] == "memory"
    mems = client.get("/api/memories", headers=auth).json()
    assert mems[0]["content"] == "Dị ứng hải sản" and mems[0]["source"] == "nutribro"

    seen = {}

    async def stream(messages, tools=None, model=None, temperature=None, vision=False):
        seen["sys"] = messages[0]["content"]
        r = llm.StreamResult(text="ok")
        yield ("text", "ok")
        yield ("done", r)

    import app.agents.llm as L
    old = L.stream
    L.stream = stream
    try:
        client.post("/api/chat/send", headers=auth, json={"text": "gợi ý bữa tối", "agent": "nutribro"})
    finally:
        L.stream = old
    assert "Dị ứng hải sản" in seen["sys"] and "TRÍ NHỚ DÀI HẠN" in seen["sys"]
    assert client.delete(f"/api/memories/{mems[0]['id']}", headers=auth).json()["ok"]


def test_coach_weekly_schedule_needs_confirmation(client, auth, fake):
    fake(["coachbro"], {"coachbro": [
        ("tool", "propose_weekly_schedule", {"days": [
            {"weekday": 0, "plan_id": "tpl_chest"}, {"weekday": 2, "plan_id": "tpl_leg"}, {"weekday": 4, "plan_id": "khong-co"},
        ], "note": "Đẩy/chân xen ngày nghỉ"}),
        ("text", "Bạn bấm Xác nhận để lưu lịch."),
    ]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "lên lịch tập tuần cho mình"}))
    card = next(e for e in ev if e["type"] == "card")["card"]
    assert card["action_type"] == "save_schedule" and "Chest Workout" in card["summary"]
    assert client.get("/api/schedule", headers=auth).json()["has_schedule"] is False
    client.post(f"/api/chat/actions/{card['action_id']}/confirm", headers=auth, json={})
    sch = client.get("/api/schedule", headers=auth).json()
    assert sch["days"][0]["plan"]["name"] == "Chest Workout" and sch["days"][2]["plan"]["id"] == "tpl_leg"
    assert sch["days"][4]["rest"] is True  # plan_id bịa bị loại


def test_nutri_meal_plan_card(client, auth, fake):
    fake(["nutribro"], {"nutribro": [
        ("tool", "create_meal_plan", {"title": "Thực đơn tăng cơ", "meals": [
            {"meal_type": "breakfast", "food_id": "yen_mach"}, {"meal_type": "lunch", "food_id": "com_ga"},
            {"meal_type": "dinner", "food_id": "uc_ga", "servings": 2}, {"meal_type": "snack", "custom": {"name": "Sữa chua + chuối", "calories": 165, "protein": 4.8}},
        ]}),
        ("text", "Đây là thực đơn cho bạn."),
    ]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "lên thực đơn hôm nay"}))
    card = next(e for e in ev if e["type"] == "card")["card"]
    assert card["kind"] == "mealplan" and len(card["items"]) == 4
    assert card["totals"]["calories"] == 220 + 600 + 330 + 165


def test_regenerate_and_edit_question(client, auth, fake):
    fake(["headbro"], {"headbro": [("text", "Trả lời lần 1"), ("text", "Trả lời câu thứ hai"), ("text", "Trả lời lần 2"), ("text", "Trả lời câu đã sửa")]})
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"text": "câu hỏi gốc"}))
    cid, uid = ev[0]["id"], ev[0]["user_message_id"]
    # thêm 1 lượt nữa để kiểm tra "xoá tin đó và mọi tin sau nó"
    sse_events(client.post("/api/chat/send", headers=auth, json={"conversation_id": cid, "text": "câu thứ hai"}))
    assert len(client.get(f"/api/chat/conversations/{cid}", headers=auth).json()["messages"]) == 4
    # Tạo lại câu trả lời cho câu hỏi gốc: lịch sử còn đúng 1 cặp hỏi–đáp mới
    ev = sse_events(client.post("/api/chat/send", headers=auth, json={"conversation_id": cid, "text": "câu hỏi gốc", "replace_from": uid}))
    msgs = client.get(f"/api/chat/conversations/{cid}", headers=auth).json()["messages"]
    assert [m["content"] for m in msgs] == ["câu hỏi gốc", "Trả lời lần 2"]
    # Sửa câu hỏi
    uid2 = ev[0]["user_message_id"]
    sse_events(client.post("/api/chat/send", headers=auth, json={"conversation_id": cid, "text": "câu đã sửa", "replace_from": uid2}))
    msgs = client.get(f"/api/chat/conversations/{cid}", headers=auth).json()["messages"]
    assert [m["content"] for m in msgs] == ["câu đã sửa", "Trả lời câu đã sửa"]
    # id không thuộc cuộc trò chuyện / không phải tin người dùng → 404
    assert client.post("/api/chat/send", headers=auth, json={"conversation_id": cid, "text": "x", "replace_from": "khong-co"}).status_code == 404
    assert client.post("/api/chat/send", headers=auth, json={"conversation_id": cid, "text": "x", "replace_from": msgs[1]["id"]}).status_code == 404
