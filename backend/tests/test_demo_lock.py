"""Khoá tạo demo: nhiều tiến trình Vercel khởi động cùng lúc chỉ được 1 tiến trình tạo dữ liệu."""
import datetime as dt
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_lock_only_one_winner(client):
    import seed_demo

    seed_demo.release_lock("t1")
    assert seed_demo.acquire_lock("t1")
    assert not seed_demo.acquire_lock("t1")  # đang có người giữ
    seed_demo.release_lock("t1")
    assert seed_demo.acquire_lock("t1")
    seed_demo.release_lock("t1")


def test_lock_expires(client):
    import seed_demo

    seed_demo.release_lock("t2")
    assert seed_demo.acquire_lock("t2", ttl=dt.timedelta(seconds=-1))  # khoá đã hết hạn ngay
    assert seed_demo.acquire_lock("t2")  # tiến trình khác giành lại được khoá hết hạn
    seed_demo.release_lock("t2")


def test_parallel_acquire_single_winner(client):
    import seed_demo

    seed_demo.release_lock("t3")
    with ThreadPoolExecutor(8) as ex:
        wins = list(ex.map(lambda _: seed_demo.acquire_lock("t3"), range(8)))
    assert sum(wins) == 1
    seed_demo.release_lock("t3")
