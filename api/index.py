"""Điểm vào FastAPI cho Vercel (Python function).

Vercel chuyển mọi request /api/* vào đây (xem vercel.json); giao diện React được build và phục vụ qua CDN.
- Khi chưa cấu hình DATABASE_URL (PostgreSQL), dùng SQLite tạm ở /tmp: dữ liệu KHÔNG bền, mất khi
  function khởi động lại → chỉ phù hợp để demo. Khi đó tài khoản demo được tạo tự động mỗi lần khởi động.
- Khi có DATABASE_URL (vd Supabase), dữ liệu bền; tài khoản demo chỉ tạo nếu chưa có.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

if not os.environ.get("DATABASE_URL") and not os.environ.get("SUPABASE_DB_URL"):
    os.environ["DATABASE_URL"] = "sqlite:////tmp/fitbro.db"

# Tài khoản demo luôn "kết thúc ở hôm nay": tạo khi chưa có, làm mới khi sang ngày mới
# (lúc khởi động và ở request đầu tiên của mỗi ngày — xem app/main.py). Tắt bằng SEED_DEMO=false.
if os.environ.get("SEED_DEMO", "true").lower() == "true":
    os.environ.setdefault("DEMO_AUTO_REFRESH", "true")

from app.db import init_db  # noqa: E402
from app.main import app, refresh_demo_if_stale  # noqa: E402,F401

init_db()
refresh_demo_if_stale()
