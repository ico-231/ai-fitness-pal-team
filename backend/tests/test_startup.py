"""Khởi động lạnh trên Vercel = thời gian nạp app. Thư viện openai tốn ~2 giây để nạp, nên chỉ được
nạp khi thật sự gọi AI — không được kéo vào lúc `import app.main`."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def test_importing_app_does_not_load_openai(tmp_path):
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{tmp_path / 'startup.db'}"}
    out = subprocess.run(
        [sys.executable, "-c", "import sys, app.main; print('openai' in sys.modules)"],
        cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120,
    )
    assert out.returncode == 0, out.stderr[-2000:]
    assert out.stdout.strip().splitlines()[-1] == "False", "app.main kéo theo openai lúc khởi động → khởi động lạnh chậm thêm ~2 giây"
