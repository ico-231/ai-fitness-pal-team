"""Tạo ảnh màn chờ iOS (apple-touch-startup-image) từ CHÍNH màn khởi động trong index.html.

Đọc khối BOOT:CSS + BOOT:HTML trong index.html, dựng một trang tạm (bỏ vạch tải, tắt hiệu ứng), rồi dùng
Edge/Chrome chạy ngầm chụp ở đúng kích thước từng iPhone, bản sáng + tối. Nhờ vậy ảnh chờ và màn khởi động
trùng vị trí từng điểm ảnh: iOS hiện ảnh → app mở → màn khởi động thay chỗ mà không bị giật.

Chạy: python scripts/gen-splash.py   (cần Pillow + Edge hoặc Chrome). Ghi các thẻ <link> vào scripts/splash-links.html.
"""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "splash"
OUT.mkdir(exist_ok=True)

# (tên, rộng CSS, cao CSS, tỉ lệ điểm ảnh) — iPhone thường gặp (dọc)
DEVICES = [
    ("se", 375, 667, 2),        # SE 2/3, 8
    ("x", 375, 812, 3),         # X, XS, 11 Pro, 12/13 mini
    ("xr", 414, 896, 2),        # XR, 11
    ("xsmax", 414, 896, 3),     # XS Max, 11 Pro Max
    ("p12", 390, 844, 3),       # 12/13/14, 12 Pro
    ("p14pro", 393, 852, 3),    # 14 Pro, 15, 15 Pro, 16
    ("max12", 428, 926, 3),     # 12/13/14 Pro Max, 14 Plus
    ("max15", 430, 932, 3),     # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    ("p16pro", 402, 874, 3),    # 16 Pro
    ("max16", 440, 956, 3),     # 16 Pro Max
]
THEMES = ("light", "dark")

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    shutil.which("msedge") or "",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]
BROWSER = next((b for b in BROWSERS if b and Path(b).exists()), None)
if not BROWSER:
    raise SystemExit("Cần Edge hoặc Chrome để chụp màn chờ.")

index = (ROOT / "index.html").read_text(encoding="utf-8")
css = re.search(r"<!-- BOOT:CSS.*?-->(.*?)<!-- /BOOT:CSS -->", index, re.S).group(1)
html = re.search(r"<!-- BOOT:HTML -->(.*?)<!-- /BOOT:HTML -->", index, re.S).group(1)
fonts = re.search(r'<link href="(https://fonts\.googleapis\.com/[^"]+)"', index).group(1)
logo = (ROOT / "public" / "logo.png").as_uri()


def page(theme: str, w: int, h: int) -> str:
    # Trình duyệt chạy ngầm không cho cửa sổ hẹp hơn ~500px → dựng màn trong một khung đúng cỡ máy ở góc trên trái
    # (transform tạo khối chứa mới nên #boot `position: fixed` nằm gọn trong khung), rồi cắt ảnh theo khung.
    body = html.replace('src="/logo.png"', f'src="{logo}"').replace('id="boot"', 'id="boot" class="still"')
    return (f'<!doctype html><html data-theme="{theme}"><head><meta charset="utf-8">'
            f'<link href="{fonts}" rel="stylesheet">{css}'
            f'<style>html,body{{margin:0;overflow:hidden}} #dev{{position:absolute;left:0;top:0;width:{w}px;height:{h}px;'
            f'transform:translateZ(0);overflow:hidden}} #boot .b-stack{{margin-top:-{round(h * 0.04)}px}}</style></head>'
            f'<body><div id="dev">{body}</div></body></html>')


links = []
with tempfile.TemporaryDirectory() as tmp:
    for theme in THEMES:
        for name, w, h, r in DEVICES:
            src = Path(tmp) / f"boot-{name}-{theme}.html"
            src.write_text(page(theme, w, h), encoding="utf-8")
            shot = Path(tmp) / f"{name}-{theme}.png"
            subprocess.run([
                BROWSER, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                f"--user-data-dir={Path(tmp) / 'profile'}",
                f"--force-device-scale-factor={r}", f"--window-size={max(w, 600)},{h}",
                "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw",
                f"--screenshot={shot}", src.as_uri(),
            ], check=True, capture_output=True, timeout=120)
            im = Image.open(shot).convert("RGB")
            if im.size != (w * r, h * r):
                im = im.crop((0, 0, w * r, h * r))
            f = OUT / f"{name}-{theme}.png"
            im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)
            links.append(f'<link rel="apple-touch-startup-image" href="/splash/{name}-{theme}.png" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait) and (prefers-color-scheme: {theme})" />')

(ROOT / "scripts" / "splash-links.html").write_text("\n".join(links) + "\n", encoding="utf-8")
print(len(links), "anh;", sum(p.stat().st_size for p in OUT.glob("*.png")) // 1024, "KB")
