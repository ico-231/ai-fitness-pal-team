"""Kết nối database bằng SQLAlchemy 2.0 (SQLite khi dev, Postgres khi deploy)."""
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    # Một số nhà cung cấp (Render, Heroku) trả về "postgres://" — chuẩn hoá lại.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]

    if url.startswith("sqlite"):
        eng = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(eng, "connect")
        def _sqlite_pragma(dbapi_conn, _):  # bật khoá ngoại + WAL cho SQLite
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

        return eng
    if "pooler.supabase.com" in url or ":6543/" in url:
        # Supabase pooler (Supavisor, chế độ transaction): không giữ kết nối riêng giữa các lệnh nên
        # không dùng được prepared statement → tắt (prepare_threshold=None). Pooler đã lo việc gộp
        # kết nối, phía app không cần pool riêng (hợp với Vercel serverless).
        from sqlalchemy.pool import NullPool

        return create_engine(url, poolclass=NullPool, connect_args={"prepare_threshold": None})
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (đăng ký các bảng)

    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
    _lock_supabase_rest()


def _lock_supabase_rest() -> None:
    """Supabase mở mọi bảng trong schema public qua REST API công khai (khoá anon) nếu chưa bật RLS.
    FitBro không dùng API đó → bật RLS, không tạo policy nào = chặn hết truy cập qua REST.
    Backend kết nối bằng tài khoản chủ bảng (postgres) nên vẫn đọc/ghi bình thường. Chạy lại nhiều lần vẫn an toàn."""
    if engine.dialect.name != "postgresql" or "supabase" not in str(engine.url.host or ""):
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        for t in Base.metadata.sorted_tables:
            conn.execute(text(f'ALTER TABLE "{t.name}" ENABLE ROW LEVEL SECURITY'))


# Cột thêm sau khi bảng đã tồn tại (create_all không tự thêm cột vào bảng cũ, kể cả trên Neon).
# Mỗi dòng: (bảng, cột, kiểu SQL kèm mặc định). Chạy lại nhiều lần vẫn an toàn.
_LATE_COLUMNS = [
    ("workout_sets", "is_warmup", "BOOLEAN NOT NULL DEFAULT FALSE"),
]


def _add_missing_columns() -> None:
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, col, ddl in _LATE_COLUMNS:
            if table in tables and col not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
