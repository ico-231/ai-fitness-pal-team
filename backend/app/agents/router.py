"""Router (Supervisor) — quyết định agent nào xử lý tin nhắn.

Ưu tiên: (1) người dùng chọn agent cụ thể → (2) LLM phân loại (JSON) → (3) luật từ khoá dự phòng.
"""
from __future__ import annotations

import logging
import re

from ..config import get_settings
from . import llm
from .guard import _plain
from .prompts import ROUTER_PROMPT

log = logging.getLogger("fitbro.router")

VALID = ("headbro", "coachbro", "nutribro")

_KW = {
    "nutribro": [r"\ban\b", r"bua", r"mon", r"calo", r"kcal", r"protein", r"\bdam\b", r"macro", r"tinh bot", r"carb",
                 r"chat beo", r"thuc don", r"dinh duong", r"uong", r"nuoc", r"whey", r"creatine", r"pho", r"com", r"bun",
                 r"trai cay", r"sua", r"an kieng", r"diet", r"meal", r"food", r"nutri"],
    "coachbro": [r"tap", r"bai", r"workout", r"gym", r"squat", r"deadlift", r"bench", r"push", r"pull", r"set", r"rep",
                 r"\bta\b", r"giao an", r"lich tap", r"nhom co", r"\bco (tay|nguc|lung|chan|bung|vai|mong)", r"tay", r"nguc",
                 r"lung", r"chan", r"mong", r"vai", r"bung", r"cardio", r"hiit", r"chay bo", r"gian co", r"form", r"ky thuat",
                 r"\bpr\b", r"coach",
                 # hoạt động ngoài gym (M8)
                 r"dap xe", r"xe dap", r"di bo", r"\bboi\b(?! vi)", r"da bong", r"da banh", r"cau long", r"pickleball",
                 r"tennis", r"bong ro", r"bong chuyen", r"yoga", r"\bchay\b", r"van dong", r"hoat dong", r"buoc chan", r"leo nui", r"kayak"],
    "headbro": [r"muc tieu", r"san sang", r"readiness", r"inbody", r"can nang", r"\bmo\b", r"tien do", r"bao cao",
                r"dashboard", r"tong quan", r"dong luc", r"streak", r"chao", r"hello", r"\bhi\b", r"ban la ai", r"head"],
}


def _scores(text: str) -> dict[str, int]:
    p = _plain(text)
    return {a: sum(1 for k in kws if re.search(k, p)) for a, kws in _KW.items()}


def clear_keyword_winner(text: str) -> str | None:
    """Câu hỏi rõ ràng (1 agent có ≥2 từ khoá, các agent khác 0) → không cần gọi LLM để định tuyến."""
    sc = _scores(text)
    best = max(sc, key=lambda a: sc[a])
    others = [v for a, v in sc.items() if a != best]
    return best if sc[best] >= 2 and max(others) == 0 else None


def keyword_route(text: str, last_agent: str | None = None) -> dict:
    p = _plain(text)
    scores = _scores(text)
    best = max(scores, key=lambda a: scores[a])
    if scores[best] == 0:
        agent = last_agent if last_agent in VALID and len(p.split()) <= 6 else "headbro"
        return {"agents": [agent], "reason": "Không rõ chủ đề — chuyển cho HeadBro" if agent == "headbro" else "Câu hỏi tiếp nối lượt trước", "offtopic": False, "method": "keyword"}
    agents = [best]
    # cả tập và ăn đều mạnh → 2 agent
    if best in ("coachbro", "nutribro"):
        other = "nutribro" if best == "coachbro" else "coachbro"
        if scores[other] >= 2 and scores[best] >= 2:
            agents.append(other)
    return {"agents": agents, "reason": "Phân loại theo từ khoá", "offtopic": False, "method": "keyword"}


async def route(text: str, history: list[dict], last_agent: str | None, has_image: bool, page: str | None) -> dict:
    s = get_settings()
    if has_image:
        agent = "headbro" if page == "inbody" else "nutribro"
        return {"agents": [agent], "reason": "Có ảnh đính kèm → " + ("đọc phiếu InBody" if agent == "headbro" else "phân tích món ăn"), "offtopic": False, "method": "rule"}
    if not s.ai_enabled:
        return keyword_route(text, last_agent)
    fast = clear_keyword_winner(text)
    if fast:  # tiết kiệm 1 lượt gọi model (quan trọng với gói API miễn phí)
        return {"agents": [fast], "reason": "Chủ đề rõ ràng theo từ khoá", "offtopic": False, "method": "keyword"}

    recent = "\n".join(f"{h['role']}{'(' + h['agent'] + ')' if h.get('agent') else ''}: {h['content'][:200]}" for h in history[-4:])
    user = f"Trang người dùng đang mở: {page or 'không rõ'}\nAgent trả lời lượt trước: {last_agent or 'không có'}\n\nLịch sử gần đây:\n{recent or '(trống)'}\n\nTin nhắn MỚI NHẤT: {text}"
    try:
        data = await llm.complete_json(
            [{"role": "system", "content": ROUTER_PROMPT}, {"role": "user", "content": user}],
            model=s.router_model, temperature=0, max_tokens=150, purpose="router",
        )
        agents = [a for a in data.get("agents", []) if a in VALID]
        agents = list(dict.fromkeys(agents))[:2]
        if not agents:
            raise ValueError("empty")
        # Kiểm tra chéo: câu hỏi có cả "tập" và "ăn" mà LLM chọn 2 agent sai cặp → sửa thành CoachBro + NutriBro
        sc = _scores(text)
        if len(agents) == 2 and set(agents) != {"coachbro", "nutribro"} and sc["coachbro"] >= 1 and sc["nutribro"] >= 1:
            agents = ["coachbro", "nutribro"]
        return {"agents": agents, "reason": str(data.get("reason", ""))[:160], "offtopic": bool(data.get("offtopic")), "method": "llm"}
    except Exception as e:
        log.warning("Router LLM failed, fallback keyword: %s", e)
        return keyword_route(text, last_agent)
