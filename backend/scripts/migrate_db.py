"""Chuyển toàn bộ dữ liệu FitBro từ database này sang database khác (vd Neon → Supabase).

Cách chạy (trong thư mục backend):
    .venv/Scripts/python.exe scripts/migrate_db.py

Script hỏi 2 chuỗi kết nối bằng ô nhập ẩn (không hiện ra màn hình, không lưu vào lịch sử lệnh).
Có thể đặt sẵn biến môi trường SOURCE_DATABASE_URL / TARGET_DATABASE_URL thay vì gõ.

- Tạo đủ bảng ở database đích (giống lúc app khởi động).
- Sao chép từng bảng theo thứ tự khoá ngoại (users trước, rồi các bảng con).
- Database đích phải trống; thêm --force để XOÁ dữ liệu đang có ở đích rồi chép lại.
- Cuối cùng so số dòng từng bảng giữa nguồn và đích.
- Không bao giờ ghi vào database nguồn.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for _s in (sys.stdout, sys.stderr):  # cửa sổ lệnh Windows mặc định không in được tiếng Việt
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

from sqlalchemy import create_engine, func, inspect, select, text  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

BATCH = 500


def normalize(url: str) -> str:
    url = url.strip().strip('"').strip("'")
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def make_engine(url: str) -> Engine:
    url = normalize(url)
    if url.startswith("sqlite"):
        return create_engine(url)
    args = {"prepare_threshold": None} if ("pooler.supabase.com" in url or ":6543/" in url) else {}
    return create_engine(url, poolclass=NullPool, connect_args=args)


def safe_host(url: str) -> str:
    """Hiện host/tên DB để xác nhận, không bao giờ in mật khẩu."""
    from sqlalchemy.engine import make_url

    u = make_url(normalize(url))
    return f"{u.drivername}://{u.host or ''}{':' + str(u.port) if u.port else ''}/{u.database or ''}"


def ask(env: str, label: str) -> str:
    v = os.environ.get(env)
    if v:
        return v
    v = getpass.getpass(f"{label} (dán vào rồi Enter, sẽ không hiện ra): ")
    if not v.strip():
        sys.exit(f"Chưa nhập {label}.")
    return v


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="Xoá dữ liệu đang có ở database đích trước khi chép")
    ap.add_argument("--yes", action="store_true", help="Không hỏi xác nhận")
    a = ap.parse_args()

    src_url = ask("SOURCE_DATABASE_URL", "Chuỗi kết nối database NGUỒN (Neon)")
    dst_url = ask("TARGET_DATABASE_URL", "Chuỗi kết nối database ĐÍCH (Supabase)")
    if normalize(src_url) == normalize(dst_url):
        sys.exit("Nguồn và đích trùng nhau.")

    # Đăng ký các bảng của app
    from app import models  # noqa: F401
    from app.db import _LATE_COLUMNS, Base

    src, dst = make_engine(src_url), make_engine(dst_url)
    print(f"Nguồn: {safe_host(src_url)}")
    print(f"Đích : {safe_host(dst_url)}")

    with src.connect() as c:
        c.execute(text("select 1"))
    with dst.connect() as c:
        c.execute(text("select 1"))
    print("Kết nối được cả hai database.")

    # Tạo bảng ở đích (giống init_db) + cột thêm sau
    Base.metadata.create_all(bind=dst)
    insp = inspect(dst)
    with dst.begin() as conn:
        for table, col, ddl in _LATE_COLUMNS:
            if col not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

    if dst.dialect.name == "postgresql" and "supabase" in str(dst.url.host or ""):
        with dst.begin() as conn:  # chặn truy cập qua REST API công khai của Supabase (xem app/db.py)
            for t in Base.metadata.sorted_tables:
                conn.execute(text(f'ALTER TABLE "{t.name}" ENABLE ROW LEVEL SECURITY'))
        print("Đã bật RLS cho mọi bảng ở Supabase (chặn REST API công khai).")

    tables = Base.metadata.sorted_tables
    src_tables = set(inspect(src).get_table_names())

    with dst.connect() as c:
        busy = {t.name: c.scalar(select(func.count()).select_from(t)) for t in tables}
    if any(busy.values()) and not a.force:
        sys.exit("Database đích đã có dữ liệu: " + ", ".join(f"{k}={v}" for k, v in busy.items() if v)
                 + "\nThêm --force để xoá và chép lại.")

    if not a.yes:
        ok = input(("XOÁ dữ liệu ở đích rồi chép" if any(busy.values()) else "Chép dữ liệu") + " từ nguồn sang đích? (gõ 'co'): ")
        if ok.strip().lower() not in ("co", "có", "y", "yes"):
            sys.exit("Đã huỷ.")

    with dst.begin() as conn:
        if any(busy.values()):
            for t in reversed(tables):
                conn.execute(t.delete())
        for t in tables:
            if t.name not in src_tables:
                print(f"  {t.name:<20} (nguồn chưa có bảng này, bỏ qua)")
                continue
            src_cols = {c["name"] for c in inspect(src).get_columns(t.name)}
            cols = [c for c in t.columns if c.name in src_cols]
            n = 0
            with src.connect() as sc:
                res = sc.execution_options(stream_results=True).execute(select(*[t.c[c.name] for c in cols]))
                while rows := res.fetchmany(BATCH):
                    conn.execute(t.insert(), [dict(r._mapping) for r in rows])
                    n += len(rows)
            print(f"  {t.name:<20} {n} dòng")

    # Kiểm tra lại số dòng
    bad = []
    with src.connect() as sc, dst.connect() as dc:
        for t in tables:
            if t.name not in src_tables:
                continue
            a_n = sc.scalar(select(func.count()).select_from(t))
            b_n = dc.scalar(select(func.count()).select_from(t))
            if a_n != b_n:
                bad.append(f"{t.name}: nguồn {a_n} ≠ đích {b_n}")
    if bad:
        sys.exit("Số dòng không khớp:\n  " + "\n  ".join(bad))
    print("Xong — số dòng mọi bảng đã khớp giữa nguồn và đích.")


if __name__ == "__main__":
    main()
