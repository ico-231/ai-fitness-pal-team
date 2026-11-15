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

if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "sqlite:////tmp/fitbro.db"

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402,F401
from app.models import User  # noqa: E402

init_db()
if os.environ.get("SEED_DEMO", "true").lower() == "true":
    _db = SessionLocal()
    try:
        _has_demo = _db.scalars(select(User.id).where(User.email == "demo@fitbro.vn")).first()
    finally:
        _db.close()
    if not _has_demo:
        import seed_demo  # noqa: E402

        seed_demo.main()
