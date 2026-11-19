"""Hạn mức AI: tài khoản demo có mức trần CAO (không phải không giới hạn), người dùng thường giữ mức mặc định."""
from app.config import get_settings
from app.models import User
from app.services import quota


def test_demo_has_high_but_finite_caps():
    demo = User(email="Demo@FitBro.vn", name="Demo", password_hash="x")
    normal = User(email="ban@email.com", name="Bạn", password_hash="x")
    s = get_settings()
    assert quota.chat_limit(demo) == quota.DEMO_CHAT_LIMIT > s.chat_daily_limit
    assert quota.chat_limit(normal) == s.chat_daily_limit
    assert quota.DEMO_TOOLS_LIMIT > s.ai_tools_daily_limit
    assert quota.DEMO_CHAT_LIMIT < 10_000 and quota.DEMO_TOOLS_LIMIT < 10_000  # vẫn có trần
