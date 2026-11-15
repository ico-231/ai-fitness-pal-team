import os
import sys
import tempfile
from pathlib import Path

import pytest

# Cấu hình môi trường test TRƯỚC khi import app (DB tạm, AI "bật" nhưng sẽ bị giả lập)
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["LLM_API_KEY"] = "test-key"
os.environ["LLM_MODEL"] = "fake-model"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-1234567890"
os.environ["FRONTEND_DIST"] = str(Path(_tmp) / "no-dist")
# Ghi đè mọi giá trị trong file .env thật để test luôn độc lập với cấu hình máy
for k, v in {"LLM_FOLLOWUPS": "true", "LLM_FAST_MODEL": "", "LLM_VISION_MODEL": "", "LLM_REASONING_EFFORT": "", "LLM_FALLBACK_MODELS": "", "LLM_BACKUP_API_KEYS": "", "SECONDARY_LLM_BASE_URL": "", "SECONDARY_LLM_API_KEYS": "", "SECONDARY_LLM_MODELS": "",
             "LLM_VISION_USE_SECONDARY": "false",
             "LLM_BASE_URL": "http://localhost:9/v1", "GOOGLE_CLIENT_ID": "", "CHAT_DAILY_LIMIT": "150"}.items():
    os.environ[k] = v
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


@pytest.fixture
def auth(client):
    """Tạo 1 tài khoản mới cho mỗi test → dữ liệu độc lập."""
    _counter["n"] += 1
    r = client.post("/api/auth/register", json={"email": f"user{_counter['n']}@test.vn", "password": "secret123", "name": "Minh"})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    r = client.post("/api/profile/onboard", headers=h, json={
        "age": 20, "gender": "male", "height_cm": 172, "weight_kg": 62, "goal": "muscle", "level": "beginner",
        "activity_level": "moderate", "training_days": 4, "equipment": "gym",
    })
    assert r.status_code == 200, r.text
    return h
